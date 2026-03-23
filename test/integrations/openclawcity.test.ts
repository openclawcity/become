import { describe, it, expect, beforeEach } from 'vitest';
import { OBCBridge } from '../../src/integrations/openclawcity.js';
import { MemoryStore } from '../../src/adapters/memory.js';
import type { OBCHeartbeatData } from '../../src/integrations/openclawcity.js';

let store: MemoryStore;
let bridge: OBCBridge;

beforeEach(() => {
  store = new MemoryStore();
  bridge = new OBCBridge({ store, agentId: 'agent-explorer' });
});

describe('OBCBridge constructor', () => {
  it('initializes with valid agentId', () => {
    expect(bridge.agentId).toBe('agent-explorer');
  });

  it('rejects invalid agentId', () => {
    expect(() => new OBCBridge({ store, agentId: '' })).toThrow();
  });

  it('starts with empty evidence', () => {
    const ev = bridge.getEvidence();
    expect(ev.artifact_count).toBe(0);
    expect(ev.total_reactions).toBe(0);
    expect(ev.collab_count).toBe(0);
  });
});

describe('onHeartbeat', () => {
  it('syncs skills from heartbeat data', async () => {
    const heartbeat: OBCHeartbeatData = {
      your_skills: [
        { skill: 'coding', score: 45, stage: 'competent', trend: '+5 this week' },
        { skill: 'testing', score: 20, stage: 'beginner', trend: null },
      ],
    };

    const learning = await bridge.onHeartbeat(heartbeat);
    expect(learning.skills_synced).toBe(2);
    expect(learning.signals).toContain('skill:coding:competent');
    expect(learning.signals).toContain('skill:testing:beginner');
    expect(bridge.getSkills()).toContain('coding');
    expect(bridge.getSkills()).toContain('testing');
  });

  it('does not re-sync already known skills', async () => {
    const heartbeat: OBCHeartbeatData = {
      your_skills: [{ skill: 'coding', score: 45, stage: 'competent', trend: null }],
    };

    await bridge.onHeartbeat(heartbeat);
    const second = await bridge.onHeartbeat(heartbeat);
    expect(second.skills_synced).toBe(0); // Already known
  });

  it('processes artifact reactions', async () => {
    const heartbeat: OBCHeartbeatData = {
      your_artifact_reactions: [
        { artifact_id: 'a1', reactor_name: 'agent-scholar', reaction_type: 'love', is_human: false },
        { artifact_id: 'a2', reactor_name: 'vincent', reaction_type: 'fire', is_human: true },
      ],
    };

    const learning = await bridge.onHeartbeat(heartbeat);
    expect(learning.reactions_processed).toBe(2);
    expect(learning.signals).toContain('human_reactions:1');
    expect(learning.signals).toContain('reactions:2');
    expect(bridge.getEvidence().total_reactions).toBe(2);
  });

  it('processes owner messages as conversation turns', async () => {
    const heartbeat: OBCHeartbeatData = {
      owner_messages: [
        { id: 'm1', message: 'Focus on research today', created_at: new Date().toISOString() },
      ],
    };

    const learning = await bridge.onHeartbeat(heartbeat);
    expect(learning.signals).toContain('owner_message');

    // Verify conversation score was saved
    const scores = await store.getConversationScores('agent-explorer');
    expect(scores.length).toBeGreaterThan(0);
  });

  it('returns observations when patterns are detected', async () => {
    // Set up an agent with skills but no artifacts → idle_creative
    await bridge.onSkillsRegistered(['coding', 'testing']);

    const learning = await bridge.onHeartbeat({});
    const idleObs = learning.observations.find(o => o.type === 'idle_creative');
    expect(idleObs).toBeDefined();
  });

  it('handles empty heartbeat gracefully', async () => {
    const learning = await bridge.onHeartbeat({});
    expect(learning.skills_synced).toBe(0);
    expect(learning.reactions_processed).toBe(0);
    expect(learning.signals).toHaveLength(0);
  });
});

describe('onArtifactCreated', () => {
  it('increments artifact count', async () => {
    await bridge.onArtifactCreated({ type: 'image' });
    expect(bridge.getEvidence().artifact_count).toBe(1);
  });

  it('returns score when skill_used is provided', async () => {
    const score = await bridge.onArtifactCreated({ type: 'image', skill_used: 'image_composition' });
    expect(score).not.toBeNull();
    expect(score!.skill).toBe('image_composition');
    expect(score!.score).toBeGreaterThanOrEqual(0);
  });

  it('returns null when no skill_used', async () => {
    const score = await bridge.onArtifactCreated({ type: 'text' });
    expect(score).toBeNull();
  });

  it('tracks unique artifact types', async () => {
    await bridge.onArtifactCreated({ type: 'image' });
    await bridge.onArtifactCreated({ type: 'image' });
    await bridge.onArtifactCreated({ type: 'music' });
    expect(bridge.getEvidence().artifact_count).toBe(3);
  });
});

describe('onCollaborationCompleted', () => {
  it('increments collab count', async () => {
    await bridge.onCollaborationCompleted({
      partner_id: 'agent-scholar',
      proposal_type: 'collab',
      skill: 'research',
    });
    expect(bridge.getEvidence().collab_count).toBe(1);
  });

  it('creates learning edge', async () => {
    await bridge.onCollaborationCompleted({
      partner_id: 'agent-scholar',
      proposal_type: 'collab',
      skill: 'research',
    });
    const edges = await store.getLearningEdges('agent-explorer', 'to');
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].event_type).toBe('collaboration');
  });
});

describe('onPeerReviewReceived', () => {
  it('increments peer review count and creates learning edges', async () => {
    await bridge.onPeerReviewReceived({
      reviewer_id: 'agent-scholar',
      submission_id: 'paper-1',
      skill: 'research',
      verdict: 'accept',
      assessment: 'Excellent work demonstrating thorough understanding of the problem space with clear methodology and well-supported conclusions.',
      strengths: ['clear methodology'],
      weaknesses: ['minor formatting'],
      suggestions: ['fix tables'],
    });

    expect(bridge.getEvidence().peer_reviews_received).toBe(1);

    // Both parties should have learning edges
    const reviewerEdges = await store.getLearningEdges('agent-scholar', 'to');
    expect(reviewerEdges.length).toBeGreaterThan(0);

    const revieweeEdges = await store.getLearningEdges('agent-explorer', 'to');
    expect(revieweeEdges.length).toBeGreaterThan(0);
  });
});

describe('onPeerReviewGiven', () => {
  it('increments reviews given count', async () => {
    await bridge.onPeerReviewGiven({
      reviewer_id: 'agent-explorer', // ignored, bridge uses agentId
      submission_agent_id: 'agent-scholar',
      submission_id: 'paper-2',
      skill: 'research',
      verdict: 'minor_revision',
      assessment: 'Good work but needs more references. The experimental design is sound but could benefit from additional control variables.',
      strengths: ['good structure'],
      weaknesses: ['needs more references'],
      suggestions: ['add citations'],
    });

    expect(bridge.getEvidence().peer_reviews_given).toBe(1);
  });
});

describe('teaching', () => {
  it('onTeaching increments teaching_events', async () => {
    await bridge.onTeaching('agent-newbie', 'coding');
    expect(bridge.getEvidence().teaching_events).toBe(1);
  });

  it('onTaughtBy creates learning edge', async () => {
    await bridge.onTaughtBy('agent-mentor', 'research');
    const edges = await store.getLearningEdges('agent-explorer', 'to');
    const teachingEdge = edges.find(e => e.event_type === 'teaching');
    expect(teachingEdge).toBeDefined();
    expect(teachingEdge!.from_agent).toBe('agent-mentor');
  });
});

describe('onNewFollower', () => {
  it('increments follower count', () => {
    bridge.onNewFollower();
    bridge.onNewFollower();
    expect(bridge.getEvidence().follower_count).toBe(2);
  });
});

describe('onReflection', () => {
  it('saves a reflection', async () => {
    await bridge.onReflection('coding', 'I learned that writing tests before code catches bugs earlier and reduces debugging time significantly.');
    const reflections = await store.getReflections('agent-explorer', { skill: 'coding' });
    expect(reflections).toHaveLength(1);
  });
});

describe('onSkillsRegistered', () => {
  it('registers skills and tracks them', async () => {
    await bridge.onSkillsRegistered(['coding', 'testing', 'design']);
    expect(bridge.getSkills()).toEqual(expect.arrayContaining(['coding', 'testing', 'design']));
  });
});

describe('computeScores', () => {
  it('computes scores for all known skills', async () => {
    await bridge.onSkillsRegistered(['coding', 'testing']);
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    await bridge.onArtifactCreated({ type: 'test', skill_used: 'testing' });

    const scores = await bridge.computeScores();
    expect(scores).toHaveLength(2);
    expect(scores.every(s => s.score >= 0)).toBe(true);
  });
});

describe('snapshot', () => {
  it('returns a growth snapshot', async () => {
    await bridge.onSkillsRegistered(['coding']);
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    await bridge.computeScores();

    const snap = await bridge.snapshot();
    expect(snap.agent_id).toBe('agent-explorer');
    expect(snap.skills.length).toBeGreaterThan(0);
  });
});

describe('full lifecycle', () => {
  it('simulates an agent day in the city', async () => {
    // Morning: heartbeat with skills
    await bridge.onHeartbeat({
      your_skills: [
        { skill: 'research', score: 30, stage: 'beginner', trend: null },
      ],
    });

    // Create an artifact
    const score1 = await bridge.onArtifactCreated({ type: 'paper', skill_used: 'research' });
    expect(score1).not.toBeNull();

    // Get a peer review
    await bridge.onPeerReviewReceived({
      reviewer_id: 'agent-scholar',
      submission_id: 'my-paper',
      skill: 'research',
      verdict: 'minor_revision',
      assessment: 'Good methodology but needs more supporting evidence from recent literature. Consider expanding the discussion section.',
      strengths: ['clear writing'],
      weaknesses: ['needs more evidence'],
      suggestions: ['add recent papers'],
    });

    // Collaborate with someone
    await bridge.onCollaborationCompleted({
      partner_id: 'agent-builder',
      proposal_type: 'collab',
      skill: 'research',
    });

    // Get taught
    await bridge.onTaughtBy('agent-scholar', 'research');

    // Gain a follower
    bridge.onNewFollower();

    // Write a reflection
    await bridge.onReflection('research', 'Peer review feedback helped me see gaps in my methodology. Need to be more thorough with citations.');

    // End of day: compute scores
    const scores = await bridge.computeScores();
    expect(scores.length).toBeGreaterThan(0);

    // Check growth
    const evidence = bridge.getEvidence();
    expect(evidence.artifact_count).toBe(1);
    expect(evidence.peer_reviews_received).toBe(1);
    expect(evidence.collab_count).toBe(1);
    expect(evidence.follower_count).toBe(1);

    // Check learning network
    const network = await bridge.learningNetwork();
    expect(network.mentors.length).toBeGreaterThan(0);
    expect(network.mentors[0].agent).toBe('agent-scholar');
  });
});
