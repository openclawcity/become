import { describe, it, expect } from 'vitest';
import { toTrainingDataset, datasetStats, filterHighQuality } from '../../src/rl/dataset.js';
import type { ScoredTurn } from '../../src/rl/dataset.js';

function makeTurn(quality: -1 | 0 | 1, confidence = 0.9, skills: string[] = ['coding']): ScoredTurn {
  return {
    turn: {
      agent_id: 'agent-1',
      user_message: 'Fix the bug in the login form',
      agent_response: 'I found the issue on line 42. The null check was missing.',
      context: { active_skills: skills, current_task: 'Debug login form' },
    },
    score: {
      quality,
      confidence,
      skill_signals: skills,
      failure_patterns: quality === -1 ? ['missed_error'] : undefined,
    },
  };
}

describe('toTrainingDataset', () => {
  it('includes only positive examples', () => {
    const turns = [
      makeTurn(1),
      makeTurn(-1),
      makeTurn(0),
      makeTurn(1),
    ];

    const dataset = toTrainingDataset(turns);
    const lines = dataset.trim().split('\n');
    expect(lines).toHaveLength(2); // Only 2 positive
  });

  it('returns empty string with no positive examples', () => {
    const turns = [makeTurn(-1), makeTurn(0)];
    expect(toTrainingDataset(turns)).toBe('');
  });

  it('generates valid Alpaca format', () => {
    const dataset = toTrainingDataset([makeTurn(1)], 'alpaca');
    const parsed = JSON.parse(dataset.trim());
    expect(parsed).toHaveProperty('instruction');
    expect(parsed).toHaveProperty('input');
    expect(parsed).toHaveProperty('output');
    expect(parsed.output).toBe('I found the issue on line 42. The null check was missing.');
  });

  it('generates valid ShareGPT format', () => {
    const dataset = toTrainingDataset([makeTurn(1)], 'sharegpt');
    const parsed = JSON.parse(dataset.trim());
    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations[0].from).toBe('human');
    expect(parsed.conversations[1].from).toBe('gpt');
  });

  it('generates valid OpenAI format', () => {
    const dataset = toTrainingDataset([makeTurn(1)], 'openai');
    const parsed = JSON.parse(dataset.trim());
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe('user');
    expect(parsed.messages[1].role).toBe('assistant');
  });

  it('produces JSONL (one JSON per line)', () => {
    const turns = [makeTurn(1), makeTurn(1), makeTurn(1)];
    const dataset = toTrainingDataset(turns);
    const lines = dataset.trim().split('\n');
    expect(lines).toHaveLength(3);
    // Each line is valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('uses current_task as instruction in Alpaca format', () => {
    const dataset = toTrainingDataset([makeTurn(1)], 'alpaca');
    const parsed = JSON.parse(dataset.trim());
    expect(parsed.instruction).toBe('Debug login form');
  });
});

describe('datasetStats', () => {
  it('computes correct statistics', () => {
    const turns = [
      makeTurn(1, 0.9, ['coding']),
      makeTurn(1, 0.8, ['coding', 'testing']),
      makeTurn(-1, 0.7, ['coding']),
      makeTurn(0, 0.5),
    ];

    const stats = datasetStats(turns);
    expect(stats.total_turns).toBe(4);
    expect(stats.positive).toBe(2);
    expect(stats.negative).toBe(1);
    expect(stats.neutral).toBe(1);
    expect(stats.training_examples).toBe(2);
    expect(stats.skills_covered).toContain('coding');
    expect(stats.skills_covered).toContain('testing');
    expect(stats.avg_confidence).toBeCloseTo(0.73, 1);
  });

  it('handles empty input', () => {
    const stats = datasetStats([]);
    expect(stats.total_turns).toBe(0);
    expect(stats.training_examples).toBe(0);
    expect(stats.avg_confidence).toBe(0);
  });
});

describe('filterHighQuality', () => {
  it('filters by quality and confidence', () => {
    const turns = [
      makeTurn(1, 0.9),
      makeTurn(1, 0.5),   // below threshold
      makeTurn(-1, 0.9),  // negative
      makeTurn(1, 0.8),
    ];

    const filtered = filterHighQuality(turns, 0.7);
    expect(filtered).toHaveLength(2);
    expect(filtered.every(t => t.score.quality === 1 && t.score.confidence >= 0.7)).toBe(true);
  });

  it('defaults to 0.7 confidence threshold', () => {
    const turns = [makeTurn(1, 0.6), makeTurn(1, 0.8)];
    expect(filterHighQuality(turns)).toHaveLength(1);
  });
});
