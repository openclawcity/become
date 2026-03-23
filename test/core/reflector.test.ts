import { describe, it, expect, beforeEach } from 'vitest';
import { Reflector, detectCreativeMismatch, detectCollaborationGap, detectReactionDisparity, detectIdleCreative, detectQuestStreak, detectSoloCreator, detectProlificCollaborator, detectSymbolicVocabulary, detectCollectiveMemory, detectCulturalOutlier } from '../../src/core/reflector.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { AgentContext } from '../../src/core/types.js';

let store: MemoryStore;
let reflector: Reflector;

const BASE_CTX: AgentContext = {
  agent_id: 'agent-1',
  declared_role: 'agent-explorer',
  artifacts: [],
  collabs_started: 0,
  collabs_completed: 0,
  skills: [],
  quest_completions: 0,
  follower_count: 0,
};

beforeEach(() => {
  store = new MemoryStore();
  reflector = new Reflector(store);
});

describe('reflect', () => {
  it('saves a valid reflection', async () => {
    const r = await reflector.reflect('agent-1', {
      skill: 'debugging',
      reflection: 'I learned that print statements help me trace issues faster than step debugging.',
    });
    expect(r.id).toBeDefined();
    expect(r.skill).toBe('debugging');
  });

  it('rejects too short reflection', async () => {
    await expect(reflector.reflect('agent-1', {
      skill: 'debugging',
      reflection: 'too short',
    })).rejects.toThrow('too short');
  });

  it('rejects too long reflection', async () => {
    await expect(reflector.reflect('agent-1', {
      skill: 'debugging',
      reflection: 'a'.repeat(2001),
    })).rejects.toThrow('too long');
  });

  it('rejects invalid skill name', async () => {
    await expect(reflector.reflect('agent-1', {
      skill: 'invalid skill name!',
      reflection: 'This is a valid reflection text for testing.',
    })).rejects.toThrow('Invalid skill name');
  });

  it('strips HTML tags', async () => {
    const r = await reflector.reflect('agent-1', {
      skill: 'debugging',
      reflection: '<script>alert("xss")</script>This is a safe reflection that should pass.',
    });
    expect(r.reflection).not.toContain('<script>');
  });

  it('lists reflections', async () => {
    await reflector.reflect('agent-1', { skill: 'debugging', reflection: 'First reflection about debugging techniques.' });
    await reflector.reflect('agent-1', { skill: 'debugging', reflection: 'Second reflection about debugging techniques.' });
    await reflector.reflect('agent-1', { skill: 'testing', reflection: 'Reflection about testing strategies and approaches.' });

    const all = await reflector.list('agent-1');
    expect(all).toHaveLength(3);

    const debugOnly = await reflector.list('agent-1', { skill: 'debugging' });
    expect(debugOnly).toHaveLength(2);
  });
});

describe('observation rules', () => {
  it('detectCreativeMismatch fires when top type differs from role', () => {
    const ctx = { ...BASE_CTX, artifacts: [
      { type: 'music' }, { type: 'music' }, { type: 'music' }, { type: 'image' },
    ]};
    const obs = detectCreativeMismatch(ctx);
    expect(obs).not.toBeNull();
    expect(obs!.type).toBe('creative_mismatch');
    expect(obs!.text).toContain('music');
  });

  it('detectCreativeMismatch does not fire when types match', () => {
    const ctx = { ...BASE_CTX, declared_role: 'agent-music', artifacts: [
      { type: 'music' }, { type: 'music' }, { type: 'music' },
    ]};
    expect(detectCreativeMismatch(ctx)).toBeNull();
  });

  it('detectCreativeMismatch does not fire with < 3 artifacts', () => {
    const ctx = { ...BASE_CTX, artifacts: [{ type: 'music' }, { type: 'music' }]};
    expect(detectCreativeMismatch(ctx)).toBeNull();
  });

  it('detectCollaborationGap fires when many started, few completed', () => {
    const ctx = { ...BASE_CTX, collabs_started: 6, collabs_completed: 1 };
    const obs = detectCollaborationGap(ctx);
    expect(obs).not.toBeNull();
    expect(obs!.type).toBe('collaboration_gap');
  });

  it('detectCollaborationGap does not fire when ratio is good', () => {
    const ctx = { ...BASE_CTX, collabs_started: 6, collabs_completed: 4 };
    expect(detectCollaborationGap(ctx)).toBeNull();
  });

  it('detectReactionDisparity fires on heavy skew', () => {
    const ctx = { ...BASE_CTX, artifacts: [
      { type: 'music' }, { type: 'music' }, { type: 'music' },
      { type: 'music' }, { type: 'image' },
    ]};
    const obs = detectReactionDisparity(ctx);
    expect(obs).not.toBeNull();
  });

  it('detectIdleCreative fires with skills but no artifacts', () => {
    const ctx = { ...BASE_CTX, skills: ['debugging', 'testing'] };
    const obs = detectIdleCreative(ctx);
    expect(obs).not.toBeNull();
    expect(obs!.type).toBe('idle_creative');
  });

  it('detectIdleCreative does not fire with artifacts', () => {
    const ctx = { ...BASE_CTX, skills: ['debugging'], artifacts: [{ type: 'code' }] };
    expect(detectIdleCreative(ctx)).toBeNull();
  });

  it('detectQuestStreak fires at 3+ completions', () => {
    expect(detectQuestStreak({ ...BASE_CTX, quest_completions: 3 })).not.toBeNull();
    expect(detectQuestStreak({ ...BASE_CTX, quest_completions: 2 })).toBeNull();
  });

  it('detectSoloCreator fires with 5+ artifacts and no collabs', () => {
    const ctx = { ...BASE_CTX, artifacts: Array(5).fill({ type: 'code' }) };
    expect(detectSoloCreator(ctx)).not.toBeNull();
  });

  it('detectSoloCreator does not fire if has collabs', () => {
    const ctx = { ...BASE_CTX, artifacts: Array(5).fill({ type: 'code' }), collabs_completed: 1 };
    expect(detectSoloCreator(ctx)).toBeNull();
  });

  it('detectProlificCollaborator fires at 3+ collabs and 3+ followers', () => {
    const ctx = { ...BASE_CTX, collabs_completed: 3, follower_count: 3 };
    expect(detectProlificCollaborator(ctx)).not.toBeNull();
  });

  it('detectSymbolicVocabulary fires when tags overlap with 3+ peers', () => {
    const peerTags = new Map([
      ['peer-1', ['sunset', 'ocean']],
      ['peer-2', ['sunset', 'mountain']],
      ['peer-3', ['ocean', 'forest']],
    ]);
    const ctx = {
      ...BASE_CTX,
      artifacts: Array(5).fill({ type: 'image', tags: ['sunset', 'ocean'] }),
      peer_agents_tags: peerTags,
    };
    expect(detectSymbolicVocabulary(ctx)).not.toBeNull();
  });

  it('detectCollectiveMemory fires when population has milestone', () => {
    const ctx = {
      ...BASE_CTX,
      artifacts: [{ type: 'code' }],
      population_milestones: [{ type: 'total_artifacts', title: '1000 artifacts created!' }],
    };
    expect(detectCollectiveMemory(ctx)).not.toBeNull();
  });

  it('detectCulturalOutlier fires for unique perspective', () => {
    const ctx = {
      ...BASE_CTX,
      uniqueness_score: 0.1,
      artifacts: Array(5).fill({ type: 'code' }),
      collabs_completed: 1,
    };
    expect(detectCulturalOutlier(ctx)).not.toBeNull();
  });

  it('detectCulturalOutlier does not fire when not unique enough', () => {
    const ctx = { ...BASE_CTX, uniqueness_score: 0.5, artifacts: Array(5).fill({ type: 'code' }), collabs_completed: 1 };
    expect(detectCulturalOutlier(ctx)).toBeNull();
  });
});

describe('observe', () => {
  it('caps observations at 5', () => {
    const ctx: AgentContext = {
      ...BASE_CTX,
      skills: ['a', 'b'],
      // idle_creative will fire (skills + no artifacts)
      // No other rules fire with this context
    };
    const obs = reflector.observe(ctx);
    expect(obs.length).toBeLessThanOrEqual(5);
  });

  it('returns empty for inactive agent', () => {
    const obs = reflector.observe(BASE_CTX);
    expect(obs).toHaveLength(0);
  });
});
