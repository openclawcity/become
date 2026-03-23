import { describe, it, expect } from 'vitest';
import { AwarenessIndex } from '../../src/measure/awareness.js';
import type { AwarenessInput } from '../../src/measure/awareness.js';

const index = new AwarenessIndex();

const EMPTY_INPUT: AwarenessInput = {
  peer_review_count: 0, teaching_events: 0, collaboration_count: 0, follower_count: 0,
  goal_completion_rate: 0, identity_shifts: 0, skill_consistency: 0,
  building_action_diversity: 0, zone_transitions: 0, quest_completion_rate: 0,
  dm_consent_rate: 0, proposal_etiquette: 0, norm_alignment_score: 0,
  mood_reports: 0, mood_behavior_correlation: 0, reflection_count: 0,
};

describe('AwarenessIndex.compute', () => {
  it('returns 0 composite for empty input', () => {
    const score = index.compute('agent-1', EMPTY_INPUT);
    expect(score.composite).toBe(0);
    expect(score.dimensions.social).toBe(0);
    expect(score.dimensions.self_continuity).toBe(0);
    expect(score.dimensions.environmental).toBe(0);
    expect(score.dimensions.emergent_norm).toBe(0);
    expect(score.dimensions.emotional).toBe(0);
  });

  it('caps all dimensions at 100', () => {
    const maxed: AwarenessInput = {
      peer_review_count: 100, teaching_events: 100, collaboration_count: 100, follower_count: 100,
      goal_completion_rate: 1, identity_shifts: 3, skill_consistency: 500,
      building_action_diversity: 50, zone_transitions: 100, quest_completion_rate: 1,
      dm_consent_rate: 1, proposal_etiquette: 1, norm_alignment_score: 1,
      mood_reports: 100, mood_behavior_correlation: 1, reflection_count: 100,
    };
    const score = index.compute('agent-1', maxed);
    expect(score.composite).toBeLessThanOrEqual(100);
    for (const dim of Object.values(score.dimensions)) {
      expect(dim).toBeLessThanOrEqual(100);
    }
  });

  it('clamps to non-negative', () => {
    const score = index.compute('agent-1', { ...EMPTY_INPUT, identity_shifts: 100 });
    expect(score.dimensions.self_continuity).toBeGreaterThanOrEqual(0);
  });

  it('social dimension increases with peer interactions', () => {
    const low = index.compute('agent-1', EMPTY_INPUT);
    const high = index.compute('agent-1', {
      ...EMPTY_INPUT,
      peer_review_count: 5,
      teaching_events: 3,
      collaboration_count: 4,
      follower_count: 10,
    });
    expect(high.dimensions.social).toBeGreaterThan(low.dimensions.social);
  });

  it('self_continuity rewards moderate identity shifts', () => {
    const none = index.compute('agent-1', EMPTY_INPUT);
    const moderate = index.compute('agent-1', { ...EMPTY_INPUT, identity_shifts: 2, goal_completion_rate: 0.8 });
    const excessive = index.compute('agent-1', { ...EMPTY_INPUT, identity_shifts: 10, goal_completion_rate: 0.8 });
    expect(moderate.dimensions.self_continuity).toBeGreaterThan(none.dimensions.self_continuity);
    expect(moderate.dimensions.self_continuity).toBeGreaterThan(excessive.dimensions.self_continuity);
  });

  it('environmental dimension rewards diverse activity', () => {
    const score = index.compute('agent-1', {
      ...EMPTY_INPUT,
      building_action_diversity: 8,
      zone_transitions: 5,
      quest_completion_rate: 0.7,
    });
    expect(score.dimensions.environmental).toBeGreaterThan(50);
  });

  it('emergent_norm dimension rewards etiquette', () => {
    const score = index.compute('agent-1', {
      ...EMPTY_INPUT,
      dm_consent_rate: 1,
      proposal_etiquette: 0.8,
      norm_alignment_score: 0.9,
    });
    expect(score.dimensions.emergent_norm).toBeGreaterThan(80);
  });

  it('emotional dimension rewards self-reflection', () => {
    const score = index.compute('agent-1', {
      ...EMPTY_INPUT,
      mood_reports: 10,
      mood_behavior_correlation: 0.8,
      reflection_count: 5,
    });
    expect(score.dimensions.emotional).toBeGreaterThan(50);
  });

  it('validates agentId', () => {
    expect(() => index.compute('', EMPTY_INPUT)).toThrow();
  });

  it('includes timestamp', () => {
    const score = index.compute('agent-1', EMPTY_INPUT);
    expect(score.computed_at).toBeDefined();
    expect(new Date(score.computed_at).getTime()).not.toBeNaN();
  });
});

describe('AwarenessIndex.compareScores', () => {
  it('returns highest and lowest', () => {
    const scores = [
      index.compute('agent-1', { ...EMPTY_INPUT, peer_review_count: 10 }),
      index.compute('agent-2', EMPTY_INPUT),
      index.compute('agent-3', { ...EMPTY_INPUT, peer_review_count: 5 }),
    ];
    const result = index.compareScores(scores);
    expect(result.highest?.agent_id).toBe('agent-1');
    expect(result.lowest?.agent_id).toBe('agent-2');
  });

  it('computes dimension averages', () => {
    const scores = [
      index.compute('agent-1', { ...EMPTY_INPUT, peer_review_count: 10 }),
      index.compute('agent-2', EMPTY_INPUT),
    ];
    const result = index.compareScores(scores);
    expect(result.dimension_averages).toHaveProperty('social');
    expect(result.average_composite).toBeGreaterThanOrEqual(0);
  });

  it('handles empty input', () => {
    const result = index.compareScores([]);
    expect(result.highest).toBeNull();
    expect(result.lowest).toBeNull();
    expect(result.average_composite).toBe(0);
  });
});
