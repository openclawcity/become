import type { BloomsLevel, DreyfusStage, Score, ScoreInput } from './types.js';

// ── Constants ───────────────────────────────────────────────────────────────

export const BLOOMS_ORDER: BloomsLevel[] = [
  'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create',
];

export const BLOOMS_SCORE: Record<BloomsLevel, number> = {
  remember: 10,
  understand: 25,
  apply: 45,
  analyze: 65,
  evaluate: 80,
  create: 100,
};

export const DREYFUS_THRESHOLDS: Record<string, { next: string; score: number }> = {
  novice: { next: 'Beginner', score: 16 },
  beginner: { next: 'Competent', score: 36 },
  competent: { next: 'Proficient', score: 56 },
  proficient: { next: 'Expert', score: 76 },
};

export const WEIGHTS = {
  artifact: 0.30,
  feedback: 0.20,
  improvement: 0.20,
  depth: 0.15,
  social: 0.10,
  teaching: 0.05,
} as const;

// ── Pure Functions ──────────────────────────────────────────────────────────

export function dreyfusStage(score: number): DreyfusStage {
  if (score <= 15) return 'novice';
  if (score <= 35) return 'beginner';
  if (score <= 55) return 'competent';
  if (score <= 75) return 'proficient';
  return 'expert';
}

export function detectBloomsLevel(input: ScoreInput): BloomsLevel {
  if (input.artifact_count >= 3 && input.total_reactions >= 5 && input.peer_reviews_given > 0) {
    return 'create';
  }
  if (input.peer_reviews_given > 0 || input.peer_reviews_received > 0) {
    return 'evaluate';
  }
  if (input.unique_types >= 2 || input.collab_count >= 1) {
    return 'analyze';
  }
  if (input.artifact_count >= 2) {
    return 'apply';
  }
  if (input.artifact_count >= 1 && input.total_reactions > 0) {
    return 'understand';
  }
  return 'remember';
}

export function computeScore(input: ScoreInput): number {
  const avgReactions = input.artifact_count > 0
    ? input.total_reactions / input.artifact_count
    : 0;

  const artifactComponent = Math.min(100,
    input.artifact_count * 5 +
    avgReactions * 10 +
    input.unique_types * 8,
  );

  const feedbackComponent = Math.min(100, input.peer_reviews_received * 15);

  let improvementComponent = 0;
  if (input.artifact_count >= 3 && input.older_reaction_avg > 0) {
    const ratio = input.recent_reaction_avg / Math.max(1, input.older_reaction_avg);
    improvementComponent = Math.min(100, ratio * 50);
  } else if (input.artifact_count >= 3) {
    improvementComponent = Math.min(100, input.recent_reaction_avg * 20);
  }

  const depthComponent = BLOOMS_SCORE[detectBloomsLevel(input)];

  const socialComponent = Math.min(100,
    input.collab_count * 15 +
    input.follower_count * 5 +
    input.total_reactions * 2,
  );

  const teachingComponent = Math.min(100, input.teaching_events * 20);

  const raw =
    artifactComponent * WEIGHTS.artifact +
    feedbackComponent * WEIGHTS.feedback +
    improvementComponent * WEIGHTS.improvement +
    depthComponent * WEIGHTS.depth +
    socialComponent * WEIGHTS.social +
    teachingComponent * WEIGHTS.teaching;

  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function computeFullScore(skill: string, input: ScoreInput): Score {
  const score = computeScore(input);
  return {
    skill,
    score,
    blooms_level: detectBloomsLevel(input),
    dreyfus_stage: dreyfusStage(score),
    evidence: { ...input },
    computed_at: new Date().toISOString(),
  };
}

export function nextMilestone(stage: DreyfusStage, score: number): string | null {
  const threshold = DREYFUS_THRESHOLDS[stage];
  if (!threshold) return null;
  const needed = Math.max(0, threshold.score - score);
  return `${threshold.next} at score ${threshold.score} (need ${needed} more)`;
}

export function scoreTrend(current: number, weekAgo: number | null): string | null {
  if (weekAgo === null) return null;
  const delta = current - weekAgo;
  return `${delta >= 0 ? '+' : ''}${delta} this week`;
}
