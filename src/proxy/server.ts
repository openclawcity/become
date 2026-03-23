import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { FileSkillStore } from '../skills/store.js';
import { TrustManager } from '../skills/trust.js';
import { formatSkillsForInjection, injectSkillsIntoMessages } from '../skills/format.js';
import { LessonExtractor } from './extractor.js';
import type { ConversationAnalyzer } from '../learn/agent-conversations.js';

export interface ProxyConfig {
  port: number;
  llm_base_url: string;
  llm_api_key: string;
  llm_provider: 'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'custom';
  baseDir: string;
  max_skills_per_call: number;
  auto_extract: boolean;
}

export interface ProxyStats {
  requests_forwarded: number;
  skills_injected: number;
  lessons_extracted: number;
  started_at: string;
}

export function createProxyServer(config: ProxyConfig, analyzer?: ConversationAnalyzer) {
  const store = new FileSkillStore({ baseDir: config.baseDir });
  const trust = new TrustManager(config.baseDir);
  const extractor = analyzer ? new LessonExtractor(store, trust, analyzer) : null;

  const stats: ProxyStats = {
    requests_forwarded: 0,
    skills_injected: 0,
    lessons_extracted: 0,
    started_at: new Date().toISOString(),
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', ...stats }));
      return;
    }

    // Only proxy POST requests to LLM endpoints
    const isOpenAI = req.url === '/v1/chat/completions';
    const isAnthropic = req.url === '/v1/messages';

    if (req.method !== 'POST' || (!isOpenAI && !isAnthropic)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /v1/chat/completions or /v1/messages' }));
      return;
    }

    try {
      // Read request body
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody);

      // Extract messages for injection
      const messages = body.messages;
      if (Array.isArray(messages)) {
        // Inject approved skills
        const skills = store.listApproved().slice(0, config.max_skills_per_call);
        if (skills.length > 0) {
          const skillText = formatSkillsForInjection(skills);
          injectSkillsIntoMessages(messages, skillText);
          stats.skills_injected++;
        }
      }

      // Build upstream URL
      const upstreamUrl = buildUpstreamUrl(config, req.url!);

      // Build upstream headers
      const upstreamHeaders = buildUpstreamHeaders(config, req.headers);

      // Forward to real LLM
      const isStreaming = body.stream === true;
      const modifiedBody = JSON.stringify(body);

      const upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: modifiedBody,
      });

      stats.requests_forwarded++;

      // Forward response headers
      res.writeHead(upstreamRes.status, Object.fromEntries(upstreamRes.headers.entries()));

      if (isStreaming && upstreamRes.body) {
        // Stream: pipe chunks directly, collect for extraction
        const reader = upstreamRes.body.getReader();
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
            if (config.auto_extract && extractor) chunks.push(value);
          }
        } finally {
          res.end();
        }

        // Async extraction from streamed response
        if (config.auto_extract && extractor && Array.isArray(messages)) {
          const responseText = new TextDecoder().decode(concatUint8Arrays(chunks));
          extractor.extract(messages).catch(() => {});
          stats.lessons_extracted++;
        }
      } else {
        // Non-streaming: read full response, return it, then extract
        const responseBuffer = await upstreamRes.arrayBuffer();
        res.end(Buffer.from(responseBuffer));

        // Async extraction
        if (config.auto_extract && extractor && Array.isArray(messages)) {
          extractor.extract(messages).catch(() => {});
          stats.lessons_extracted++;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal proxy error';
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    }
  });

  return {
    server,
    stats,
    store,
    trust,
    listen: (port?: number) => {
      const p = port ?? config.port;
      return new Promise<void>((resolve) => {
        server.listen(p, '127.0.0.1', () => resolve());
      });
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 10 * 1024 * 1024; // 10MB
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function buildUpstreamUrl(config: ProxyConfig, path: string): string {
  let base = config.llm_base_url.replace(/\/+$/, '');

  if (config.llm_provider === 'anthropic' && path === '/v1/messages') {
    // Anthropic API endpoint
    return `${base}/v1/messages`;
  }
  if (config.llm_provider === 'anthropic' && path === '/v1/chat/completions') {
    // Agent using OpenAI format but provider is Anthropic — forward to messages
    return `${base}/v1/messages`;
  }

  // OpenAI-compatible
  return `${base}${path}`;
}

function buildUpstreamHeaders(
  config: ProxyConfig,
  incomingHeaders: IncomingMessage['headers'],
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.llm_provider === 'anthropic') {
    headers['x-api-key'] = config.llm_api_key;
    headers['anthropic-version'] = '2023-06-01';
    // Forward anthropic-specific headers from agent
    const version = incomingHeaders['anthropic-version'];
    if (typeof version === 'string') headers['anthropic-version'] = version;
    const beta = incomingHeaders['anthropic-beta'];
    if (typeof beta === 'string') headers['anthropic-beta'] = beta;
  } else {
    headers['Authorization'] = `Bearer ${config.llm_api_key}`;
  }

  // Forward accept header for streaming
  const accept = incomingHeaders['accept'];
  if (typeof accept === 'string') headers['Accept'] = accept;

  return headers;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
