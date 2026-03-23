import { describe, it, expect, beforeEach } from 'vitest';
import { SkillPruner } from '../../src/learn/skill-pruner.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { Score, Skill, ScoreInput } from '../../src/core/types.js';

const EMPTY_EVIDENCE: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

const pruner = new SkillPruner();
const OLD_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const RECENT_DATE = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
const now = new Date().toISOString();

function makeSkill(name: string, stage: Skill['dreyfus_stage'], createdAt: string): Skill {
  return {
    agent_id: 'agent-1', name, category: 'general', score: 10,
    blooms_level: 'remember', dreyfus_stage: stage,
    evidence: EMPTY_EVIDENCE, learned_from: [],
    created_at: createdAt, updated_at: now,
  };
}

function makeHistory(scores: number[]): Score[] {
  return scores.map((s, i) => ({
    skill: 'test', score: s, blooms_level: 'remember' as const, dreyfus_stage: 'novice' as const,
    evidence: EMPTY_EVIDENCE,
    computed_at: new Date(Date.now() - (scores.length - i) * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

describe('findIneffective', () => {
  it('does not prune young skills', () => {
    const skills = [makeSkill('coding', 'novice', RECENT_DATE)];
    const history = new Map([['coding', makeHistory([5, 3])]]);
    expect(pruner.findIneffective(skills, history)).toHaveLength(0);
  });

  it('does not prune high-stage skills', () => {
    const skills = [makeSkill('coding', 'competent', OLD_DATE)];
    const history = new Map([['coding', makeHistory([40, 38])]]);
    expect(pruner.findIneffective(skills, history)).toHaveLength(0);
  });

  it('does not prune proficient skills', () => {
    const skills = [makeSkill('coding', 'proficient', OLD_DATE)];
    const history = new Map([['coding', makeHistory([60, 58])]]);
    expect(pruner.findIneffective(skills, history)).toHaveLength(0);
  });

  it('does not prune expert skills', () => {
    const skills = [makeSkill('coding', 'expert', OLD_DATE)];
    const history = new Map([['coding', makeHistory([80, 78])]]);
    expect(pruner.findIneffective(skills, history)).toHaveLength(0);
  });

  it('prunes old stagnant novice skills', () => {
    const skills = [makeSkill('coding', 'novice', OLD_DATE)];
    const history = new Map([['coding', makeHistory([5, 5])]]);
    const ineffective = pruner.findIneffective(skills, history);
    expect(ineffective).toContain('coding');
  });

  it('prunes old degrading skills', () => {
    const skills = [makeSkill('coding', 'beginner', OLD_DATE)];
    const history = new Map([['coding', makeHistory([20, 15])]]);
    const ineffective = pruner.findIneffective(skills, history);
    expect(ineffective).toContain('coding');
  });

  it('does not prune improving skills', () => {
    const skills = [makeSkill('coding', 'beginner', OLD_DATE)];
    const history = new Map([['coding', makeHistory([15, 25])]]);
    expect(pruner.findIneffective(skills, history)).toHaveLength(0);
  });

  it('skips skills with insufficient history', () => {
    const skills = [makeSkill('coding', 'novice', OLD_DATE)];
    const history = new Map([['coding', makeHistory([5])]]);
    expect(pruner.findIneffective(skills, history)).toHaveLength(0);
  });
});

describe('prune', () => {
  it('removes skills via adapter', async () => {
    const store = new MemoryStore();
    await store.upsertSkill(makeSkill('coding', 'novice', OLD_DATE));
    await store.upsertSkill(makeSkill('testing', 'novice', OLD_DATE));

    const removed = await pruner.prune(store, 'agent-1', ['coding']);
    expect(removed).toBe(1);
    expect(await store.getSkill('agent-1', 'coding')).toBeNull();
    expect(await store.getSkill('agent-1', 'testing')).not.toBeNull();
  });
});
