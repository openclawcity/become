import { describe, it, expect } from 'vitest';
import { SkillEvolver } from '../../src/learn/skill-evolver.js';
import type { ResponseScore, Skill, ConversationTurn, ScoreInput } from '../../src/core/types.js';

const EMPTY_EVIDENCE: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

function makeSkill(name: string): Skill {
  const now = new Date().toISOString();
  return {
    agent_id: 'agent-1', name, category: 'general', score: 20,
    blooms_level: 'apply', dreyfus_stage: 'beginner',
    evidence: EMPTY_EVIDENCE, learned_from: [],
    created_at: now, updated_at: now,
  };
}

describe('shouldEvolve', () => {
  it('returns false with fewer than 3 scores', () => {
    const evolver = new SkillEvolver({ generate: async () => '[]' });
    const scores: ResponseScore[] = [
      { quality: -1, confidence: 0.9, skill_signals: [] },
      { quality: -1, confidence: 0.9, skill_signals: [] },
    ];
    expect(evolver.shouldEvolve(scores)).toBe(false);
  });

  it('returns true when success rate below 40%', () => {
    const evolver = new SkillEvolver({ generate: async () => '[]' });
    const scores: ResponseScore[] = [
      { quality: -1, confidence: 0.9, skill_signals: [] },
      { quality: -1, confidence: 0.9, skill_signals: [] },
      { quality: -1, confidence: 0.9, skill_signals: [] },
      { quality: 1, confidence: 0.9, skill_signals: ['coding'] },
    ];
    expect(evolver.shouldEvolve(scores)).toBe(true); // 25% success
  });

  it('returns false when success rate above 40%', () => {
    const evolver = new SkillEvolver({ generate: async () => '[]' });
    const scores: ResponseScore[] = [
      { quality: 1, confidence: 0.9, skill_signals: ['coding'] },
      { quality: 1, confidence: 0.9, skill_signals: ['coding'] },
      { quality: -1, confidence: 0.9, skill_signals: [] },
    ];
    expect(evolver.shouldEvolve(scores)).toBe(false); // 67% success
  });
});

describe('evolve', () => {
  it('generates skills from LLM response', async () => {
    const llm = {
      generate: async () => JSON.stringify([
        { name: 'error_handling', category: 'coding', content: 'Always wrap external calls in try-catch blocks to handle failures gracefully.' },
      ]),
    };
    const evolver = new SkillEvolver(llm);

    const failures = [{
      turn: {
        agent_id: 'agent-1',
        user_message: 'Fix this crash',
        agent_response: 'I changed the function',
        context: { active_skills: ['coding'] },
        feedback: { explicit: 'negative' as const },
      },
      score: { quality: -1 as const, confidence: 0.9, skill_signals: [], failure_patterns: ['crash_not_fixed'] },
    }];

    const skills = await evolver.evolve(failures, []);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('error_handling');
    expect(skills[0].source).toBe('evolved');
  });

  it('deduplicates against existing skills', async () => {
    const llm = {
      generate: async () => JSON.stringify([
        { name: 'debugging', category: 'coding', content: 'Use print statements.' },
        { name: 'new_skill', category: 'coding', content: 'Something new.' },
      ]),
    };
    const evolver = new SkillEvolver(llm);

    const skills = await evolver.evolve(
      [{ turn: { agent_id: 'a', user_message: 'x', agent_response: 'y', context: { active_skills: [] } }, score: { quality: -1, confidence: 0.9, skill_signals: [] } }],
      [makeSkill('debugging')],
    );

    expect(skills.every(s => s.name !== 'debugging')).toBe(true);
    expect(skills.some(s => s.name === 'new_skill')).toBe(true);
  });

  it('limits to 3 skills per evolution', async () => {
    const llm = {
      generate: async () => JSON.stringify([
        { name: 'a', category: 'coding', content: 'Skill A.' },
        { name: 'b', category: 'coding', content: 'Skill B.' },
        { name: 'c', category: 'coding', content: 'Skill C.' },
        { name: 'd', category: 'coding', content: 'Skill D.' },
      ]),
    };
    const evolver = new SkillEvolver(llm);

    const skills = await evolver.evolve(
      [{ turn: { agent_id: 'a', user_message: 'x', agent_response: 'y', context: { active_skills: [] } }, score: { quality: -1, confidence: 0.9, skill_signals: [] } }],
      [],
    );
    expect(skills.length).toBeLessThanOrEqual(3);
  });

  it('handles LLM errors gracefully', async () => {
    const llm = {
      generate: async () => { throw new Error('API down'); },
    };
    const evolver = new SkillEvolver(llm);

    const skills = await evolver.evolve(
      [{ turn: { agent_id: 'a', user_message: 'x', agent_response: 'y', context: { active_skills: [] } }, score: { quality: -1, confidence: 0.9, skill_signals: [] } }],
      [],
    );
    expect(skills).toHaveLength(0);
  });

  it('handles malformed LLM output', async () => {
    const llm = {
      generate: async () => 'Here are some suggestions:\n\nNot valid JSON at all',
    };
    const evolver = new SkillEvolver(llm);

    const skills = await evolver.evolve(
      [{ turn: { agent_id: 'a', user_message: 'x', agent_response: 'y', context: { active_skills: [] } }, score: { quality: -1, confidence: 0.9, skill_signals: [] } }],
      [],
    );
    expect(skills).toHaveLength(0);
  });
});
