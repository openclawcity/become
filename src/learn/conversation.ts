import type { ConversationTurn, ResponseScore, StorageAdapter } from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

export interface LearningSignal {
  skill_updates: { skill: string; delta: number; reason: string }[];
  new_skills?: string[];
  observations?: string[];
}

export interface ConversationSession {
  agent_id: string;
  session_id?: string;
  turns: ConversationTurn[];
}

export interface SessionLearning {
  turns_scored: number;
  success_rate: number;
  skills_improved: string[];
  skills_degraded: string[];
  failure_patterns: string[];
  should_evolve: boolean;
}

/** Optional LLM judge for automated response scoring */
export interface LLMJudge {
  score(userMessage: string, agentResponse: string, context?: string): Promise<{ quality: -1 | 0 | 1; reasoning: string }>;
}

const EVOLVE_THRESHOLD = 0.4;

export class ConversationLearner {
  constructor(
    private adapter: StorageAdapter,
    private judge?: LLMJudge,
  ) {}

  /** Score a single conversation turn using feedback signals */
  scoreResponse(turn: ConversationTurn): ResponseScore {
    const feedback = turn.feedback;

    // Explicit feedback is strongest signal
    if (feedback?.explicit === 'positive') {
      return { quality: 1, confidence: 0.9, skill_signals: turn.context.active_skills };
    }
    if (feedback?.explicit === 'negative') {
      return { quality: -1, confidence: 0.9, skill_signals: turn.context.active_skills, failure_patterns: ['explicit_negative'] };
    }

    // Implicit feedback is secondary
    if (feedback?.implicit === 'accepted') {
      return { quality: 1, confidence: 0.6, skill_signals: turn.context.active_skills };
    }
    if (feedback?.implicit === 'retry') {
      return { quality: -1, confidence: 0.7, skill_signals: turn.context.active_skills, failure_patterns: ['user_retry'] };
    }
    if (feedback?.implicit === 'modified') {
      return { quality: 0, confidence: 0.5, skill_signals: turn.context.active_skills };
    }

    // No feedback — uncertain
    return { quality: 0, confidence: 0.3, skill_signals: turn.context.active_skills };
  }

  /** Score using optional LLM judge for higher-quality automated assessment */
  async scoreWithJudge(turn: ConversationTurn): Promise<ResponseScore> {
    if (!this.judge) {
      return this.scoreResponse(turn);
    }

    try {
      const result = await this.judge.score(
        turn.user_message,
        turn.agent_response,
        turn.context.current_task,
      );
      return {
        quality: result.quality,
        confidence: 0.8,
        skill_signals: turn.context.active_skills,
        failure_patterns: result.quality === -1 ? [result.reasoning] : undefined,
      };
    } catch {
      // Fallback to feedback-based scoring if judge fails
      return this.scoreResponse(turn);
    }
  }

  /** Process a turn: score it and persist */
  async afterTurn(turn: ConversationTurn): Promise<LearningSignal> {
    validateAgentId(turn.agent_id);
    const score = this.judge
      ? await this.scoreWithJudge(turn)
      : this.scoreResponse(turn);

    await this.adapter.saveConversationScore(turn.agent_id, {
      ...score,
      session_id: turn.session_id,
    });

    const skillUpdates = score.skill_signals.map((skill) => ({
      skill,
      delta: score.quality,
      reason: score.quality === 1 ? 'positive_feedback' : score.quality === -1 ? 'negative_feedback' : 'neutral',
    }));

    return {
      skill_updates: skillUpdates,
      observations: score.failure_patterns,
    };
  }

  /** Summarize learning across a full session */
  async afterSession(session: ConversationSession): Promise<SessionLearning> {
    validateAgentId(session.agent_id);
    const scores: ResponseScore[] = [];

    for (const turn of session.turns) {
      const score = this.judge
        ? await this.scoreWithJudge(turn)
        : this.scoreResponse(turn);
      scores.push(score);

      await this.adapter.saveConversationScore(session.agent_id, {
        ...score,
        session_id: session.session_id,
      });
    }

    const positive = scores.filter((s) => s.quality === 1).length;
    const total = scores.length;
    const successRate = total > 0 ? positive / total : 0;

    // Aggregate skill signals
    const skillDelta = new Map<string, number>();
    for (const score of scores) {
      for (const skill of score.skill_signals) {
        skillDelta.set(skill, (skillDelta.get(skill) ?? 0) + score.quality);
      }
    }

    const improved: string[] = [];
    const degraded: string[] = [];
    for (const [skill, delta] of skillDelta) {
      if (delta > 0) improved.push(skill);
      else if (delta < 0) degraded.push(skill);
    }

    const failurePatterns = scores
      .flatMap((s) => s.failure_patterns ?? [])
      .filter((p, i, arr) => arr.indexOf(p) === i); // dedupe

    return {
      turns_scored: total,
      success_rate: successRate,
      skills_improved: improved,
      skills_degraded: degraded,
      failure_patterns: failurePatterns,
      should_evolve: successRate < EVOLVE_THRESHOLD && total >= 3,
    };
  }

  /** Batch score multiple turns */
  batchScore(turns: ConversationTurn[]): ResponseScore[] {
    return turns.map((turn) => this.scoreResponse(turn));
  }
}
