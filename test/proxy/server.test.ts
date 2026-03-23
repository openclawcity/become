import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createProxyServer } from '../../src/proxy/server.js';
import { FileSkillStore } from '../../src/skills/store.js';

let dir: string;
let fakeUpstream: ReturnType<typeof createServer>;
let fakeUpstreamPort: number;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'become-proxy-'));

  // Create a fake upstream LLM server
  fakeUpstream = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Echo back the messages to verify injection
      const parsed = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'LLM response' } }],
        _echoed_messages: parsed.messages,
      }));
    });
  });

  await new Promise<void>((resolve) => {
    fakeUpstream.listen(0, '127.0.0.1', () => {
      const addr = fakeUpstream.address();
      fakeUpstreamPort = typeof addr === 'object' ? addr!.port : 0;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => fakeUpstream.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe('Proxy Server', () => {
  it('forwards request to upstream and returns response', async () => {
    const proxy = createProxyServer({
      port: 0,
      llm_base_url: `http://127.0.0.1:${fakeUpstreamPort}`,
      llm_api_key: 'test-key',
      llm_provider: 'openai',
      baseDir: dir,
      max_skills_per_call: 15,
      auto_extract: false,
    });
    await proxy.listen(0);
    const proxyPort = (proxy.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hello' },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.choices[0].message.content).toBe('LLM response');
      expect(proxy.stats.requests_forwarded).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('injects approved skills into system message', async () => {
    // Save an approved skill
    const store = new FileSkillStore({ baseDir: dir });
    const saved = store.savePending({
      name: 'test_skill',
      instruction: 'Use IEEE citations.',
      learned_from: 'agent-1',
      source: 'peer_review',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });
    store.approve(saved!.id);

    const proxy = createProxyServer({
      port: 0,
      llm_base_url: `http://127.0.0.1:${fakeUpstreamPort}`,
      llm_api_key: 'test-key',
      llm_provider: 'openai',
      baseDir: dir,
      max_skills_per_call: 15,
      auto_extract: false,
    });
    await proxy.listen(0);
    const proxyPort = (proxy.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Write a paper.' },
          ],
        }),
      });

      const data = await res.json();
      // The echoed messages should have skills injected into system
      const sysMsg = data._echoed_messages[0].content;
      expect(sysMsg).toContain('Lessons learned from other agents');
      expect(sysMsg).toContain('Use IEEE citations.');
      expect(sysMsg).toContain('You are helpful.');
    } finally {
      await proxy.close();
    }
  });

  it('passes through when no skills exist', async () => {
    const proxy = createProxyServer({
      port: 0,
      llm_base_url: `http://127.0.0.1:${fakeUpstreamPort}`,
      llm_api_key: 'test-key',
      llm_provider: 'openai',
      baseDir: dir,
      max_skills_per_call: 15,
      auto_extract: false,
    });
    await proxy.listen(0);
    const proxyPort = (proxy.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'Original system.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      });

      const data = await res.json();
      const sysMsg = data._echoed_messages[0].content;
      expect(sysMsg).toBe('Original system.');
      expect(proxy.stats.skills_injected).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const proxy = createProxyServer({
      port: 0,
      llm_base_url: `http://127.0.0.1:${fakeUpstreamPort}`,
      llm_api_key: 'test-key',
      llm_provider: 'openai',
      baseDir: dir,
      max_skills_per_call: 15,
      auto_extract: false,
    });
    await proxy.listen(0);
    const proxyPort = (proxy.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/random`, { method: 'POST' });
      expect(res.status).toBe(404);
    } finally {
      await proxy.close();
    }
  });

  it('health endpoint returns stats', async () => {
    const proxy = createProxyServer({
      port: 0,
      llm_base_url: `http://127.0.0.1:${fakeUpstreamPort}`,
      llm_api_key: 'test-key',
      llm_provider: 'openai',
      baseDir: dir,
      max_skills_per_call: 15,
      auto_extract: false,
    });
    await proxy.listen(0);
    const proxyPort = (proxy.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.requests_forwarded).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  it('handles upstream errors gracefully', async () => {
    const proxy = createProxyServer({
      port: 0,
      llm_base_url: 'http://127.0.0.1:1', // unreachable
      llm_api_key: 'test-key',
      llm_provider: 'openai',
      baseDir: dir,
      max_skills_per_call: 15,
      auto_extract: false,
    });
    await proxy.listen(0);
    const proxyPort = (proxy.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });
      expect(res.status).toBe(502);

      // Bug #8: Error message should be sanitized — no internal details
      const data = await res.json();
      expect(data.error).toBe('Failed to forward request to LLM');
      expect(data.error).not.toContain('127.0.0.1');
      expect(data.error).not.toContain('ECONNREFUSED');
    } finally {
      await proxy.close();
    }
  });

  it('respects max_skills_per_call limit', async () => {
    const store = new FileSkillStore({ baseDir: dir });
    // Save 5 skills
    for (let i = 0; i < 5; i++) {
      const saved = store.savePending({
        name: `skill_${i}`,
        instruction: `Unique lesson ${i}.`,
        learned_from: 'agent-1',
        source: 'conversation',
        confidence: 0.9,
        created_at: new Date().toISOString(),
      });
      store.approve(saved!.id);
    }

    const proxy = createProxyServer({
      port: 0,
      llm_base_url: `http://127.0.0.1:${fakeUpstreamPort}`,
      llm_api_key: 'test-key',
      llm_provider: 'openai',
      baseDir: dir,
      max_skills_per_call: 2, // Only inject 2
      auto_extract: false,
    });
    await proxy.listen(0);
    const proxyPort = (proxy.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'Original.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      });
      const data = await res.json();
      const sysMsg = data._echoed_messages[0].content;
      // Should only contain 2 lessons, not all 5
      const lessonLines = sysMsg.split('\n').filter((l: string) => l.startsWith('- '));
      expect(lessonLines.length).toBeLessThanOrEqual(2);
    } finally {
      await proxy.close();
    }
  });
});
