import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHandlers } from '../../src/dashboard/api/handlers.js';
import { FileSkillStore } from '../../src/skills/store.js';
import { TrustManager } from '../../src/skills/trust.js';

let dir: string;
let store: FileSkillStore;
let trust: TrustManager;
let handlers: ReturnType<typeof createHandlers>;
let currentState: 'on' | 'off';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'become-dash-'));
  store = new FileSkillStore({ baseDir: dir });
  trust = new TrustManager(dir);
  currentState = 'off';

  handlers = createHandlers({
    store,
    trust,
    getProxyStats: () => ({ requests_forwarded: 10, skills_injected: 5, lessons_extracted: 3, started_at: '2026-01-01' }),
    getState: () => currentState,
    setState: (s) => { currentState = s; },
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function saveSomeSkills() {
  const s1 = store.savePending({
    name: 'citations', instruction: 'Use IEEE format.', learned_from: 'agent-1',
    source: 'peer_review', confidence: 0.9, created_at: new Date().toISOString(),
  });
  const s2 = store.savePending({
    name: 'charts', instruction: 'Use bar charts.', learned_from: 'agent-2',
    source: 'conversation', confidence: 0.8, created_at: new Date().toISOString(),
  });
  return { s1: s1!, s2: s2! };
}

describe('GET /api/status', () => {
  it('returns status with counts', () => {
    saveSomeSkills();
    const result = handlers['GET /api/status']();
    expect(result.state).toBe('off');
    expect(result.pending_count).toBe(2);
    expect(result.skills_count).toBe(0);
    expect(result.proxy.requests_forwarded).toBe(10);
  });
});

describe('POST /api/state', () => {
  it('toggles state', () => {
    const result = handlers['POST /api/state']({ state: 'on' });
    expect(result.state).toBe('on');
    expect(currentState).toBe('on');
  });

  it('rejects invalid state', () => {
    const result = handlers['POST /api/state']({ state: 'maybe' });
    expect(result.error).toBeDefined();
  });
});

describe('GET /api/skills', () => {
  it('returns approved skills', () => {
    const { s1 } = saveSomeSkills();
    store.approve(s1.id);
    const result = handlers['GET /api/skills']();
    expect(result).toHaveLength(1);
    expect(result[0].instruction).toBe('Use IEEE format.');
  });
});

describe('GET /api/pending', () => {
  it('returns pending lessons', () => {
    saveSomeSkills();
    const result = handlers['GET /api/pending']();
    expect(result).toHaveLength(2);
  });
});

describe('POST /api/approve', () => {
  it('approves a pending lesson', () => {
    const { s1 } = saveSomeSkills();
    const result = handlers['POST /api/approve']({ id: s1.id });
    expect(result.ok).toBe(true);
    expect(store.listApproved()).toHaveLength(1);
    expect(store.listPending()).toHaveLength(1);
  });

  it('returns error for missing id', () => {
    const result = handlers['POST /api/approve']({});
    expect(result.error).toBeDefined();
  });

  it('returns error for nonexistent id', () => {
    const result = handlers['POST /api/approve']({ id: 'nope' });
    expect(result.error).toBe('not found');
  });
});

describe('POST /api/reject', () => {
  it('rejects a pending lesson', () => {
    const { s1 } = saveSomeSkills();
    handlers['POST /api/reject']({ id: s1.id });
    expect(store.listPending()).toHaveLength(1);
    expect(store.listRejected()).toHaveLength(1);
  });
});

describe('POST /api/disable', () => {
  it('disables an approved skill', () => {
    const { s1 } = saveSomeSkills();
    store.approve(s1.id);
    handlers['POST /api/disable']({ id: s1.id });
    expect(store.listApproved()).toHaveLength(0);
    expect(store.listRejected()).toHaveLength(1);
  });
});

describe('DELETE /api/skill', () => {
  it('removes a skill permanently', () => {
    const { s1 } = saveSomeSkills();
    handlers['DELETE /api/skill']({ id: s1.id });
    expect(store.listPending()).toHaveLength(1);
  });
});

describe('GET /api/trust', () => {
  it('returns trust config', () => {
    trust.setLevel('agent-1', 'trusted');
    const result = handlers['GET /api/trust']();
    expect(result.trusted).toContain('agent-1');
    expect(result.default).toBe('pending');
  });
});

describe('POST /api/trust', () => {
  it('sets trust level', () => {
    handlers['POST /api/trust']({ agent: 'agent-1', level: 'blocked' });
    expect(trust.getLevel('agent-1')).toBe('blocked');
  });

  it('rejects invalid level', () => {
    const result = handlers['POST /api/trust']({ agent: 'a', level: 'maybe' });
    expect(result.error).toBeDefined();
  });
});

describe('POST /api/trust/default', () => {
  it('sets default trust', () => {
    handlers['POST /api/trust/default']({ level: 'trusted' });
    expect(trust.getConfig().default).toBe('trusted');
  });
});

describe('GET /api/network', () => {
  it('aggregates lessons by agent', () => {
    const { s1, s2 } = saveSomeSkills();
    store.approve(s1.id);
    const result = handlers['GET /api/network']();
    expect(result['agent-1'].lessons).toBe(1);
    expect(result['agent-2'].lessons).toBe(1);
  });

  it('returns empty for no lessons', () => {
    const result = handlers['GET /api/network']();
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('GET /api/stats', () => {
  it('returns combined stats', () => {
    saveSomeSkills();
    const result = handlers['GET /api/stats']();
    expect(result.total_pending).toBe(2);
    expect(result.proxy.requests_forwarded).toBe(10);
  });
});
