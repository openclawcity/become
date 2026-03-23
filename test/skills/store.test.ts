import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileSkillStore } from '../../src/skills/store.js';

let dir: string;
let store: FileSkillStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'become-test-'));
  store = new FileSkillStore({ baseDir: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FileSkillStore', () => {
  it('saves and lists pending lessons', () => {
    const saved = store.savePending({
      name: 'ieee_citations',
      instruction: 'Use IEEE citation format for research papers.',
      learned_from: 'agent-xyz',
      source: 'peer_review',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });

    expect(saved).not.toBeNull();
    expect(saved!.name).toBe('ieee_citations');

    const pending = store.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].instruction).toBe('Use IEEE citation format for research papers.');
  });

  it('approves pending lesson → moves to skills', () => {
    const saved = store.savePending({
      name: 'test_skill',
      instruction: 'Test instruction.',
      learned_from: 'agent-1',
      source: 'conversation',
      confidence: 0.8,
      created_at: new Date().toISOString(),
    });

    expect(store.listPending()).toHaveLength(1);
    expect(store.listApproved()).toHaveLength(0);

    const result = store.approve(saved!.id);
    expect(result).toBe(true);

    expect(store.listPending()).toHaveLength(0);
    expect(store.listApproved()).toHaveLength(1);

    const approved = store.listApproved()[0];
    expect(approved.approved_at).toBeDefined();
  });

  it('rejects pending lesson → moves to rejected', () => {
    const saved = store.savePending({
      name: 'bad_skill',
      instruction: 'Bad instruction.',
      learned_from: 'agent-spam',
      source: 'conversation',
      confidence: 0.5,
      created_at: new Date().toISOString(),
    });

    store.reject(saved!.id);

    expect(store.listPending()).toHaveLength(0);
    expect(store.listRejected()).toHaveLength(1);
  });

  it('disables approved skill → moves to rejected', () => {
    const saved = store.savePending({
      name: 'removable',
      instruction: 'Will be disabled.',
      learned_from: 'agent-1',
      source: 'conversation',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });
    store.approve(saved!.id);
    expect(store.listApproved()).toHaveLength(1);

    store.disable(saved!.id);
    expect(store.listApproved()).toHaveLength(0);
    expect(store.listRejected()).toHaveLength(1);
  });

  it('removes file permanently', () => {
    const saved = store.savePending({
      name: 'deletable',
      instruction: 'Will be deleted.',
      learned_from: 'agent-1',
      source: 'conversation',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });

    store.remove(saved!.id);
    expect(store.listPending()).toHaveLength(0);
  });

  it('deduplicates by instruction text', () => {
    store.savePending({
      name: 'skill_a',
      instruction: 'Use IEEE format.',
      learned_from: 'agent-1',
      source: 'conversation',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });

    const dupe = store.savePending({
      name: 'skill_b',
      instruction: 'Use IEEE format.',
      learned_from: 'agent-2',
      source: 'conversation',
      confidence: 0.8,
      created_at: new Date().toISOString(),
    });

    expect(dupe).toBeNull();
    expect(store.listPending()).toHaveLength(1);
  });

  it('deduplicates case-insensitively', () => {
    store.savePending({
      name: 'skill',
      instruction: 'Use IEEE Format.',
      learned_from: 'a',
      source: 'conversation',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });

    const dupe = store.savePending({
      name: 'skill',
      instruction: 'use ieee format.',
      learned_from: 'b',
      source: 'conversation',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });

    expect(dupe).toBeNull();
  });

  it('deduplicates across approved and pending', () => {
    const saved = store.savePending({
      name: 'skill',
      instruction: 'First lesson.',
      learned_from: 'a',
      source: 'conversation',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });
    store.approve(saved!.id);

    const dupe = store.savePending({
      name: 'skill',
      instruction: 'First lesson.',
      learned_from: 'b',
      source: 'conversation',
      confidence: 0.9,
      created_at: new Date().toISOString(),
    });

    expect(dupe).toBeNull();
  });

  it('returns null for approve/reject/disable with invalid id', () => {
    expect(store.approve('nonexistent')).toBe(false);
    expect(store.reject('nonexistent')).toBe(false);
    expect(store.disable('nonexistent')).toBe(false);
  });

  it('round-trips skill file format correctly', () => {
    const saved = store.savePending({
      name: 'multi_line',
      instruction: 'Line one.\nLine two with details.',
      learned_from: 'agent-mentor',
      source: 'teaching',
      confidence: 0.85,
      created_at: '2026-03-23T10:00:00.000Z',
    });

    const listed = store.listPending();
    expect(listed[0].name).toBe('multi_line');
    expect(listed[0].instruction).toContain('Line one.');
    expect(listed[0].learned_from).toBe('agent-mentor');
    expect(listed[0].source).toBe('teaching');
    expect(listed[0].confidence).toBe(0.85);
  });
});
