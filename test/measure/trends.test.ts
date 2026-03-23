import { describe, it, expect, beforeEach } from 'vitest';
import { TrendTracker } from '../../src/measure/trends.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { Score, ScoreInput } from '../../src/core/types.js';

let store: MemoryStore;
let tracker: TrendTracker;

const EMPTY_EVIDENCE: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

function saveScoreAt(agentId: string, skill: string, score: number, daysAgo: number) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return store.saveScore(agentId, {
    skill, score, blooms_level: 'apply',
    dreyfus_stage: score <= 15 ? 'novice' : score <= 35 ? 'beginner' : score <= 55 ? 'competent' : score <= 75 ? 'proficient' : 'expert',
    evidence: EMPTY_EVIDENCE, computed_at: date,
  });
}

beforeEach(() => {
  store = new MemoryStore();
  tracker = new TrendTracker(store);
});

describe('analyze', () => {
  it('returns trend analysis for all skills', async () => {
    await saveScoreAt('agent-1', 'coding', 20, 30);
    await saveScoreAt('agent-1', 'coding', 30, 7);
    await saveScoreAt('agent-1', 'coding', 40, 0);

    await saveScoreAt('agent-1', 'testing', 10, 14);
    await saveScoreAt('agent-1', 'testing', 15, 0);

    const trends = await tracker.analyze('agent-1');
    expect(trends).toHaveLength(2);

    const coding = trends.find(t => t.skill === 'coding');
    expect(coding).toBeDefined();
    expect(coding!.current_score).toBe(40);
    expect(coding!.delta_7d).toBe(10); // 40 - 30
    expect(coding!.delta_30d).toBe(20); // 40 - 20
    expect(coding!.trend_7d).toBe('+10 this week');
  });

  it('returns null deltas when no history', async () => {
    await saveScoreAt('agent-1', 'coding', 40, 0);

    const trends = await tracker.analyze('agent-1');
    expect(trends[0].delta_7d).toBeNull();
    expect(trends[0].delta_30d).toBeNull();
    expect(trends[0].direction).toBe('unknown');
  });

  it('detects accelerating skills', async () => {
    // 30-day trend: +8 total (0.27/day)
    // 7-day trend: +7 (1/day) — much faster than monthly average
    await saveScoreAt('agent-1', 'coding', 30, 30);
    await saveScoreAt('agent-1', 'coding', 31, 7);
    await saveScoreAt('agent-1', 'coding', 38, 0);

    const trends = await tracker.analyze('agent-1');
    expect(trends[0].direction).toBe('accelerating');
  });

  it('detects decelerating skills', async () => {
    // 30-day trend: +20 total
    // 7-day trend: +1 — much slower than monthly average
    await saveScoreAt('agent-1', 'coding', 20, 30);
    await saveScoreAt('agent-1', 'coding', 39, 7);
    await saveScoreAt('agent-1', 'coding', 40, 0);

    const trends = await tracker.analyze('agent-1');
    expect(trends[0].direction).toBe('decelerating');
  });

  it('detects stable skills', async () => {
    await saveScoreAt('agent-1', 'coding', 40, 30);
    await saveScoreAt('agent-1', 'coding', 40, 7);
    await saveScoreAt('agent-1', 'coding', 40, 0);

    const trends = await tracker.analyze('agent-1');
    expect(trends[0].direction).toBe('stable');
  });

  it('sorts by absolute 7-day delta', async () => {
    await saveScoreAt('agent-1', 'coding', 30, 7);
    await saveScoreAt('agent-1', 'coding', 32, 0);

    await saveScoreAt('agent-1', 'testing', 10, 7);
    await saveScoreAt('agent-1', 'testing', 25, 0);

    const trends = await tracker.analyze('agent-1');
    expect(trends[0].skill).toBe('testing'); // +15 delta > +2
  });

  it('validates agentId', async () => {
    await expect(tracker.analyze('')).rejects.toThrow();
  });
});

describe('topMovers', () => {
  it('returns limited results', async () => {
    await saveScoreAt('agent-1', 'a', 10, 7);
    await saveScoreAt('agent-1', 'a', 20, 0);
    await saveScoreAt('agent-1', 'b', 5, 7);
    await saveScoreAt('agent-1', 'b', 30, 0);
    await saveScoreAt('agent-1', 'c', 40, 7);
    await saveScoreAt('agent-1', 'c', 42, 0);

    const movers = await tracker.topMovers('agent-1', 2);
    expect(movers).toHaveLength(2);
    expect(movers[0].skill).toBe('b'); // biggest mover (+25)
  });
});

describe('formatSummary', () => {
  it('converts TrendAnalysis to SkillTrend', async () => {
    await saveScoreAt('agent-1', 'coding', 30, 7);
    await saveScoreAt('agent-1', 'coding', 40, 0);

    const trends = await tracker.analyze('agent-1');
    const summary = tracker.formatSummary(trends[0]);
    expect(summary.skill).toBe('coding');
    expect(summary.score).toBe(40);
    expect(summary.trend).toBe('+10 this week');
    expect(summary.next_milestone).toBeDefined();
  });
});
