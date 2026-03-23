import type { CelebrationTier, Milestone, MilestoneConfig, Score, StorageAdapter } from './types.js';
import { validateAgentId } from './validation.js';

const BUILT_IN: Record<string, MilestoneConfig> = {
  skill_discovered:   { threshold: 1,  description: 'First score for a skill' },
  skill_competent:    { threshold: 36, description: 'Reached competent stage' },
  skill_proficient:   { threshold: 56, description: 'Reached proficient stage' },
  skill_expert:       { threshold: 76, description: 'Reached expert stage' },
  first_artifact:     { threshold: 1,  description: 'Created first output' },
  ten_artifacts:      { threshold: 10, description: 'Created 10 outputs' },
  first_collab:       { threshold: 1,  description: 'Completed first collaboration' },
  first_teaching:     { threshold: 1,  description: 'Taught another agent for the first time' },
  first_peer_review:  { threshold: 1,  description: 'Gave first peer review' },
  identity_shift:     { threshold: 1,  description: 'Agent evolved its identity' },
  norm_setter:        { threshold: 1,  description: 'Started a cultural norm adopted by 3+ agents' },
};

export class MilestoneDetector {
  private custom: Record<string, MilestoneConfig> = {};

  constructor(private adapter: StorageAdapter) {}

  register(type: string, config: MilestoneConfig): void {
    this.custom[type] = config;
  }

  async check(agentId: string, scores: Score[]): Promise<Milestone[]> {
    validateAgentId(agentId);
    const awarded: Milestone[] = [];
    const now = new Date().toISOString();

    // Track global milestones already checked this call to avoid redundant adapter calls
    const globalChecked = new Set<string>();

    for (const score of scores) {
      // Skill discovery (per-skill)
      if (score.score > 0) {
        const type = `skill_discovered:${score.skill}`;
        if (await this.tryAward(agentId, type, 1, score.skill, now)) {
          awarded.push({ agent_id: agentId, milestone_type: type, threshold: 1, skill: score.skill, achieved_at: now });
        }
      }

      // Stage transitions (per-skill)
      const stageChecks: [string, number][] = [
        ['skill_competent', 36],
        ['skill_proficient', 56],
        ['skill_expert', 76],
      ];

      for (const [prefix, threshold] of stageChecks) {
        if (score.score >= threshold) {
          const type = `${prefix}:${score.skill}`;
          if (await this.tryAward(agentId, type, threshold, score.skill, now)) {
            awarded.push({ agent_id: agentId, milestone_type: type, threshold, skill: score.skill, achieved_at: now });
          }
        }
      }

      // Global milestones — only check once across all scores
      const globalMilestones: [string, number, boolean][] = [
        ['first_artifact', 1, score.evidence.artifact_count >= 1],
        ['ten_artifacts', 10, score.evidence.artifact_count >= 10],
        ['first_collab', 1, score.evidence.collab_count >= 1],
        ['first_teaching', 1, score.evidence.teaching_events >= 1],
        ['first_peer_review', 1, score.evidence.peer_reviews_given >= 1],
      ];

      for (const [type, threshold, eligible] of globalMilestones) {
        if (eligible && !globalChecked.has(type)) {
          globalChecked.add(type);
          if (await this.tryAward(agentId, type, threshold, undefined, now)) {
            awarded.push({ agent_id: agentId, milestone_type: type, threshold, achieved_at: now });
          }
        }
      }
    }

    return awarded;
  }

  private async tryAward(
    agentId: string,
    milestoneType: string,
    threshold: number,
    skill: string | undefined,
    now: string,
  ): Promise<boolean> {
    const exists = await this.adapter.hasMilestone(agentId, milestoneType, skill);
    if (exists) return false;
    return this.adapter.saveMilestone({
      agent_id: agentId,
      milestone_type: milestoneType,
      threshold,
      skill,
      achieved_at: now,
    });
  }

  static celebrationTier(milestoneType: string, threshold?: number): CelebrationTier {
    if (milestoneType.startsWith('skill_expert')) return 'epic';
    if (milestoneType.startsWith('skill_proficient')) return 'large';
    if (milestoneType.startsWith('skill_competent')) return 'medium';
    if (milestoneType.startsWith('skill_discovered')) return 'small';
    if (threshold !== undefined) {
      if (threshold >= 50) return 'large';
      if (threshold >= 10) return 'medium';
    }
    return 'small';
  }

  static getBuiltInMilestones(): Record<string, MilestoneConfig> {
    return { ...BUILT_IN };
  }
}
