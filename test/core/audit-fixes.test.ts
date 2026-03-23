import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../src/adapters/memory.js';
import { SkillStore } from '../../src/core/skill-store.js';
import { Reflector } from '../../src/core/reflector.js';
import { MilestoneDetector } from '../../src/core/milestones.js';
import { computeFullScore } from '../../src/core/scorer.js';
import { validateAgentId } from '../../src/core/validation.js';
import type { Score, ScoreInput } from '../../src/core/types.js';

const EMPTY_EVIDENCE: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
});

// ── Bug #1: scoreHistory type safety ──────────────────────────────────────

describe('scoreHistory type safety', () => {
  it('saves and retrieves scores without any casts', async () => {
    const score: Score = {
      skill: 'coding', score: 50, blooms_level: 'apply', dreyfus_stage: 'competent',
      evidence: EMPTY_EVIDENCE, computed_at: new Date().toISOString(),
    };
    await store.saveScore('agent-1', score);
    const history = await store.getScoreHistory('agent-1', 'coding');
    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(50);
  });
});

// ── Bug #2: computeFullScore evidence clone ───────────────────────────────

describe('computeFullScore evidence isolation', () => {
  it('does not share evidence by reference with input', () => {
    const input: ScoreInput = { ...EMPTY_EVIDENCE, artifact_count: 5, total_reactions: 10 };
    const score = computeFullScore('debugging', input);

    // Mutate the original input
    input.artifact_count = 999;

    // Score evidence should be unchanged
    expect(score.evidence.artifact_count).toBe(5);
  });
});

// ── Bug #3: deleteSkill updates catalog adopter count ─────────────────────

describe('deleteSkill catalog consistency', () => {
  it('decrements adopter count when skill is deleted', async () => {
    const skills = new SkillStore(store);

    await skills.upsert('agent-1', { name: 'coding' });
    await skills.upsert('agent-2', { name: 'coding' });
    await skills.upsert('agent-3', { name: 'coding' });

    // Should be verified at 3 adopters
    let catalog = await skills.catalog();
    expect(catalog.find(c => c.skill === 'coding')!.status).toBe('verified');
    expect(catalog.find(c => c.skill === 'coding')!.adopter_count).toBe(3);

    // Delete one agent's skill
    await skills.delete('agent-1', 'coding');

    catalog = await skills.catalog();
    expect(catalog.find(c => c.skill === 'coding')!.adopter_count).toBe(2);
  });
});

// ── Bug #4: Catalog status downgrade protection ───────────────────────────

describe('catalog status not downgraded on re-register', () => {
  it('keeps verified status when new agent registers existing skill', async () => {
    const skills = new SkillStore(store);

    // Get to verified
    await skills.upsert('agent-1', { name: 'music' });
    await skills.upsert('agent-2', { name: 'music' });
    await skills.upsert('agent-3', { name: 'music' });

    let catalog = await skills.catalog();
    expect(catalog.find(c => c.skill === 'music')!.status).toBe('verified');

    // 4th agent registers — should NOT downgrade to community
    await skills.upsert('agent-4', { name: 'music' });

    catalog = await skills.catalog();
    expect(catalog.find(c => c.skill === 'music')!.status).toBe('verified');
  });
});

// ── Bug #6: stripHtml robustness ──────────────────────────────────────────

describe('stripHtml security', () => {
  const reflector = new Reflector(new MemoryStore());

  it('strips complete HTML tags', async () => {
    const r = await reflector.reflect('agent-1', {
      skill: 'coding',
      reflection: '<b>bold</b> and <script>alert(1)</script> and normal text here for length',
    });
    expect(r.reflection).not.toContain('<');
    expect(r.reflection).not.toContain('>');
  });

  it('strips unclosed tags', async () => {
    const r = await reflector.reflect('agent-1', {
      skill: 'coding',
      reflection: 'This is a valid reflection text before <script and some more text to reach the minimum length requirement here',
    });
    expect(r.reflection).not.toContain('<');
  });

  it('strips nested/malformed tags', async () => {
    const r = await reflector.reflect('agent-1', {
      skill: 'coding',
      reflection: '<<script>>alert(1)<</script>> and normal text to pass minimum length',
    });
    expect(r.reflection).not.toContain('<');
    expect(r.reflection).not.toContain('>');
  });

  it('handles angle brackets in non-tag context', async () => {
    const r = await reflector.reflect('agent-1', {
      skill: 'math',
      reflection: 'I learned that when a is less than b and b is greater than c then something interesting happens',
    });
    expect(r.reflection.length).toBeGreaterThan(0);
  });
});

// ── Bug #7: agentId validation ────────────────────────────────────────────

describe('validateAgentId', () => {
  it('accepts valid agent IDs', () => {
    expect(() => validateAgentId('agent-1')).not.toThrow();
    expect(() => validateAgentId('user:abc-123')).not.toThrow();
    expect(() => validateAgentId('org/agent.v2')).not.toThrow();
    expect(() => validateAgentId('user@domain')).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => validateAgentId('')).toThrow('required');
  });

  it('rejects too-long string', () => {
    expect(() => validateAgentId('a'.repeat(201))).toThrow('too long');
  });

  it('rejects special characters', () => {
    expect(() => validateAgentId('agent<script>')).toThrow('invalid characters');
    expect(() => validateAgentId('agent; DROP TABLE')).toThrow('invalid characters');
    expect(() => validateAgentId('agent\nid')).toThrow('invalid characters');
  });
});

describe('agentId validation in SkillStore', () => {
  it('rejects empty agentId on upsert', async () => {
    const skills = new SkillStore(store);
    await expect(skills.upsert('', { name: 'coding' })).rejects.toThrow();
  });

  it('rejects injection in agentId', async () => {
    const skills = new SkillStore(store);
    await expect(skills.upsert('agent; DROP TABLE', { name: 'coding' })).rejects.toThrow('invalid characters');
  });
});

describe('agentId validation in Reflector', () => {
  it('rejects empty agentId on reflect', async () => {
    const reflector = new Reflector(store);
    await expect(reflector.reflect('', {
      skill: 'coding',
      reflection: 'A valid reflection that meets minimum length requirements.',
    })).rejects.toThrow();
  });
});

describe('agentId validation in MilestoneDetector', () => {
  it('rejects empty agentId on check', async () => {
    const detector = new MilestoneDetector(store);
    await expect(detector.check('', [])).rejects.toThrow();
  });
});

// ── Bug #9: Milestone redundant calls optimization ────────────────────────

describe('milestone global deduplication', () => {
  it('awards first_artifact only once even with multiple scores', async () => {
    const detector = new MilestoneDetector(store);
    const scores: Score[] = [
      { skill: 'coding', score: 20, blooms_level: 'apply', dreyfus_stage: 'beginner', evidence: { ...EMPTY_EVIDENCE, artifact_count: 5 }, computed_at: new Date().toISOString() },
      { skill: 'testing', score: 15, blooms_level: 'understand', dreyfus_stage: 'novice', evidence: { ...EMPTY_EVIDENCE, artifact_count: 3 }, computed_at: new Date().toISOString() },
      { skill: 'design', score: 10, blooms_level: 'understand', dreyfus_stage: 'novice', evidence: { ...EMPTY_EVIDENCE, artifact_count: 2 }, computed_at: new Date().toISOString() },
    ];

    const milestones = await detector.check('agent-1', scores);
    const firstArtifacts = milestones.filter(m => m.milestone_type === 'first_artifact');
    expect(firstArtifacts).toHaveLength(1);
  });
});

// ── Bug #10: MemoryStore clear ────────────────────────────────────────────

describe('MemoryStore.clear', () => {
  it('resets all data', async () => {
    await store.upsertSkill({
      agent_id: 'a1', name: 'coding', score: 50, blooms_level: 'apply',
      dreyfus_stage: 'competent', evidence: EMPTY_EVIDENCE, learned_from: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    await store.saveMilestone({ agent_id: 'a1', milestone_type: 'first_artifact', threshold: 1, achieved_at: new Date().toISOString() });
    await store.grantReputation('a1', 10, 'test', 'test');

    expect(await store.listSkills('a1')).toHaveLength(1);
    expect(await store.getMilestones('a1')).toHaveLength(1);
    expect(await store.getReputation('a1')).toBe(10);

    store.clear();

    expect(await store.listSkills('a1')).toHaveLength(0);
    expect(await store.getMilestones('a1')).toHaveLength(0);
    expect(await store.getReputation('a1')).toBe(0);
  });
});

// ── Bug #11: getConversationScores ordering ───────────────────────────────

describe('getConversationScores ordering', () => {
  it('returns most recent first', async () => {
    await store.saveConversationScore('a1', { quality: -1, confidence: 0.5, skill_signals: [] });
    await store.saveConversationScore('a1', { quality: 0, confidence: 0.5, skill_signals: [] });
    await store.saveConversationScore('a1', { quality: 1, confidence: 0.9, skill_signals: ['coding'] });

    const scores = await store.getConversationScores('a1', { limit: 2 });
    expect(scores).toHaveLength(2);
    // Most recent (quality=1) should be first
    expect(scores[0].quality).toBe(1);
    expect(scores[1].quality).toBe(0);
  });
});

// ── Edge case: negative score inputs ──────────────────────────────────────

describe('scorer handles edge cases', () => {
  it('clamps negative input values to produce valid score', () => {
    const score = computeFullScore('test', {
      ...EMPTY_EVIDENCE,
      artifact_count: -5,
      total_reactions: -10,
    });
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });
});
