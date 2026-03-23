import type { ConversationTurn, ResponseScore } from '../core/types.js';

export interface ScoredTurn {
  turn: ConversationTurn;
  score: ResponseScore;
}

export type DatasetFormat = 'alpaca' | 'sharegpt' | 'openai';

interface AlpacaEntry {
  instruction: string;
  input: string;
  output: string;
  quality: number;
}

interface ShareGPTEntry {
  conversations: { from: string; value: string }[];
  quality: number;
}

interface OpenAIEntry {
  messages: { role: string; content: string }[];
  quality: number;
}

/**
 * Convert scored conversation turns into a fine-tuning dataset.
 *
 * Only includes turns with quality === 1 (positive) as training examples.
 * Turns with quality === -1 are excluded (we train on what works, not what fails).
 * Turns with quality === 0 are excluded (uncertain signal).
 */
export function toTrainingDataset(
  scoredTurns: ScoredTurn[],
  format: DatasetFormat = 'alpaca',
): string {
  // Filter to positive examples only
  const positive = scoredTurns.filter((st) => st.score.quality === 1);

  if (positive.length === 0) return '';

  const lines: string[] = [];

  for (const { turn, score } of positive) {
    let entry: string;

    switch (format) {
      case 'alpaca':
        entry = JSON.stringify({
          instruction: turn.context.current_task ?? 'Respond helpfully to the user.',
          input: turn.user_message,
          output: turn.agent_response,
          quality: score.quality,
        } satisfies AlpacaEntry);
        break;

      case 'sharegpt':
        entry = JSON.stringify({
          conversations: [
            { from: 'human', value: turn.user_message },
            { from: 'gpt', value: turn.agent_response },
          ],
          quality: score.quality,
        } satisfies ShareGPTEntry);
        break;

      case 'openai':
        entry = JSON.stringify({
          messages: [
            { role: 'user', content: turn.user_message },
            { role: 'assistant', content: turn.agent_response },
          ],
          quality: score.quality,
        } satisfies OpenAIEntry);
        break;
    }

    lines.push(entry);
  }

  return lines.join('\n') + '\n';
}

/**
 * Get statistics about a dataset before training.
 */
export function datasetStats(scoredTurns: ScoredTurn[]): {
  total_turns: number;
  positive: number;
  negative: number;
  neutral: number;
  training_examples: number;
  skills_covered: string[];
  avg_confidence: number;
} {
  const positive = scoredTurns.filter((st) => st.score.quality === 1);
  const negative = scoredTurns.filter((st) => st.score.quality === -1);
  const neutral = scoredTurns.filter((st) => st.score.quality === 0);

  const skills = new Set<string>();
  for (const st of scoredTurns) {
    for (const s of st.score.skill_signals) {
      skills.add(s);
    }
  }

  const totalConfidence = scoredTurns.reduce((sum, st) => sum + st.score.confidence, 0);

  return {
    total_turns: scoredTurns.length,
    positive: positive.length,
    negative: negative.length,
    neutral: neutral.length,
    training_examples: positive.length,
    skills_covered: [...skills],
    avg_confidence: scoredTurns.length > 0
      ? Math.round((totalConfidence / scoredTurns.length) * 100) / 100
      : 0,
  };
}

/**
 * Filter scored turns for high-confidence positive examples.
 * Use this before training to get the cleanest dataset.
 */
export function filterHighQuality(
  scoredTurns: ScoredTurn[],
  minConfidence = 0.7,
): ScoredTurn[] {
  return scoredTurns.filter(
    (st) => st.score.quality === 1 && st.score.confidence >= minConfidence,
  );
}
