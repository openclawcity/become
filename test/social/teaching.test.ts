import { describe, it, expect, beforeEach } from 'vitest';
import { TeachingProtocol } from '../../src/social/teaching.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { Skill } from '../../src/core/types.js';

let store: MemoryStore;
let teaching: TeachingProtocol;

const now = new Date().toISOString();
const EMPTY_EVIDENCE = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

function makeSkill(agentId: string, name: string, stage: Skill['dreyfus_stage'], score: number): Skill {
  return {
    agent_id: agentId, name, category: 'general', score,
    blooms_level: 'remember', dreyfus_stage: stage,
    evidence: EMPTY_EVIDENCE, learned_from: [],
    created_at: now, updated_at: now,
  };
}

beforeEach(() => {
  store = new MemoryStore();
  teaching = new TeachingProtocol(store);
});

describe('teach', () => {
  it('creates a learning edge', async () => {
    const edge = await teaching.teach('teacher-1', 'student-1', 'coding');
    expect(edge.from_agent).toBe('teacher-1');
    expect(edge.to_agent).toBe('student-1');
    expect(edge.event_type).toBe('teaching');
    expect(edge.skill).toBe('coding');
  });

  it('rejects self-teaching', async () => {
    await expect(teaching.teach('agent-1', 'agent-1', 'coding')).rejects.toThrow('yourself');
  });

  it('rejects invalid agentId', async () => {
    await expect(teaching.teach('', 'student', 'coding')).rejects.toThrow();
  });

  it('stores the learning edge in adapter', async () => {
    await teaching.teach('teacher-1', 'student-1', 'coding');
    const edges = await store.getLearningEdges('student-1', 'to');
    expect(edges).toHaveLength(1);
    expect(edges[0].from_agent).toBe('teacher-1');
  });
});

describe('findTeachers', () => {
  it('returns skill holders sorted by score', async () => {
    await store.upsertSkill(makeSkill('agent-1', 'coding', 'expert', 90));
    await store.upsertSkill(makeSkill('agent-2', 'coding', 'competent', 45));
    await store.upsertSkill(makeSkill('agent-3', 'coding', 'beginner', 20));

    const teachers = await teaching.findTeachers('coding');
    expect(teachers).toHaveLength(3);
    expect(teachers[0].agent_id).toBe('agent-1');
    expect(teachers[0].score).toBe(90);
  });

  it('filters by min stage', async () => {
    await store.upsertSkill(makeSkill('agent-1', 'coding', 'expert', 90));
    await store.upsertSkill(makeSkill('agent-2', 'coding', 'competent', 45));
    await store.upsertSkill(makeSkill('agent-3', 'coding', 'beginner', 20));

    const teachers = await teaching.findTeachers('coding', { minStage: 'competent' });
    expect(teachers).toHaveLength(2);
    expect(teachers.every(t => ['competent', 'proficient', 'expert'].includes(t.stage))).toBe(true);
  });
});

describe('findStudents', () => {
  it('returns agents at lower stage than teacher', async () => {
    await store.upsertSkill(makeSkill('teacher', 'coding', 'expert', 90));
    await store.upsertSkill(makeSkill('student-1', 'coding', 'beginner', 20));
    await store.upsertSkill(makeSkill('student-2', 'coding', 'competent', 45));

    const students = await teaching.findStudents('coding', 'teacher');
    expect(students).toHaveLength(2);
    expect(students[0].agent_id).toBe('student-1'); // Lower score first
  });

  it('excludes teacher from results', async () => {
    await store.upsertSkill(makeSkill('teacher', 'coding', 'expert', 90));
    await store.upsertSkill(makeSkill('student', 'coding', 'beginner', 20));

    const students = await teaching.findStudents('coding', 'teacher');
    expect(students.every(s => s.agent_id !== 'teacher')).toBe(true);
  });

  it('excludes agents at same level', async () => {
    await store.upsertSkill(makeSkill('teacher', 'coding', 'competent', 50));
    await store.upsertSkill(makeSkill('peer', 'coding', 'competent', 45));
    await store.upsertSkill(makeSkill('student', 'coding', 'beginner', 20));

    const students = await teaching.findStudents('coding', 'teacher');
    expect(students).toHaveLength(1);
    expect(students[0].agent_id).toBe('student');
  });
});

describe('teachingHistory', () => {
  it('returns only teaching events', async () => {
    await teaching.teach('agent-1', 'agent-2', 'coding');
    // Add a non-teaching edge directly
    await store.saveLearningEdge({
      from_agent: 'agent-1', to_agent: 'agent-3', skill: 'coding',
      event_type: 'collaboration', score_delta: 0, created_at: now,
    });

    const history = await teaching.teachingHistory('agent-1');
    expect(history).toHaveLength(1);
    expect(history[0].event_type).toBe('teaching');
  });
});
