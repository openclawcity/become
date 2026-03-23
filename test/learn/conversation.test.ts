import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationLearner } from '../../src/learn/conversation.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { ConversationTurn } from '../../src/core/types.js';

let store: MemoryStore;
let learner: ConversationLearner;

function makeTurn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    agent_id: 'agent-1',
    user_message: 'How do I fix this bug?',
    agent_response: 'Check the null pointer on line 42.',
    context: { active_skills: ['debugging'] },
    ...overrides,
  };
}

beforeEach(() => {
  store = new MemoryStore();
  learner = new ConversationLearner(store);
});

describe('scoreResponse', () => {
  it('scores explicit positive as +1 with high confidence', () => {
    const score = learner.scoreResponse(makeTurn({
      feedback: { explicit: 'positive' },
    }));
    expect(score.quality).toBe(1);
    expect(score.confidence).toBe(0.9);
    expect(score.skill_signals).toContain('debugging');
  });

  it('scores explicit negative as -1 with high confidence', () => {
    const score = learner.scoreResponse(makeTurn({
      feedback: { explicit: 'negative' },
    }));
    expect(score.quality).toBe(-1);
    expect(score.confidence).toBe(0.9);
    expect(score.failure_patterns).toContain('explicit_negative');
  });

  it('scores implicit accepted as +1 with medium confidence', () => {
    const score = learner.scoreResponse(makeTurn({
      feedback: { implicit: 'accepted' },
    }));
    expect(score.quality).toBe(1);
    expect(score.confidence).toBe(0.6);
  });

  it('scores implicit retry as -1', () => {
    const score = learner.scoreResponse(makeTurn({
      feedback: { implicit: 'retry' },
    }));
    expect(score.quality).toBe(-1);
    expect(score.confidence).toBe(0.7);
  });

  it('scores implicit modified as 0', () => {
    const score = learner.scoreResponse(makeTurn({
      feedback: { implicit: 'modified' },
    }));
    expect(score.quality).toBe(0);
    expect(score.confidence).toBe(0.5);
  });

  it('scores no feedback as 0 with low confidence', () => {
    const score = learner.scoreResponse(makeTurn());
    expect(score.quality).toBe(0);
    expect(score.confidence).toBe(0.3);
  });

  it('explicit takes priority over implicit', () => {
    const score = learner.scoreResponse(makeTurn({
      feedback: { explicit: 'positive', implicit: 'retry' },
    }));
    expect(score.quality).toBe(1); // explicit wins
  });
});

describe('afterTurn', () => {
  it('persists the score', async () => {
    await learner.afterTurn(makeTurn({ feedback: { explicit: 'positive' } }));
    const scores = await store.getConversationScores('agent-1');
    expect(scores).toHaveLength(1);
    expect(scores[0].quality).toBe(1);
  });

  it('returns learning signal with skill updates', async () => {
    const signal = await learner.afterTurn(makeTurn({
      feedback: { explicit: 'positive' },
    }));
    expect(signal.skill_updates).toHaveLength(1);
    expect(signal.skill_updates[0].skill).toBe('debugging');
    expect(signal.skill_updates[0].delta).toBe(1);
  });

  it('validates agentId', async () => {
    await expect(learner.afterTurn(makeTurn({ agent_id: '' }))).rejects.toThrow();
  });
});

describe('afterSession', () => {
  it('computes session summary', async () => {
    const session = {
      agent_id: 'agent-1',
      turns: [
        makeTurn({ feedback: { explicit: 'positive' } }),
        makeTurn({ feedback: { explicit: 'positive' } }),
        makeTurn({ feedback: { explicit: 'negative' } }),
        makeTurn({ feedback: { implicit: 'accepted' } }),
      ],
    };

    const learning = await learner.afterSession(session);
    expect(learning.turns_scored).toBe(4);
    expect(learning.success_rate).toBe(0.75); // 3 positive out of 4
    expect(learning.should_evolve).toBe(false); // above 0.4
  });

  it('should_evolve triggers below 40% success rate', async () => {
    const session = {
      agent_id: 'agent-1',
      turns: [
        makeTurn({ feedback: { explicit: 'negative' } }),
        makeTurn({ feedback: { explicit: 'negative' } }),
        makeTurn({ feedback: { explicit: 'negative' } }),
        makeTurn({ feedback: { explicit: 'positive' } }),
      ],
    };

    const learning = await learner.afterSession(session);
    expect(learning.success_rate).toBe(0.25);
    expect(learning.should_evolve).toBe(true);
  });

  it('should_evolve requires at least 3 turns', async () => {
    const session = {
      agent_id: 'agent-1',
      turns: [
        makeTurn({ feedback: { explicit: 'negative' } }),
        makeTurn({ feedback: { explicit: 'negative' } }),
      ],
    };

    const learning = await learner.afterSession(session);
    expect(learning.should_evolve).toBe(false); // Only 2 turns
  });

  it('deduplicates failure patterns', async () => {
    const session = {
      agent_id: 'agent-1',
      turns: [
        makeTurn({ feedback: { explicit: 'negative' } }),
        makeTurn({ feedback: { explicit: 'negative' } }),
        makeTurn({ feedback: { explicit: 'negative' } }),
      ],
    };

    const learning = await learner.afterSession(session);
    expect(learning.failure_patterns).toEqual(['explicit_negative']);
  });

  it('tracks skills improved and degraded', async () => {
    const session = {
      agent_id: 'agent-1',
      turns: [
        makeTurn({ context: { active_skills: ['coding'] }, feedback: { explicit: 'positive' } }),
        makeTurn({ context: { active_skills: ['coding'] }, feedback: { explicit: 'positive' } }),
        makeTurn({ context: { active_skills: ['testing'] }, feedback: { explicit: 'negative' } }),
      ],
    };

    const learning = await learner.afterSession(session);
    expect(learning.skills_improved).toContain('coding');
    expect(learning.skills_degraded).toContain('testing');
  });
});

describe('batchScore', () => {
  it('scores multiple turns', () => {
    const turns = [
      makeTurn({ feedback: { explicit: 'positive' } }),
      makeTurn({ feedback: { explicit: 'negative' } }),
      makeTurn(),
    ];
    const scores = learner.batchScore(turns);
    expect(scores).toHaveLength(3);
    expect(scores[0].quality).toBe(1);
    expect(scores[1].quality).toBe(-1);
    expect(scores[2].quality).toBe(0);
  });
});

describe('LLM judge', () => {
  it('uses judge when provided', async () => {
    const judge = {
      score: async () => ({ quality: 1 as const, reasoning: 'helpful' }),
    };
    const learnerWithJudge = new ConversationLearner(store, judge);

    const score = await learnerWithJudge.scoreWithJudge(makeTurn());
    expect(score.quality).toBe(1);
    expect(score.confidence).toBe(0.8);
  });

  it('falls back to feedback scoring on judge error', async () => {
    const judge = {
      score: async () => { throw new Error('API error'); },
    };
    const learnerWithJudge = new ConversationLearner(store, judge);

    const score = await learnerWithJudge.scoreWithJudge(makeTurn({
      feedback: { explicit: 'positive' },
    }));
    expect(score.quality).toBe(1); // Fell back to explicit feedback
  });
});
