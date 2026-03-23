import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDashboardServer } from '../../src/dashboard/server.js';
import { FileSkillStore } from '../../src/skills/store.js';
import { TrustManager } from '../../src/skills/trust.js';

let dir: string;
let store: FileSkillStore;
let trust: TrustManager;
let dash: ReturnType<typeof createDashboardServer>;
let port: number;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'become-dashsrv-'));
  store = new FileSkillStore({ baseDir: dir });
  trust = new TrustManager(dir);

  dash = createDashboardServer({
    store,
    trust,
    getProxyStats: () => ({ requests_forwarded: 0, skills_injected: 0, lessons_extracted: 0, started_at: '' }),
    getState: () => 'off',
    setState: () => {},
  });
  await dash.listen(0);
  port = (dash.server.address() as any).port;
});

afterEach(async () => {
  await dash.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Dashboard Server', () => {
  it('serves HTML at root', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('become');
    expect(html).toContain('agent-to-agent learning');
  });

  it('serves API status', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.state).toBe('off');
    expect(data.skills_count).toBe(0);
  });

  it('approve/reject flow works end-to-end', async () => {
    // Save a pending lesson
    const saved = store.savePending({
      name: 'test', instruction: 'Test lesson.', learned_from: 'agent-1',
      source: 'conversation', confidence: 0.9, created_at: new Date().toISOString(),
    });

    // List pending
    let res = await fetch(`http://127.0.0.1:${port}/api/pending`);
    let data = await res.json();
    expect(data).toHaveLength(1);

    // Approve
    res = await fetch(`http://127.0.0.1:${port}/api/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: saved!.id }),
    });
    data = await res.json();
    expect(data.ok).toBe(true);

    // Now skills has 1, pending has 0
    res = await fetch(`http://127.0.0.1:${port}/api/skills`);
    data = await res.json();
    expect(data).toHaveLength(1);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/nope`);
    expect(res.status).toBe(404);
  });

  it('handles CORS preflight for localhost', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://localhost:30002' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:30002');
  });

  it('blocks CORS from external origins', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      headers: { 'Origin': 'https://evil-site.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all!!!',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON body');
  });

  it('returns error when setState fails', async () => {
    const failDash = createDashboardServer({
      store,
      trust,
      getProxyStats: () => null,
      getState: () => 'off',
      setState: () => { throw new Error('OpenClaw not installed'); },
    });
    await failDash.listen(0);
    const failPort = (failDash.server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${failPort}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'on' }),
      });
      const data = await res.json();
      expect(data.error).toContain('OpenClaw not installed');
    } finally {
      await failDash.close();
    }
  });
});
