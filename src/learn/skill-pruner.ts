import type { Score, Skill, StorageAdapter } from '../core/types.js';

const DEFAULT_MIN_AGE_DAYS = 14;
const PROTECTED_STAGES = new Set(['competent', 'proficient', 'expert']);

export class SkillPruner {
  /**
   * Identify skills that don't correlate with improved scores.
   *
   * Rules:
   * - Skill must be at least minAge days old
   * - Score has not improved (delta <= 0) over skill's lifetime → candidate
   * - Auto-generated (source='evolved') + score degraded → strong candidate
   * - Never prune skills at competent stage or above
   */
  findIneffective(
    skills: Skill[],
    scoreHistory: Map<string, Score[]>,
    minAge = DEFAULT_MIN_AGE_DAYS,
  ): string[] {
    const now = Date.now();
    const minAgeMs = minAge * 24 * 60 * 60 * 1000;
    const candidates: string[] = [];

    for (const skill of skills) {
      // Never prune high-stage skills
      if (PROTECTED_STAGES.has(skill.dreyfus_stage)) continue;

      // Must be old enough
      const age = now - new Date(skill.created_at).getTime();
      if (age < minAgeMs) continue;

      // Check score trajectory
      const history = scoreHistory.get(skill.name) ?? [];
      if (history.length < 2) continue;

      const oldest = history[0].score;
      const newest = history[history.length - 1].score;
      const delta = newest - oldest;

      if (delta > 0) continue; // Improving — keep

      // delta <= 0: stagnant or degrading — candidate for pruning
      candidates.push(skill.name);
    }

    return candidates;
  }

  /** Remove identified skills */
  async prune(adapter: StorageAdapter, agentId: string, skillNames: string[]): Promise<number> {
    let removed = 0;
    for (const name of skillNames) {
      await adapter.deleteSkill(agentId, name);
      removed++;
    }
    return removed;
  }
}
