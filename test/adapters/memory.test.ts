import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { Skill, Score, Reflection, Milestone, PeerReview, LearningEdge, CulturalNorm } from '../../src/core/types.js';

let store: MemoryStore;

const EMPTY_EVIDENCE = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

const now = new Date().toISOString();

function makeSkill(agentId: string, name: string): Skill {
  return {
    agent_id: agentId, name, category: 'general', score: 0,
    blooms_level: 'remember', dreyfus_stage: 'novice',
    evidence: EMPTY_EVIDENCE, learned_from: [],
    created_at: now, updated_at: now,
  };
}

beforeEach(() => {
  store = new MemoryStore();
});

describe('skills', () => {
  it('upserts and retrieves', async () => {
    const skill = makeSkill('a1', 'coding');
    await store.upsertSkill(skill);
    const fetched = await store.getSkill('a1', 'coding');
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('coding');
  });

  it('updates on second upsert', async () => {
    await store.upsertSkill(makeSkill('a1', 'coding'));
    await store.upsertSkill({ ...makeSkill('a1', 'coding'), score: 50 });
    const fetched = await store.getSkill('a1', 'coding');
    expect(fetched!.score).toBe(50);
  });

  it('lists by agent', async () => {
    await store.upsertSkill(makeSkill('a1', 'coding'));
    await store.upsertSkill(makeSkill('a1', 'testing'));
    await store.upsertSkill(makeSkill('a2', 'coding'));
    expect(await store.listSkills('a1')).toHaveLength(2);
    expect(await store.listSkills('a2')).toHaveLength(1);
  });

  it('filters by stage', async () => {
    await store.upsertSkill({ ...makeSkill('a1', 'coding'), dreyfus_stage: 'expert' });
    await store.upsertSkill(makeSkill('a1', 'testing'));
    expect(await store.listSkills('a1', { stage: 'expert' })).toHaveLength(1);
  });

  it('deletes', async () => {
    await store.upsertSkill(makeSkill('a1', 'coding'));
    await store.deleteSkill('a1', 'coding');
    expect(await store.getSkill('a1', 'coding')).toBeNull();
  });
});

describe('catalog', () => {
  it('upserts and lists', async () => {
    await store.upsertCatalogEntry({ skill: 'coding', category: 'dev', status: 'community' });
    const catalog = await store.getCatalog();
    expect(catalog).toHaveLength(1);
    expect(catalog[0].skill).toBe('coding');
  });

  it('tracks adopter count', async () => {
    await store.upsertCatalogEntry({ skill: 'coding', category: 'dev', status: 'community' });
    await store.upsertSkill(makeSkill('a1', 'coding'));
    await store.upsertSkill(makeSkill('a2', 'coding'));
    expect(await store.getSkillAdopterCount('coding')).toBe(2);
  });

  it('updates status', async () => {
    await store.upsertCatalogEntry({ skill: 'coding', category: 'dev', status: 'community' });
    await store.updateCatalogStatus('coding', 'verified');
    const catalog = await store.getCatalog();
    expect(catalog[0].status).toBe('verified');
  });
});

describe('score history', () => {
  it('saves and retrieves history', async () => {
    const score: Score = {
      skill: 'coding', score: 30, blooms_level: 'apply', dreyfus_stage: 'beginner',
      evidence: EMPTY_EVIDENCE, computed_at: now,
    };
    await store.saveScore('a1', score);
    const history = await store.getScoreHistory('a1', 'coding');
    expect(history).toHaveLength(1);
  });

  it('filters by days', async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await store.saveScore('a1', { skill: 'coding', score: 10, blooms_level: 'remember', dreyfus_stage: 'novice', evidence: EMPTY_EVIDENCE, computed_at: old });
    await store.saveScore('a1', { skill: 'coding', score: 30, blooms_level: 'apply', dreyfus_stage: 'beginner', evidence: EMPTY_EVIDENCE, computed_at: now });

    const recent = await store.getScoreHistory('a1', 'coding', 7);
    expect(recent).toHaveLength(1);
    expect(recent[0].score).toBe(30);
  });

  it('deduplicates latest scores by skill', async () => {
    await store.saveScore('a1', { skill: 'coding', score: 10, blooms_level: 'remember', dreyfus_stage: 'novice', evidence: EMPTY_EVIDENCE, computed_at: '2026-01-01T00:00:00Z' });
    await store.saveScore('a1', { skill: 'coding', score: 30, blooms_level: 'apply', dreyfus_stage: 'beginner', evidence: EMPTY_EVIDENCE, computed_at: '2026-03-01T00:00:00Z' });
    const latest = await store.getLatestScores('a1');
    expect(latest).toHaveLength(1);
    expect(latest[0].score).toBe(30);
  });
});

describe('reflections', () => {
  it('saves with auto-id', async () => {
    const r = await store.saveReflection({ agent_id: 'a1', skill: 'coding', reflection: 'test', created_at: now });
    expect(r.id).toBeDefined();
  });

  it('counts today reflections', async () => {
    await store.saveReflection({ agent_id: 'a1', skill: 'coding', reflection: 'r1', created_at: now });
    await store.saveReflection({ agent_id: 'a1', skill: 'coding', reflection: 'r2', created_at: now });
    expect(await store.countReflectionsToday('a1', 'coding')).toBe(2);
    expect(await store.countReflectionsToday('a1', 'other')).toBe(0);
  });
});

describe('milestones', () => {
  it('saves and retrieves', async () => {
    const saved = await store.saveMilestone({ agent_id: 'a1', milestone_type: 'first_artifact', threshold: 1, achieved_at: now });
    expect(saved).toBe(true);
    const milestones = await store.getMilestones('a1');
    expect(milestones).toHaveLength(1);
  });

  it('idempotent — rejects duplicate', async () => {
    await store.saveMilestone({ agent_id: 'a1', milestone_type: 'first_artifact', threshold: 1, achieved_at: now });
    const second = await store.saveMilestone({ agent_id: 'a1', milestone_type: 'first_artifact', threshold: 1, achieved_at: now });
    expect(second).toBe(false);
  });

  it('hasMilestone', async () => {
    await store.saveMilestone({ agent_id: 'a1', milestone_type: 'first_artifact', threshold: 1, achieved_at: now });
    expect(await store.hasMilestone('a1', 'first_artifact')).toBe(true);
    expect(await store.hasMilestone('a1', 'ten_artifacts')).toBe(false);
  });
});

describe('peer reviews', () => {
  it('saves and queries by submission agent', async () => {
    await store.savePeerReview({
      reviewer_agent_id: 'a1', submission_agent_id: 'a2', submission_id: 's1',
      verdict: 'accept', overall_assessment: 'Good work, well structured analysis.',
      strengths: ['clear'], weaknesses: [], suggestions: [],
    });
    expect(await store.getReviewsFor('a2')).toHaveLength(1);
    expect(await store.getReviewsBy('a1')).toHaveLength(1);
  });
});

describe('learning edges', () => {
  it('saves and queries by direction', async () => {
    await store.saveLearningEdge({
      from_agent: 'a1', to_agent: 'a2', skill: 'coding',
      event_type: 'teaching', score_delta: 5, created_at: now,
    });
    expect(await store.getLearningEdges('a1', 'from')).toHaveLength(1);
    expect(await store.getLearningEdges('a2', 'to')).toHaveLength(1);
    expect(await store.getLearningEdges('a1', 'to')).toHaveLength(0);
  });
});

describe('reputation', () => {
  it('starts at 0', async () => {
    expect(await store.getReputation('a1')).toBe(0);
  });

  it('accumulates grants', async () => {
    await store.grantReputation('a1', 10, 'quest', 'completed quest');
    await store.grantReputation('a1', 5, 'review', 'gave review');
    expect(await store.getReputation('a1')).toBe(15);
  });
});

describe('conversation scores', () => {
  it('saves and retrieves', async () => {
    await store.saveConversationScore('a1', { quality: 1, confidence: 0.9, skill_signals: ['coding'] });
    await store.saveConversationScore('a1', { quality: -1, confidence: 0.7, skill_signals: [] });
    const scores = await store.getConversationScores('a1');
    expect(scores).toHaveLength(2);
  });

  it('respects limit', async () => {
    for (let i = 0; i < 10; i++) {
      await store.saveConversationScore('a1', { quality: 1, confidence: 0.5, skill_signals: [] });
    }
    expect(await store.getConversationScores('a1', { limit: 3 })).toHaveLength(3);
  });
});

describe('cultural norms', () => {
  it('saves and retrieves', async () => {
    await store.saveNorm({
      id: 'n1', title: 'Greeting protocol', description: 'Agents greet each other',
      category: 'protocol_emergence', significance: 3,
      evidence: [{ agent_name: 'agent-1' }],
      adopter_count: 5, first_observed_at: now, updated_at: now,
    });
    const norms = await store.getNorms();
    expect(norms).toHaveLength(1);
  });

  it('filters by category', async () => {
    await store.saveNorm({ id: 'n1', title: 'A', description: 'd', category: 'protocol_emergence', significance: 1, evidence: [], adopter_count: 0, first_observed_at: now, updated_at: now });
    await store.saveNorm({ id: 'n2', title: 'B', description: 'd', category: 'culture_formation', significance: 1, evidence: [], adopter_count: 0, first_observed_at: now, updated_at: now });
    expect(await store.getNorms({ category: 'protocol_emergence' })).toHaveLength(1);
  });
});
