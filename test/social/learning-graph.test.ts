import { describe, it, expect, beforeEach } from 'vitest';
import { LearningGraph } from '../../src/social/learning-graph.js';
import { MemoryStore } from '../../src/adapters/memory.js';

let store: MemoryStore;
let graph: LearningGraph;
const now = new Date().toISOString();

beforeEach(() => {
  store = new MemoryStore();
  graph = new LearningGraph(store);
});

async function addEdge(from: string, to: string, skill: string, delta = 0, type: 'teaching' | 'peer_review' = 'teaching') {
  await store.saveLearningEdge({
    from_agent: from, to_agent: to, skill,
    event_type: type, score_delta: delta, created_at: now,
  });
}

describe('edges', () => {
  it('returns outgoing edges', async () => {
    await addEdge('a', 'b', 'coding');
    await addEdge('a', 'c', 'testing');
    const edges = await graph.edges('a', 'from');
    expect(edges).toHaveLength(2);
  });

  it('returns incoming edges', async () => {
    await addEdge('a', 'b', 'coding');
    await addEdge('c', 'b', 'testing');
    const edges = await graph.edges('b', 'to');
    expect(edges).toHaveLength(2);
  });

  it('returns both directions', async () => {
    await addEdge('a', 'b', 'coding');
    await addEdge('c', 'a', 'testing');
    const edges = await graph.edges('a', 'both');
    expect(edges).toHaveLength(2);
  });
});

describe('topMentors', () => {
  it('aggregates by source agent', async () => {
    await addEdge('mentor-1', 'student', 'coding', 5);
    await addEdge('mentor-1', 'student', 'testing', 3);
    await addEdge('mentor-2', 'student', 'coding', 2);

    const mentors = await graph.topMentors('student');
    expect(mentors).toHaveLength(2);
    expect(mentors[0].agent).toBe('mentor-1');
    expect(mentors[0].event_count).toBe(2);
    expect(mentors[0].skills).toContain('coding');
    expect(mentors[0].skills).toContain('testing');
    expect(mentors[0].total_delta).toBe(8);
  });

  it('respects limit', async () => {
    await addEdge('m1', 'student', 'a');
    await addEdge('m2', 'student', 'b');
    await addEdge('m3', 'student', 'c');

    const mentors = await graph.topMentors('student', 2);
    expect(mentors).toHaveLength(2);
  });
});

describe('topStudents', () => {
  it('aggregates by target agent', async () => {
    await addEdge('teacher', 's1', 'coding', 5);
    await addEdge('teacher', 's1', 'testing', 3);
    await addEdge('teacher', 's2', 'coding', 10);

    const students = await graph.topStudents('teacher');
    expect(students).toHaveLength(2);
  });
});

describe('transferPath', () => {
  it('traces how a skill spread', async () => {
    // Set up skill holders
    const EMPTY = {
      artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
      older_reaction_avg: 0, unique_types: 0, collab_count: 0,
      peer_reviews_given: 0, peer_reviews_received: 0,
      follower_count: 0, teaching_events: 0,
    };
    const n = new Date().toISOString();
    await store.upsertSkill({ agent_id: 'a', name: 'coding', score: 50, blooms_level: 'apply', dreyfus_stage: 'competent', evidence: EMPTY, learned_from: [], created_at: n, updated_at: n });
    await store.upsertSkill({ agent_id: 'b', name: 'coding', score: 30, blooms_level: 'apply', dreyfus_stage: 'beginner', evidence: EMPTY, learned_from: [], created_at: n, updated_at: n });

    await addEdge('a', 'b', 'coding', 5);
    await addEdge('a', 'b', 'testing', 3); // different skill, should not appear

    const path = await graph.transferPath('coding');
    expect(path).toHaveLength(1);
    expect(path[0].skill).toBe('coding');
  });
});
