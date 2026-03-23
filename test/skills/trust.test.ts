import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TrustManager } from '../../src/skills/trust.js';

let dir: string;
let trust: TrustManager;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'become-trust-'));
  trust = new TrustManager(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('TrustManager', () => {
  it('defaults to pending for unknown agents', () => {
    expect(trust.getLevel('unknown-agent')).toBe('pending');
  });

  it('sets and gets trust levels', () => {
    trust.setLevel('agent-friend', 'trusted');
    trust.setLevel('agent-spam', 'blocked');

    expect(trust.getLevel('agent-friend')).toBe('trusted');
    expect(trust.getLevel('agent-spam')).toBe('blocked');
    expect(trust.getLevel('agent-other')).toBe('pending');
  });

  it('removes from previous list when changing level', () => {
    trust.setLevel('agent-1', 'trusted');
    expect(trust.getLevel('agent-1')).toBe('trusted');

    trust.setLevel('agent-1', 'blocked');
    expect(trust.getLevel('agent-1')).toBe('blocked');

    const config = trust.getConfig();
    expect(config.trusted).not.toContain('agent-1');
    expect(config.blocked).toContain('agent-1');
  });

  it('persists across instances', () => {
    trust.setLevel('agent-1', 'trusted');

    const trust2 = new TrustManager(dir);
    expect(trust2.getLevel('agent-1')).toBe('trusted');
  });

  it('enforces daily rate limits', () => {
    const limits = { max_lessons_per_day: 3, max_lessons_per_agent: 2, max_skills_per_call: 15 };

    expect(trust.canLearn('agent-1', limits)).toBe(true);
    trust.recordLesson('agent-1');
    trust.recordLesson('agent-1');

    // Per-agent limit hit
    expect(trust.canLearn('agent-1', limits)).toBe(false);

    // Different agent still OK
    expect(trust.canLearn('agent-2', limits)).toBe(true);
    trust.recordLesson('agent-2');

    // Daily limit hit (3 total)
    expect(trust.canLearn('agent-3', limits)).toBe(false);
  });

  it('sets default trust level', () => {
    trust.setDefault('trusted');
    expect(trust.getLevel('new-agent')).toBe('trusted');
    expect(trust.getConfig().default).toBe('trusted');
  });
});
