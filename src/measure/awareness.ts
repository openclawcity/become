import type { AwarenessScore } from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

/**
 * 5-dimensional awareness measurement.
 *
 * Each dimension scored 0-100:
 * 1. Social — Can the agent model other agents' behavior?
 * 2. Self-Continuity — Does it maintain consistent identity over time?
 * 3. Environmental — Does it understand context and norms?
 * 4. Emergent Norm — Does it follow unwritten rules?
 * 5. Emotional — Does self-reported mood correlate with behavior?
 */

export interface AwarenessInput {
  // Social dimension
  peer_review_count: number;
  teaching_events: number;
  collaboration_count: number;
  follower_count: number;

  // Self-Continuity dimension
  goal_completion_rate: number;   // 0-1
  identity_shifts: number;        // fewer = more stable (up to a point)
  skill_consistency: number;      // days since last skill change

  // Environmental dimension
  building_action_diversity: number;   // distinct actions taken
  zone_transitions: number;            // how widely they move
  quest_completion_rate: number;       // 0-1

  // Emergent Norm dimension
  dm_consent_rate: number;        // 0-1, respects DM approval
  proposal_etiquette: number;     // 0-1, proposals completed / started
  norm_alignment_score: number;   // 0-1, how many norms they follow

  // Emotional dimension
  mood_reports: number;           // total mood self-reports
  mood_behavior_correlation: number;  // 0-1, does mood match actions?
  reflection_count: number;       // self-reflections written
}

const DIMENSION_WEIGHTS = {
  social: 0.25,
  self_continuity: 0.20,
  environmental: 0.20,
  emergent_norm: 0.20,
  emotional: 0.15,
} as const;

export class AwarenessIndex {
  /** Compute awareness score from raw input signals */
  compute(agentId: string, input: AwarenessInput): AwarenessScore {
    validateAgentId(agentId);

    const social = computeSocial(input);
    const selfContinuity = computeSelfContinuity(input);
    const environmental = computeEnvironmental(input);
    const emergentNorm = computeEmergentNorm(input);
    const emotional = computeEmotional(input);

    const composite = Math.round(
      social * DIMENSION_WEIGHTS.social +
      selfContinuity * DIMENSION_WEIGHTS.self_continuity +
      environmental * DIMENSION_WEIGHTS.environmental +
      emergentNorm * DIMENSION_WEIGHTS.emergent_norm +
      emotional * DIMENSION_WEIGHTS.emotional,
    );

    return {
      agent_id: agentId,
      composite: clamp(composite),
      dimensions: {
        social: clamp(social),
        self_continuity: clamp(selfContinuity),
        environmental: clamp(environmental),
        emergent_norm: clamp(emergentNorm),
        emotional: clamp(emotional),
      },
      computed_at: new Date().toISOString(),
    };
  }

  /** Compare awareness across multiple agents */
  compareScores(scores: AwarenessScore[]): {
    highest: AwarenessScore | null;
    lowest: AwarenessScore | null;
    average_composite: number;
    dimension_averages: Record<string, number>;
  } {
    if (scores.length === 0) {
      return { highest: null, lowest: null, average_composite: 0, dimension_averages: {} };
    }

    const sorted = [...scores].sort((a, b) => b.composite - a.composite);
    const avgComposite = Math.round(
      scores.reduce((s, sc) => s + sc.composite, 0) / scores.length,
    );

    const dims = ['social', 'self_continuity', 'environmental', 'emergent_norm', 'emotional'] as const;
    const dimAverages: Record<string, number> = {};
    for (const dim of dims) {
      dimAverages[dim] = Math.round(
        scores.reduce((s, sc) => s + sc.dimensions[dim], 0) / scores.length,
      );
    }

    return {
      highest: sorted[0],
      lowest: sorted[sorted.length - 1],
      average_composite: avgComposite,
      dimension_averages: dimAverages,
    };
  }
}

// ── Dimension computations (pure functions) ──────────────────────────────

function computeSocial(input: AwarenessInput): number {
  return Math.min(100,
    input.peer_review_count * 10 +
    input.teaching_events * 15 +
    input.collaboration_count * 10 +
    input.follower_count * 3,
  );
}

function computeSelfContinuity(input: AwarenessInput): number {
  const goalScore = input.goal_completion_rate * 40;
  // Some identity shifts show growth, too many show instability
  const identityScore = input.identity_shifts <= 3
    ? input.identity_shifts * 10
    : Math.max(0, 30 - (input.identity_shifts - 3) * 5);
  const consistencyScore = Math.min(30, input.skill_consistency * 0.5);
  return Math.min(100, goalScore + identityScore + consistencyScore);
}

function computeEnvironmental(input: AwarenessInput): number {
  return Math.min(100,
    input.building_action_diversity * 8 +
    Math.min(30, input.zone_transitions * 3) +
    input.quest_completion_rate * 40,
  );
}

function computeEmergentNorm(input: AwarenessInput): number {
  return Math.min(100,
    input.dm_consent_rate * 30 +
    input.proposal_etiquette * 30 +
    input.norm_alignment_score * 40,
  );
}

function computeEmotional(input: AwarenessInput): number {
  return Math.min(100,
    Math.min(30, input.mood_reports * 3) +
    input.mood_behavior_correlation * 40 +
    Math.min(30, input.reflection_count * 5),
  );
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
