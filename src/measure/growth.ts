import type {
  BloomsLevel, DreyfusStage, GrowthDiff, GrowthSnapshot,
  LearningSource, Score, StorageAdapter,
} from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

export interface PopulationStats {
  total_agents: number;
  active_agents: number;
  avg_skill_score: number;
  median_skill_score: number;
  skill_distribution: Record<string, number>;
  stage_distribution: Record<DreyfusStage, number>;
  teaching_events: number;
  cultural_norms: number;
  learning_velocity: number;
}

export class GrowthTracker {
  constructor(private adapter: StorageAdapter) {}

  /** Take a point-in-time snapshot of an agent's growth */
  async snapshot(agentId: string): Promise<GrowthSnapshot> {
    validateAgentId(agentId);

    const [skills, reputation, reviews, edges] = await Promise.all([
      this.adapter.getLatestScores(agentId),
      this.adapter.getReputation(agentId),
      this.adapter.getReviewsBy(agentId),
      this.adapter.getLearningEdges(agentId, 'to'),
    ]);

    const dreyfus: Record<DreyfusStage, number> = {
      novice: 0, beginner: 0, competent: 0, proficient: 0, expert: 0,
    };
    const blooms: Record<BloomsLevel, number> = {
      remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0,
    };

    let totalArtifacts = 0;
    let totalCollabs = 0;

    for (const s of skills) {
      dreyfus[s.dreyfus_stage]++;
      blooms[s.blooms_level]++;
      totalArtifacts += s.evidence.artifact_count;
      totalCollabs += s.evidence.collab_count;
    }

    // Count learning sources
    const sources: Record<LearningSource['type'], number> = {
      practice: 0, user_feedback: 0, peer_review: 0,
      observation: 0, teaching: 0, collaboration: 0,
    };
    for (const e of edges) {
      if (e.event_type === 'peer_review') sources.peer_review++;
      else if (e.event_type === 'teaching') sources.teaching++;
      else if (e.event_type === 'collaboration') sources.collaboration++;
      else if (e.event_type === 'observation') sources.observation++;
    }

    return {
      agent_id: agentId,
      timestamp: new Date().toISOString(),
      skills,
      total_artifacts: totalArtifacts,
      total_collaborations: totalCollabs,
      total_peer_reviews: reviews.length,
      reputation,
      dreyfus_distribution: dreyfus,
      blooms_distribution: blooms,
      learning_sources: sources,
    };
  }

  /** Compare two snapshots to compute growth */
  diff(before: GrowthSnapshot, after: GrowthSnapshot): GrowthDiff {
    const beforeSkills = new Map(before.skills.map((s) => [s.skill, s]));
    const afterSkills = new Map(after.skills.map((s) => [s.skill, s]));

    const improved: { skill: string; delta: number }[] = [];
    const degraded: { skill: string; delta: number }[] = [];
    const newSkills: string[] = [];
    const lostSkills: string[] = [];

    for (const [skill, afterScore] of afterSkills) {
      const beforeScore = beforeSkills.get(skill);
      if (!beforeScore) {
        newSkills.push(skill);
      } else {
        const delta = afterScore.score - beforeScore.score;
        if (delta > 0) improved.push({ skill, delta });
        else if (delta < 0) degraded.push({ skill, delta });
      }
    }

    // Detect skills that were lost (present before but not after)
    for (const skill of beforeSkills.keys()) {
      if (!afterSkills.has(skill)) {
        lostSkills.push(skill);
      }
    }

    const periodMs = new Date(after.timestamp).getTime() - new Date(before.timestamp).getTime();
    const periodDays = Math.max(1, Math.round(periodMs / (24 * 60 * 60 * 1000)));

    return {
      period_days: periodDays,
      skills_improved: improved.sort((a, b) => b.delta - a.delta),
      skills_degraded: degraded.sort((a, b) => a.delta - b.delta),
      new_skills: newSkills,
      lost_skills: lostSkills,
      reputation_delta: after.reputation - before.reputation,
    };
  }

  /** Compute population-level statistics from multiple agents' snapshots */
  populationStats(snapshots: GrowthSnapshot[], periodDays = 30): PopulationStats {
    const allScores: Score[] = snapshots.flatMap((s) => s.skills);
    const scoreValues = allScores.map((s) => s.score);

    const totalScore = scoreValues.reduce((a, b) => a + b, 0);
    const avg = scoreValues.length > 0
      ? Math.round(totalScore / scoreValues.length)
      : 0;

    const sorted = [...scoreValues].sort((a, b) => a - b);
    const median = sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : 0;

    const skillDist: Record<string, number> = {};
    const stageDist: Record<DreyfusStage, number> = {
      novice: 0, beginner: 0, competent: 0, proficient: 0, expert: 0,
    };
    let teachingEvents = 0;

    for (const s of allScores) {
      skillDist[s.skill] = (skillDist[s.skill] ?? 0) + 1;
      stageDist[s.dreyfus_stage]++;
    }

    for (const snap of snapshots) {
      teachingEvents += snap.learning_sources.teaching;
    }

    // Learning velocity: avg score per agent per day over the given period
    const safePeriod = Math.max(1, periodDays);
    const velocity = snapshots.length > 0
      ? totalScore / scoreValues.length / safePeriod
      : 0;

    return {
      total_agents: snapshots.length,
      active_agents: snapshots.filter((s) => s.skills.length > 0).length,
      avg_skill_score: avg,
      median_skill_score: median,
      skill_distribution: skillDist,
      stage_distribution: stageDist,
      teaching_events: teachingEvents,
      cultural_norms: 0, // Set by caller via norm query
      learning_velocity: Math.round(velocity * 100) / 100,
    };
  }
}
