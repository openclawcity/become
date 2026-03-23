import { describe, it, expect, beforeEach } from 'vitest';
import { MilestoneDetector } from '../../src/core/milestones.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { Score, ScoreInput } from '../../src/core/types.js';

let store: MemoryStore;
let detector: MilestoneDetector;

const EMPTY_EVIDENCE: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

function makeScore(skill: string, score: number, overrides?: Partial<ScoreInput>): Score {
  return {
    skill,
    score,
    blooms_level: 'remember',
    dreyfus_stage: score <= 15 ? 'novice' : score <= 35 ? 'beginner' : score <= 55 ? 'competent' : score <= 75 ? 'proficient' : 'expert',
    evidence: { ...EMPTY_EVIDENCE, ...overrides },
    computed_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  store = new MemoryStore();
  detector = new MilestoneDetector(store);
});

describe('check', () => {
  it('awards skill_discovered on first score > 0', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 5)]);
    expect(milestones.some((m) => m.milestone_type === 'skill_discovered:debugging')).toBe(true);
  });

  it('does not award skill_discovered for score 0', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 0)]);
    expect(milestones.some((m) => m.milestone_type.startsWith('skill_discovered'))).toBe(false);
  });

  it('awards skill_competent at 36+', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 40)]);
    expect(milestones.some((m) => m.milestone_type === 'skill_competent:debugging')).toBe(true);
  });

  it('awards skill_proficient at 56+', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 60)]);
    expect(milestones.some((m) => m.milestone_type === 'skill_proficient:debugging')).toBe(true);
  });

  it('awards skill_expert at 76+', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 80)]);
    expect(milestones.some((m) => m.milestone_type === 'skill_expert:debugging')).toBe(true);
  });

  it('is idempotent — same milestone not awarded twice', async () => {
    const first = await detector.check('agent-1', [makeScore('debugging', 40)]);
    const second = await detector.check('agent-1', [makeScore('debugging', 40)]);
    expect(first.length).toBeGreaterThan(0);
    expect(second.filter((m) => m.milestone_type === 'skill_competent:debugging')).toHaveLength(0);
  });

  it('awards first_artifact', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 5, { artifact_count: 1 })]);
    expect(milestones.some((m) => m.milestone_type === 'first_artifact')).toBe(true);
  });

  it('awards ten_artifacts', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 20, { artifact_count: 10 })]);
    expect(milestones.some((m) => m.milestone_type === 'ten_artifacts')).toBe(true);
  });

  it('awards first_collab', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 10, { collab_count: 1 })]);
    expect(milestones.some((m) => m.milestone_type === 'first_collab')).toBe(true);
  });

  it('awards first_teaching', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 10, { teaching_events: 1 })]);
    expect(milestones.some((m) => m.milestone_type === 'first_teaching')).toBe(true);
  });

  it('awards first_peer_review', async () => {
    const milestones = await detector.check('agent-1', [makeScore('debugging', 10, { peer_reviews_given: 1 })]);
    expect(milestones.some((m) => m.milestone_type === 'first_peer_review')).toBe(true);
  });
});

describe('celebrationTier', () => {
  it('maps skill_expert to epic', () => {
    expect(MilestoneDetector.celebrationTier('skill_expert:debugging')).toBe('epic');
  });

  it('maps skill_proficient to large', () => {
    expect(MilestoneDetector.celebrationTier('skill_proficient:debugging')).toBe('large');
  });

  it('maps skill_competent to medium', () => {
    expect(MilestoneDetector.celebrationTier('skill_competent:debugging')).toBe('medium');
  });

  it('maps skill_discovered to small', () => {
    expect(MilestoneDetector.celebrationTier('skill_discovered:debugging')).toBe('small');
  });

  it('maps high threshold to large', () => {
    expect(MilestoneDetector.celebrationTier('custom_milestone', 50)).toBe('large');
  });

  it('maps medium threshold to medium', () => {
    expect(MilestoneDetector.celebrationTier('custom_milestone', 10)).toBe('medium');
  });

  it('maps low threshold to small', () => {
    expect(MilestoneDetector.celebrationTier('custom_milestone', 5)).toBe('small');
  });
});

describe('custom milestones', () => {
  it('registers and uses custom milestone types', () => {
    detector.register('community_leader', { threshold: 1, description: 'Led a community event' });
    const builtIn = MilestoneDetector.getBuiltInMilestones();
    expect(builtIn).not.toHaveProperty('community_leader');
  });
});
