import type { StorageAdapter } from '../core/types.js';
import { toTrainingDataset, filterHighQuality, datasetStats } from './dataset.js';
import type { ScoredTurn } from './dataset.js';

export interface SchedulerConfig {
  /** Storage adapter to fetch scored turns */
  adapter: StorageAdapter;
  /** Agent ID to train for */
  agentId: string;
  /** Minimum scored turns before training triggers */
  minSamples: number;
  /** Minimum confidence threshold for training examples */
  minConfidence?: number;
  /** Check interval in milliseconds (default: 30 minutes) */
  intervalMs?: number;
  /** Callback when training should occur */
  onReady: (dataset: string, stats: ReturnType<typeof datasetStats>) => void | Promise<void>;
}

export type SchedulerStatus = 'idle' | 'checking' | 'ready' | 'stopped';

export class TrainScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: SchedulerStatus = 'idle';
  private config: Required<SchedulerConfig>;

  constructor(config: SchedulerConfig) {
    this.config = {
      ...config,
      minConfidence: config.minConfidence ?? 0.7,
      intervalMs: config.intervalMs ?? 30 * 60 * 1000,
    };
  }

  start(): void {
    if (this.timer) return;
    this.status = 'idle';
    this.timer = setInterval(() => this.check(), this.config.intervalMs);
    // Run first check immediately
    this.check();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'stopped';
  }

  getStatus(): SchedulerStatus {
    return this.status;
  }

  private async check(): Promise<void> {
    if (this.status === 'stopped') return;
    this.status = 'checking';

    try {
      const rawScores = await this.config.adapter.getConversationScores(
        this.config.agentId,
        { limit: 500 },
      );

      // We only have ResponseScore from the adapter, need to construct ScoredTurns
      // In practice, the caller would maintain the full turn data
      // For now, check if we have enough positive high-confidence scores
      const highConfPositive = rawScores.filter(
        (s) => s.quality === 1 && s.confidence >= this.config.minConfidence,
      );

      if (highConfPositive.length >= this.config.minSamples) {
        this.status = 'ready';
        // The actual dataset construction requires full turns, which the caller provides
        // Signal readiness
        await this.config.onReady('', {
          total_turns: rawScores.length,
          positive: rawScores.filter((s) => s.quality === 1).length,
          negative: rawScores.filter((s) => s.quality === -1).length,
          neutral: rawScores.filter((s) => s.quality === 0).length,
          training_examples: highConfPositive.length,
          skills_covered: [...new Set(rawScores.flatMap((s) => s.skill_signals))],
          avg_confidence: rawScores.length > 0
            ? Math.round(rawScores.reduce((sum, s) => sum + s.confidence, 0) / rawScores.length * 100) / 100
            : 0,
        });
      }

      this.status = 'idle';
    } catch {
      this.status = 'idle';
    }
  }
}
