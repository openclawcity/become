import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { FileSkillStore } from '../skills/store.js';
import { TrustManager } from '../skills/trust.js';
import { formatSkillsForInjection, injectSkillsIntoMessages } from '../skills/format.js';
import { LessonExtractor } from './extractor.js';
import type { ConversationAnalyzer } from '../learn/agent-conversations.js';
import type { SkillFile } from '../skills/store.js';

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

const SKILL_CACHE_TTL_MS = 5000; // Refresh skill cache every 5 seconds

export function createProxyServer(config: ProxyConfig, analyzer?: ConversationAnalyzer, overrideUpstreamUrl?: string) {
  const store = new FileSkillStore({ baseDir: config.baseDir });
  const trust = new TrustManager(config.baseDir);
  const extractor = analyzer ? new LessonExtractor(store, trust, analyzer) : null;

  const stats: ProxyStats = {
    requests_forwarded: 0,
    skills_injected: 0,
    lessons_extracted: 0,
    started_at: new Date().toISOString(),
  };

  // Skill cache — avoid reading disk on every request
  let cachedSkills: SkillFile[] = [];
  let cacheTimestamp = 0;

  function getSkills(): SkillFile[] {
    const now = Date.now();
    if (now - cacheTimestamp > SKILL_CACHE_TTL_MS) {
      cachedSkills = store.listApproved();
      cacheTimestamp = now;
    }
    return cachedSkills;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    console.log(`[become] ${req.method} ${req.url}`);

    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', ...stats }));
      return;
    }

    // Proxy any POST request that looks like an LLM API call
    // Different providers use different paths:
    //   OpenAI/OpenRouter: /v1/chat/completions or /chat/completions or /api/v1/chat/completions
    //   Anthropic: /v1/messages or /messages
    //   Some proxies: just /
    const url = req.url ?? '';
    const isLLMRequest = req.method === 'POST' && (
      url.includes('/chat/completions') ||
      url.includes('/messages') ||
      url === '/' ||
      url.startsWith('/v1')
    );

    if (!isLLMRequest) {
      // Log the rejected path so users can debug
      console.log(`[become] rejected: ${req.method} ${url}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Not an LLM endpoint: ${req.method} ${url}` }));
      return;
    }

    try {
      // Read request body
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody);

      // Extract messages for injection
      const messages = body.messages;
      if (Array.isArray(messages)) {
        // Inject approved skills from cache
        const skills = getSkills().slice(0, config.max_skills_per_call);
        if (skills.length > 0) {
          const skillText = formatSkillsForInjection(skills);
          injectSkillsIntoMessages(messages, skillText);
          stats.skills_injected++;
        }
      }

      // Build upstream URL from the original provider URL (not the become config)
      const upstreamUrl = buildUpstreamUrl(overrideUpstreamUrl ?? config.llm_base_url, req.url!);

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

      // Forward response headers (filter out transfer-encoding to avoid mismatch)
      const responseHeaders: Record<string, string> = {};
      upstreamRes.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          responseHeaders[key] = value;
        }
      });
      res.writeHead(upstreamRes.status, responseHeaders);

      if (isStreaming && upstreamRes.body) {
        // Stream: pipe chunks directly to client — do NOT buffer
        const reader = upstreamRes.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          res.end();
        }

        // Async extraction — uses request messages only, not the response
        if (config.auto_extract && extractor && Array.isArray(messages)) {
          extractor.extract(messages)
            .then(() => { stats.lessons_extracted++; })
            .catch(() => {});
        }
      } else {
        // Non-streaming: read full response, return it, then extract
        const responseBuffer = await upstreamRes.arrayBuffer();
        res.end(Buffer.from(responseBuffer));

        // Async extraction
        if (config.auto_extract && extractor && Array.isArray(messages)) {
          extractor.extract(messages)
            .then(() => { stats.lessons_extracted++; })
            .catch(() => {});
        }
      }
    } catch (err) {
      // Sanitize error — never leak upstream details to client
      const safeMessage = err instanceof Error && err.message === 'Request body too large'
        ? 'Request body too large'
        : 'Failed to forward request to LLM';

      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      // Always end the response, even if headers were already sent
      res.end(JSON.stringify({ error: safeMessage }));
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

function buildUpstreamUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');

  // Forward to the matching upstream endpoint.
  // If agent sends /v1/messages → forward to /v1/messages (Anthropic format)
  // If agent sends /v1/chat/completions → forward to /v1/chat/completions (OpenAI format)
  // The agent is responsible for using the correct format for its provider.
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
