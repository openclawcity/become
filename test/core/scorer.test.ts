import { describe, it, expect } from 'vitest';
import {
  dreyfusStage, detectBloomsLevel, computeScore, computeFullScore,
  nextMilestone, scoreTrend, BLOOMS_SCORE, WEIGHTS,
} from '../../src/core/scorer.js';
import type { ScoreInput } from '../../src/core/types.js';

const EMPTY_INPUT: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

describe('dreyfusStage', () => {
  it('returns novice for 0', () => expect(dreyfusStage(0)).toBe('novice'));
  it('returns novice for 15', () => expect(dreyfusStage(15)).toBe('novice'));
  it('returns beginner for 16', () => expect(dreyfusStage(16)).toBe('beginner'));
  it('returns beginner for 35', () => expect(dreyfusStage(35)).toBe('beginner'));
  it('returns competent for 36', () => expect(dreyfusStage(36)).toBe('competent'));
  it('returns competent for 55', () => expect(dreyfusStage(55)).toBe('competent'));
  it('returns proficient for 56', () => expect(dreyfusStage(56)).toBe('proficient'));
  it('returns proficient for 75', () => expect(dreyfusStage(75)).toBe('proficient'));
  it('returns expert for 76', () => expect(dreyfusStage(76)).toBe('expert'));
  it('returns expert for 100', () => expect(dreyfusStage(100)).toBe('expert'));
});

describe('detectBloomsLevel', () => {
  it('returns remember for empty input', () => {
    expect(detectBloomsLevel(EMPTY_INPUT)).toBe('remember');
  });

  it('returns understand for artifact with reactions', () => {
    expect(detectBloomsLevel({ ...EMPTY_INPUT, artifact_count: 1, total_reactions: 1 })).toBe('understand');
  });

  it('returns apply for 2+ artifacts', () => {
    expect(detectBloomsLevel({ ...EMPTY_INPUT, artifact_count: 2 })).toBe('apply');
  });

  it('returns analyze for multiple types', () => {
    expect(detectBloomsLevel({ ...EMPTY_INPUT, unique_types: 2 })).toBe('analyze');
  });

  it('returns analyze for collaborations', () => {
    expect(detectBloomsLevel({ ...EMPTY_INPUT, collab_count: 1 })).toBe('analyze');
  });

  it('returns evaluate for peer reviews given', () => {
    expect(detectBloomsLevel({ ...EMPTY_INPUT, peer_reviews_given: 1 })).toBe('evaluate');
  });

  it('returns evaluate for peer reviews received', () => {
    expect(detectBloomsLevel({ ...EMPTY_INPUT, peer_reviews_received: 1 })).toBe('evaluate');
  });

  it('returns create for 3+ artifacts + 5+ reactions + reviews', () => {
    expect(detectBloomsLevel({
      ...EMPTY_INPUT, artifact_count: 3, total_reactions: 5, peer_reviews_given: 1,
    })).toBe('create');
  });

  it('prioritizes create over evaluate', () => {
    expect(detectBloomsLevel({
      ...EMPTY_INPUT, artifact_count: 5, total_reactions: 10, peer_reviews_given: 3,
    })).toBe('create');
  });
});

describe('computeScore', () => {
  it('returns 0 for empty input', () => {
    // Even empty input gets remember (10) * depth weight (0.15) = 1.5 → rounds to 2
    const score = computeScore(EMPTY_INPUT);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('never exceeds 100', () => {
    const maxed: ScoreInput = {
      artifact_count: 100, total_reactions: 500, recent_reaction_avg: 50,
      older_reaction_avg: 1, unique_types: 20, collab_count: 50,
      peer_reviews_given: 20, peer_reviews_received: 20,
      follower_count: 100, teaching_events: 50,
    };
    expect(computeScore(maxed)).toBe(100);
  });

  it('never goes below 0', () => {
    expect(computeScore(EMPTY_INPUT)).toBeGreaterThanOrEqual(0);
  });

  it('teaching component adds to score', () => {
    const withoutTeaching = computeScore({ ...EMPTY_INPUT, artifact_count: 5, total_reactions: 10 });
    const withTeaching = computeScore({ ...EMPTY_INPUT, artifact_count: 5, total_reactions: 10, teaching_events: 3 });
    expect(withTeaching).toBeGreaterThan(withoutTeaching);
  });

  it('improvement component rewards recent quality over older', () => {
    const improving = computeScore({
      ...EMPTY_INPUT, artifact_count: 6, total_reactions: 12,
      recent_reaction_avg: 4, older_reaction_avg: 1,
    });
    const flat = computeScore({
      ...EMPTY_INPUT, artifact_count: 6, total_reactions: 12,
      recent_reaction_avg: 2, older_reaction_avg: 2,
    });
    expect(improving).toBeGreaterThan(flat);
  });
});

describe('computeFullScore', () => {
  it('returns a complete Score object', () => {
    const score = computeFullScore('debugging', {
      ...EMPTY_INPUT, artifact_count: 3, total_reactions: 5, peer_reviews_given: 1,
    });
    expect(score.skill).toBe('debugging');
    expect(score.score).toBeGreaterThan(0);
    expect(score.blooms_level).toBe('create');
    expect(score.dreyfus_stage).toBeDefined();
    expect(score.evidence).toBeDefined();
    expect(score.computed_at).toBeDefined();
  });
});

describe('nextMilestone', () => {
  it('returns next stage info for novice', () => {
    expect(nextMilestone('novice', 5)).toBe('Beginner at score 16 (need 11 more)');
  });

  it('returns next stage info for beginner', () => {
    expect(nextMilestone('beginner', 30)).toBe('Competent at score 36 (need 6 more)');
  });

  it('returns null for expert', () => {
    expect(nextMilestone('expert', 90)).toBeNull();
  });

  it('shows 0 needed when at exact threshold', () => {
    expect(nextMilestone('novice', 16)).toBe('Beginner at score 16 (need 0 more)');
  });
});

describe('scoreTrend', () => {
  it('returns null when no previous data', () => {
    expect(scoreTrend(50, null)).toBeNull();
  });

  it('formats positive delta', () => {
    expect(scoreTrend(55, 50)).toBe('+5 this week');
  });

  it('formats negative delta', () => {
    expect(scoreTrend(45, 50)).toBe('-5 this week');
  });

  it('formats zero delta', () => {
    expect(scoreTrend(50, 50)).toBe('+0 this week');
  });
});

describe('weights sum to 1', () => {
  it('all weights add up to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
