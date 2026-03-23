import { describe, it, expect, beforeEach } from 'vitest';
import { NormDetector, normalizeCategory } from '../../src/social/norms.js';
import { MemoryStore } from '../../src/adapters/memory.js';

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
});

describe('normalizeCategory', () => {
  it('maps canonical names directly', () => {
    expect(normalizeCategory('language_evolution')).toBe('language_evolution');
    expect(normalizeCategory('culture_formation')).toBe('culture_formation');
    expect(normalizeCategory('social_structure')).toBe('social_structure');
    expect(normalizeCategory('protocol_emergence')).toBe('protocol_emergence');
    expect(normalizeCategory('self_awareness')).toBe('self_awareness');
    expect(normalizeCategory('collective_intelligence')).toBe('collective_intelligence');
    expect(normalizeCategory('emotional_emergence')).toBe('emotional_emergence');
    expect(normalizeCategory('creative_evolution')).toBe('creative_evolution');
  });

  it('maps space-separated canonical names', () => {
    expect(normalizeCategory('language evolution')).toBe('language_evolution');
    expect(normalizeCategory('Culture Formation')).toBe('culture_formation');
  });

  it('maps variants to canonical', () => {
    expect(normalizeCategory('lexicon crystallization')).toBe('language_evolution');
    expect(normalizeCategory('role crystallization')).toBe('culture_formation');
    expect(normalizeCategory('hub magnetization')).toBe('social_structure');
    expect(normalizeCategory('protocol crystallization')).toBe('protocol_emergence');
    expect(normalizeCategory('meta-linguistic awareness')).toBe('self_awareness');
    expect(normalizeCategory('swarm behavior')).toBe('collective_intelligence');
    expect(normalizeCategory('sentiment drift')).toBe('emotional_emergence');
    expect(normalizeCategory('artistic drift')).toBe('creative_evolution');
  });

  it('is case-insensitive', () => {
    expect(normalizeCategory('LANGUAGE EVOLUTION')).toBe('language_evolution');
    expect(normalizeCategory('Swarm Behavior')).toBe('collective_intelligence');
  });

  it('falls back to partial match', () => {
    expect(normalizeCategory('some language thing')).toBe('language_evolution');
    expect(normalizeCategory('creative something')).toBe('creative_evolution');
  });

  it('defaults to culture_formation for unknown', () => {
    expect(normalizeCategory('completely unknown category xyz')).toBe('culture_formation');
  });
});

describe('NormDetector', () => {
  it('returns empty for too few activities', async () => {
    const detector = new NormDetector(store, { analyze: async () => '[]' });
    const norms = await detector.detect([
      { agent_id: 'a', agent_name: 'A', action: 'chat', timestamp: new Date().toISOString() },
    ]);
    expect(norms).toHaveLength(0);
  });

  it('detects norms from LLM analysis', async () => {
    const llm = {
      analyze: async () => JSON.stringify([{
        title: 'Greeting Protocol',
        description: 'Agents greet each other with "hello fellow agent" consistently',
        category: 'protocol_emergence',
        significance: 3,
        evidence: [{ agent_name: 'agent-1', quote: 'hello fellow agent' }],
      }]),
    };
    const detector = new NormDetector(store, llm);

    const activities = Array.from({ length: 10 }, (_, i) => ({
      agent_id: `agent-${i}`,
      agent_name: `Agent ${i}`,
      action: 'chat',
      content: 'hello fellow agent',
      timestamp: new Date().toISOString(),
    }));

    const norms = await detector.detect(activities);
    expect(norms).toHaveLength(1);
    expect(norms[0].title).toBe('Greeting Protocol');
    expect(norms[0].category).toBe('protocol_emergence');
    expect(norms[0].significance).toBe(3);
  });

  it('deduplicates against existing norms', async () => {
    // Pre-save a norm
    await store.saveNorm({
      id: 'existing',
      title: 'Greeting Protocol',
      description: 'existing',
      category: 'protocol_emergence',
      significance: 2,
      evidence: [],
      adopter_count: 3,
      first_observed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const llm = {
      analyze: async () => JSON.stringify([{
        title: 'Greeting Protocol',
        description: 'same norm again',
        category: 'protocol_emergence',
        significance: 3,
        evidence: [],
      }]),
    };
    const detector = new NormDetector(store, llm);

    const activities = Array.from({ length: 10 }, (_, i) => ({
      agent_id: `agent-${i}`,
      agent_name: `Agent ${i}`,
      action: 'chat',
      timestamp: new Date().toISOString(),
    }));

    const norms = await detector.detect(activities);
    expect(norms).toHaveLength(0); // Deduplicated
  });

  it('caps at 3 norms per detection', async () => {
    const llm = {
      analyze: async () => JSON.stringify([
        { title: 'Norm 1', description: 'd', category: 'language_evolution', significance: 1, evidence: [] },
        { title: 'Norm 2', description: 'd', category: 'culture_formation', significance: 1, evidence: [] },
        { title: 'Norm 3', description: 'd', category: 'social_structure', significance: 1, evidence: [] },
        { title: 'Norm 4', description: 'd', category: 'protocol_emergence', significance: 1, evidence: [] },
      ]),
    };
    const detector = new NormDetector(store, llm);

    const activities = Array.from({ length: 10 }, (_, i) => ({
      agent_id: `a${i}`, agent_name: `A${i}`, action: 'x', timestamp: new Date().toISOString(),
    }));

    const norms = await detector.detect(activities);
    expect(norms.length).toBeLessThanOrEqual(3);
  });

  it('handles LLM errors gracefully', async () => {
    const llm = { analyze: async () => { throw new Error('API down'); } };
    const detector = new NormDetector(store, llm);

    const activities = Array.from({ length: 10 }, (_, i) => ({
      agent_id: `a${i}`, agent_name: `A${i}`, action: 'x', timestamp: new Date().toISOString(),
    }));

    const norms = await detector.detect(activities);
    expect(norms).toHaveLength(0);
  });

  it('clamps significance to 1-5', async () => {
    const llm = {
      analyze: async () => JSON.stringify([{
        title: 'Extreme Norm', description: 'd', category: 'language_evolution',
        significance: 99, evidence: [{ agent_name: 'a' }],
      }]),
    };
    const detector = new NormDetector(store, llm);

    const activities = Array.from({ length: 10 }, (_, i) => ({
      agent_id: `a${i}`, agent_name: `A${i}`, action: 'x', timestamp: new Date().toISOString(),
    }));

    const norms = await detector.detect(activities);
    expect(norms[0].significance).toBe(5);
  });
});

describe('NormDetector.adoption', () => {
  it('returns adoption metrics', async () => {
    await store.saveNorm({
      id: 'n1', title: 'Test', description: 'd', category: 'language_evolution',
      significance: 2, evidence: [], adopter_count: 10,
      first_observed_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    const detector = new NormDetector(store, { analyze: async () => '[]' });
    const metrics = await detector.adoption('n1');
    expect(metrics).not.toBeNull();
    expect(metrics!.adopter_count).toBe(10);
    expect(metrics!.growth_rate).toBeCloseTo(1, 0); // ~1 adopter/day
  });

  it('returns null for unknown norm', async () => {
    const detector = new NormDetector(store, { analyze: async () => '[]' });
    expect(await detector.adoption('nonexistent')).toBeNull();
  });
});
