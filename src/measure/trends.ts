import type { DreyfusStage, Score, SkillTrend, StorageAdapter } from '../core/types.js';
import { dreyfusStage, nextMilestone, scoreTrend } from '../core/scorer.js';
import { validateAgentId } from '../core/validation.js';

export interface TrendAnalysis {
  skill: string;
  current_score: number;
  stage: DreyfusStage;
  delta_7d: number | null;
  delta_30d: number | null;
  trend_7d: string | null;
  trend_30d: string | null;
  direction: 'accelerating' | 'decelerating' | 'stable' | 'unknown';
  next_milestone: string | null;
}

export class TrendTracker {
  constructor(private adapter: StorageAdapter) {}

  /** Get trend analysis for all skills of an agent */
  async analyze(agentId: string): Promise<TrendAnalysis[]> {
    validateAgentId(agentId);
    const latestScores = await this.adapter.getLatestScores(agentId);
    const analyses: TrendAnalysis[] = [];

    for (const score of latestScores) {
      const [history7, history30] = await Promise.all([
        this.adapter.getScoreHistory(agentId, score.skill, 8),  // 8 days to catch 7-day-ago entries
        this.adapter.getScoreHistory(agentId, score.skill, 31), // 31 days to catch 30-day-ago entries
      ]);

      // Find the oldest score that is NOT the current score (different timestamp)
      const oldEntry7 = history7.find((h) => h.computed_at !== score.computed_at);
      const oldEntry30 = history30.find((h) => h.computed_at !== score.computed_at);

      const oldScore7 = oldEntry7?.score ?? null;
      const oldScore30 = oldEntry30?.score ?? null;

      const delta7 = oldScore7 !== null ? score.score - oldScore7 : null;
      const delta30 = oldScore30 !== null ? score.score - oldScore30 : null;

      analyses.push({
        skill: score.skill,
        current_score: score.score,
        stage: score.dreyfus_stage,
        delta_7d: delta7,
        delta_30d: delta30,
        trend_7d: scoreTrend(score.score, oldScore7),
        trend_30d: oldScore30 !== null ? `${delta30! >= 0 ? '+' : ''}${delta30} this month` : null,
        direction: detectDirection(delta7, delta30),
        next_milestone: nextMilestone(score.dreyfus_stage, score.score),
      });
    }

    return analyses.sort((a, b) => {
      // Sort by absolute 7-day delta descending, then score
      const absA = Math.abs(a.delta_7d ?? 0);
      const absB = Math.abs(b.delta_7d ?? 0);
      return absB - absA || b.current_score - a.current_score;
    });
  }

  /** Get top N skills sorted by 7-day delta (most movement) */
  async topMovers(agentId: string, limit = 5): Promise<TrendAnalysis[]> {
    const all = await this.analyze(agentId);
    return all.slice(0, limit);
  }

  /** Get skills that are accelerating (7-day growth faster than 30-day average) */
  async accelerating(agentId: string): Promise<TrendAnalysis[]> {
    const all = await this.analyze(agentId);
    return all.filter((t) => t.direction === 'accelerating');
  }

  /** Get skills that are decelerating (7-day growth slower than 30-day average) */
  async decelerating(agentId: string): Promise<TrendAnalysis[]> {
    const all = await this.analyze(agentId);
    return all.filter((t) => t.direction === 'decelerating');
  }

  /** Format a trend summary for a single skill (used in heartbeat-like contexts) */
  formatSummary(trend: TrendAnalysis): SkillTrend {
    return {
      skill: trend.skill,
      score: trend.current_score,
      stage: trend.stage,
      trend: trend.trend_7d,
      next_milestone: trend.next_milestone,
    };
  }
}

function detectDirection(
  delta7: number | null,
  delta30: number | null,
): TrendAnalysis['direction'] {
  if (delta7 === null || delta30 === null) return 'unknown';
  if (delta7 === 0 && delta30 === 0) return 'stable';

  // Compare weekly rate to monthly rate
  const weeklyRate = delta7;
  const monthlyWeeklyRate = delta30 / 4; // normalize 30-day to weekly equivalent

  if (Math.abs(weeklyRate) < 1 && Math.abs(monthlyWeeklyRate) < 1) return 'stable';
  if (weeklyRate > monthlyWeeklyRate + 1) return 'accelerating';
  if (weeklyRate < monthlyWeeklyRate - 1) return 'decelerating';
  return 'stable';
}
