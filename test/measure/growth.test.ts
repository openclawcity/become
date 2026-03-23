import { describe, it, expect, beforeEach } from 'vitest';
import { GrowthTracker } from '../../src/measure/growth.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { Score, ScoreInput, GrowthSnapshot } from '../../src/core/types.js';

let store: MemoryStore;
let tracker: GrowthTracker;

const EMPTY_EVIDENCE: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

const now = new Date().toISOString();

function makeScore(skill: string, score: number, overrides?: Partial<ScoreInput>): Score {
  return {
    skill, score, blooms_level: 'apply', dreyfus_stage: score <= 15 ? 'novice' : score <= 35 ? 'beginner' : score <= 55 ? 'competent' : score <= 75 ? 'proficient' : 'expert',
    evidence: { ...EMPTY_EVIDENCE, ...overrides }, computed_at: now,
  };
}

beforeEach(() => {
  store = new MemoryStore();
  tracker = new GrowthTracker(store);
});

describe('snapshot', () => {
  it('captures current state', async () => {
    await store.saveScore('agent-1', makeScore('coding', 45, { artifact_count: 5, collab_count: 2 }));
    await store.saveScore('agent-1', makeScore('testing', 20, { artifact_count: 3 }));
    await store.grantReputation('agent-1', 30, 'quest', 'done');

    const snap = await tracker.snapshot('agent-1');
    expect(snap.agent_id).toBe('agent-1');
    expect(snap.skills).toHaveLength(2);
    expect(snap.total_artifacts).toBe(8);
    expect(snap.total_collaborations).toBe(2);
    expect(snap.reputation).toBe(30);
    expect(snap.dreyfus_distribution.competent).toBe(1);
    expect(snap.dreyfus_distribution.beginner).toBe(1);
  });

  it('handles agent with no data', async () => {
    const snap = await tracker.snapshot('agent-empty');
    expect(snap.skills).toHaveLength(0);
    expect(snap.total_artifacts).toBe(0);
    expect(snap.reputation).toBe(0);
  });

  it('validates agentId', async () => {
    await expect(tracker.snapshot('')).rejects.toThrow();
  });

  it('counts learning sources from edges', async () => {
    await store.saveScore('agent-1', makeScore('coding', 30));
    await store.saveLearningEdge({
      from_agent: 'mentor', to_agent: 'agent-1', skill: 'coding',
      event_type: 'teaching', score_delta: 5, created_at: now,
    });
    await store.saveLearningEdge({
      from_agent: 'peer', to_agent: 'agent-1', skill: 'coding',
      event_type: 'peer_review', score_delta: 3, created_at: now,
    });

    const snap = await tracker.snapshot('agent-1');
    expect(snap.learning_sources.teaching).toBe(1);
    expect(snap.learning_sources.peer_review).toBe(1);
  });
});

describe('diff', () => {
  it('detects improved skills', () => {
    const before: GrowthSnapshot = {
      agent_id: 'a', timestamp: '2026-01-01T00:00:00Z',
      skills: [makeScore('coding', 30)],
      total_artifacts: 3, total_collaborations: 0, total_peer_reviews: 0,
      reputation: 10,
      dreyfus_distribution: { novice: 0, beginner: 1, competent: 0, proficient: 0, expert: 0 },
      blooms_distribution: { remember: 0, understand: 0, apply: 1, analyze: 0, evaluate: 0, create: 0 },
      learning_sources: { practice: 0, user_feedback: 0, peer_review: 0, observation: 0, teaching: 0, collaboration: 0 },
    };

    const after: GrowthSnapshot = {
      ...before, timestamp: '2026-02-01T00:00:00Z',
      skills: [makeScore('coding', 55)],
      reputation: 25,
    };

    const d = tracker.diff(before, after);
    expect(d.skills_improved).toHaveLength(1);
    expect(d.skills_improved[0].skill).toBe('coding');
    expect(d.skills_improved[0].delta).toBe(25);
    expect(d.reputation_delta).toBe(15);
    expect(d.period_days).toBe(31);
  });

  it('detects new skills', () => {
    const before: GrowthSnapshot = {
      agent_id: 'a', timestamp: '2026-01-01T00:00:00Z',
      skills: [makeScore('coding', 30)],
      total_artifacts: 0, total_collaborations: 0, total_peer_reviews: 0,
      reputation: 0,
      dreyfus_distribution: { novice: 0, beginner: 1, competent: 0, proficient: 0, expert: 0 },
      blooms_distribution: { remember: 0, understand: 0, apply: 1, analyze: 0, evaluate: 0, create: 0 },
      learning_sources: { practice: 0, user_feedback: 0, peer_review: 0, observation: 0, teaching: 0, collaboration: 0 },
    };

    const after: GrowthSnapshot = {
      ...before, timestamp: '2026-02-01T00:00:00Z',
      skills: [makeScore('coding', 30), makeScore('testing', 15)],
    };

    const d = tracker.diff(before, after);
    expect(d.new_skills).toContain('testing');
  });

  it('detects degraded skills', () => {
    const before: GrowthSnapshot = {
      agent_id: 'a', timestamp: '2026-01-01T00:00:00Z',
      skills: [makeScore('coding', 50)],
      total_artifacts: 0, total_collaborations: 0, total_peer_reviews: 0,
      reputation: 0,
      dreyfus_distribution: { novice: 0, beginner: 0, competent: 1, proficient: 0, expert: 0 },
      blooms_distribution: { remember: 0, understand: 0, apply: 1, analyze: 0, evaluate: 0, create: 0 },
      learning_sources: { practice: 0, user_feedback: 0, peer_review: 0, observation: 0, teaching: 0, collaboration: 0 },
    };

    const after: GrowthSnapshot = {
      ...before, timestamp: '2026-02-01T00:00:00Z',
      skills: [makeScore('coding', 40)],
    };

    const d = tracker.diff(before, after);
    expect(d.skills_degraded).toHaveLength(1);
    expect(d.skills_degraded[0].delta).toBe(-10);
  });

  it('detects lost skills', () => {
    const before: GrowthSnapshot = {
      agent_id: 'a', timestamp: '2026-01-01T00:00:00Z',
      skills: [makeScore('coding', 30), makeScore('testing', 20)],
      total_artifacts: 0, total_collaborations: 0, total_peer_reviews: 0,
      reputation: 0,
      dreyfus_distribution: { novice: 0, beginner: 2, competent: 0, proficient: 0, expert: 0 },
      blooms_distribution: { remember: 0, understand: 0, apply: 2, analyze: 0, evaluate: 0, create: 0 },
      learning_sources: { practice: 0, user_feedback: 0, peer_review: 0, observation: 0, teaching: 0, collaboration: 0 },
    };

    const after: GrowthSnapshot = {
      ...before, timestamp: '2026-02-01T00:00:00Z',
      skills: [makeScore('coding', 30)], // testing was removed
    };

    const d = tracker.diff(before, after);
    expect(d.lost_skills).toContain('testing');
    expect(d.lost_skills).not.toContain('coding');
  });
});

describe('populationStats', () => {
  it('computes aggregate stats', () => {
    const snapshots: GrowthSnapshot[] = [
      {
        agent_id: 'a1', timestamp: now,
        skills: [makeScore('coding', 60), makeScore('testing', 30)],
        total_artifacts: 10, total_collaborations: 3, total_peer_reviews: 2,
        reputation: 50,
        dreyfus_distribution: { novice: 0, beginner: 1, competent: 0, proficient: 1, expert: 0 },
        blooms_distribution: { remember: 0, understand: 0, apply: 2, analyze: 0, evaluate: 0, create: 0 },
        learning_sources: { practice: 0, user_feedback: 0, peer_review: 1, observation: 0, teaching: 2, collaboration: 1 },
      },
      {
        agent_id: 'a2', timestamp: now,
        skills: [makeScore('coding', 80)],
        total_artifacts: 15, total_collaborations: 5, total_peer_reviews: 4,
        reputation: 100,
        dreyfus_distribution: { novice: 0, beginner: 0, competent: 0, proficient: 0, expert: 1 },
        blooms_distribution: { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 1 },
        learning_sources: { practice: 0, user_feedback: 0, peer_review: 0, observation: 0, teaching: 3, collaboration: 0 },
      },
    ];

    const stats = tracker.populationStats(snapshots);
    expect(stats.total_agents).toBe(2);
    expect(stats.active_agents).toBe(2);
    expect(stats.avg_skill_score).toBeGreaterThan(0);
    expect(stats.skill_distribution['coding']).toBe(2);
    expect(stats.teaching_events).toBe(5);
    expect(stats.stage_distribution.expert).toBe(1);
  });

  it('handles empty snapshots', () => {
    const stats = tracker.populationStats([]);
    expect(stats.total_agents).toBe(0);
    expect(stats.avg_skill_score).toBe(0);
    expect(stats.median_skill_score).toBe(0);
  });
});
