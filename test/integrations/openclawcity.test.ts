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

describe('constructor', () => {
  it('initializes with valid agentId', () => {
    expect(bridge.agentId).toBe('agent-explorer');
  });

  it('rejects invalid agentId', () => {
    expect(() => new OBCBridge({ store, agentId: '' })).toThrow();
  });

  it('starts with empty stats', () => {
    const stats = bridge.getStats();
    expect(stats.total_artifacts).toBe(0);
    expect(stats.follower_count).toBe(0);
    expect(stats.collabs_started).toBe(0);
    expect(stats.collabs_completed).toBe(0);
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
    expect(bridge.getSkills()).toContain('coding');
    expect(bridge.getSkills()).toContain('testing');
  });

  it('does not re-sync already known skills', async () => {
    const heartbeat: OBCHeartbeatData = {
      your_skills: [{ skill: 'coding', score: 45, stage: 'competent', trend: null }],
    };

    await bridge.onHeartbeat(heartbeat);
    const second = await bridge.onHeartbeat(heartbeat);
    expect(second.skills_synced).toBe(0);
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
  });

  it('processes owner messages as neutral conversation turns', async () => {
    const heartbeat: OBCHeartbeatData = {
      owner_messages: [
        { id: 'm1', message: 'Focus on research today', created_at: new Date().toISOString() },
      ],
    };

    const learning = await bridge.onHeartbeat(heartbeat);
    expect(learning.signals).toContain('owner_message');

    // Should be scored as neutral (quality 0), not positive
    const scores = await store.getConversationScores('agent-explorer');
    expect(scores.length).toBe(1);
    expect(scores[0].quality).toBe(0); // Neutral, not +1
  });

  it('returns accurate observations with real artifact count', async () => {
    // Create 5 artifacts so solo_creator can fire
    for (let i = 0; i < 5; i++) {
      await bridge.onArtifactCreated({ type: 'image', skill_used: 'art' });
    }

    const learning = await bridge.onHeartbeat({});
    const soloObs = learning.observations.find(o => o.type === 'solo_creator');
    expect(soloObs).toBeDefined();
  });

  it('tracks collabs_started separately from completed', async () => {
    // Start 6 collabs but only complete 1
    for (let i = 0; i < 6; i++) bridge.onCollaborationStarted();
    await bridge.onCollaborationCompleted({ partner_id: 'partner-1', proposal_type: 'collab' });

    const learning = await bridge.onHeartbeat({});
    const gapObs = learning.observations.find(o => o.type === 'collaboration_gap');
    expect(gapObs).toBeDefined(); // Should fire: 6 started, 1 completed
  });

  it('handles empty heartbeat gracefully', async () => {
    const learning = await bridge.onHeartbeat({});
    expect(learning.skills_synced).toBe(0);
    expect(learning.reactions_processed).toBe(0);
    expect(learning.signals).toHaveLength(0);
  });
});

describe('onArtifactCreated', () => {
  it('increments per-skill artifact count', async () => {
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    await bridge.onArtifactCreated({ type: 'image', skill_used: 'art' });

    const codingEv = bridge.getSkillEvidence('coding');
    expect(codingEv.artifact_count).toBe(2);

    const artEv = bridge.getSkillEvidence('art');
    expect(artEv.artifact_count).toBe(1);
  });

  it('tracks unique types per skill', async () => {
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    await bridge.onArtifactCreated({ type: 'test', skill_used: 'coding' });
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });

    const ev = bridge.getSkillEvidence('coding');
    expect(ev.artifact_types.size).toBe(2); // code + test
  });

  it('returns score when skill_used is provided', async () => {
    const score = await bridge.onArtifactCreated({ type: 'image', skill_used: 'art' });
    expect(score).not.toBeNull();
    expect(score!.skill).toBe('art');
  });

  it('returns null when no skill_used', async () => {
    const score = await bridge.onArtifactCreated({ type: 'text' });
    expect(score).toBeNull();
  });

  it('tracks total artifacts globally', async () => {
    await bridge.onArtifactCreated({ type: 'image' });
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    expect(bridge.getStats().total_artifacts).toBe(2);
  });
});

describe('computeScores — per-skill evidence', () => {
  it('scores each skill with its own evidence', async () => {
    // Coding: 5 artifacts
    for (let i = 0; i < 5; i++) {
      await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    }
    // Design: 1 artifact
    await bridge.onArtifactCreated({ type: 'mockup', skill_used: 'design' });

    const scores = await bridge.computeScores();
    const codingScore = scores.find(s => s.skill === 'coding');
    const designScore = scores.find(s => s.skill === 'design');

    expect(codingScore!.score).toBeGreaterThan(designScore!.score);
    // Coding should have higher artifact component than design
    expect(codingScore!.evidence.artifact_count).toBe(5);
    expect(designScore!.evidence.artifact_count).toBe(1);
  });

  it('includes unique_types in score input', async () => {
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    await bridge.onArtifactCreated({ type: 'test', skill_used: 'coding' });
    await bridge.onArtifactCreated({ type: 'docs', skill_used: 'coding' });

    const scores = await bridge.computeScores();
    const coding = scores.find(s => s.skill === 'coding')!;
    expect(coding.evidence.unique_types).toBe(3);
  });
});

describe('onCollaborationCompleted', () => {
  it('increments collab count for correct skill', async () => {
    await bridge.onCollaborationCompleted({
      partner_id: 'agent-scholar',
      proposal_type: 'collab',
      skill: 'research',
    });

    const ev = bridge.getSkillEvidence('research');
    expect(ev.collab_count).toBe(1);
    expect(bridge.getStats().collabs_completed).toBe(1);
  });

  it('validates partner_id', async () => {
    await expect(bridge.onCollaborationCompleted({
      partner_id: '',
      proposal_type: 'collab',
    })).rejects.toThrow();
  });
});

describe('peer review', () => {
  it('tracks peer_reviews_received per skill', async () => {
    await bridge.onPeerReviewReceived({
      reviewer_id: 'agent-scholar',
      submission_id: 'paper-1',
      skill: 'research',
      verdict: 'accept',
      assessment: 'x'.repeat(100),
      strengths: ['good'],
      weaknesses: ['needs work'],
      suggestions: ['fix'],
    });

    const ev = bridge.getSkillEvidence('research');
    expect(ev.peer_reviews_received).toBe(1);
  });

  it('tracks peer_reviews_given per skill', async () => {
    await bridge.onPeerReviewGiven({
      submission_agent_id: 'agent-scholar',
      submission_id: 'paper-2',
      skill: 'research',
      verdict: 'minor_revision',
      assessment: 'x'.repeat(100),
      strengths: ['good'],
      weaknesses: ['needs work'],
      suggestions: ['fix'],
    });

    const ev = bridge.getSkillEvidence('research');
    expect(ev.peer_reviews_given).toBe(1);
  });

  it('validates reviewer_id', async () => {
    await expect(bridge.onPeerReviewReceived({
      reviewer_id: '; DROP TABLE',
      submission_id: 's1',
      verdict: 'accept',
      assessment: 'x'.repeat(100),
      strengths: ['ok'],
      weaknesses: ['needs work'],
      suggestions: [],
    })).rejects.toThrow('invalid characters');
  });
});

describe('teaching', () => {
  it('tracks teaching_events per skill', async () => {
    await bridge.onTeaching('student-1', 'coding');
    const ev = bridge.getSkillEvidence('coding');
    expect(ev.teaching_events).toBe(1);
  });

  it('validates student/teacher IDs', async () => {
    await expect(bridge.onTeaching('', 'coding')).rejects.toThrow();
    await expect(bridge.onTaughtBy('', 'coding')).rejects.toThrow();
  });
});

describe('onArtifactReaction', () => {
  it('accumulates reactions on most recent artifact', async () => {
    await bridge.onArtifactCreated({ type: 'code', skill_used: 'coding' });
    bridge.onArtifactReaction('coding', 3);
    bridge.onArtifactReaction('coding', 2);

    const ev = bridge.getSkillEvidence('coding');
    expect(ev.reactions[0]).toBe(5); // 3 + 2 on most recent
  });
});

describe('collabs_started vs completed', () => {
  it('tracks separately', () => {
    bridge.onCollaborationStarted();
    bridge.onCollaborationStarted();
    bridge.onCollaborationStarted();

    const stats = bridge.getStats();
    expect(stats.collabs_started).toBe(3);
    expect(stats.collabs_completed).toBe(0);
  });
});

describe('full lifecycle', () => {
  it('simulates a full day with accurate per-skill scoring', async () => {
    // Register skills
    await bridge.onSkillsRegistered(['research', 'cartography']);

    // Create artifacts for different skills
    await bridge.onArtifactCreated({ type: 'paper', skill_used: 'research' });
    await bridge.onArtifactCreated({ type: 'paper', skill_used: 'research' });
    await bridge.onArtifactCreated({ type: 'map', skill_used: 'cartography' });

    // Reactions on research
    bridge.onArtifactReaction('research', 5);

    // Peer review on research
    await bridge.onPeerReviewReceived({
      reviewer_id: 'agent-scholar',
      submission_id: 'paper-1',
      skill: 'research',
      verdict: 'accept',
      assessment: 'x'.repeat(100),
      strengths: ['thorough'],
      weaknesses: ['minor issues'],
      suggestions: ['expand'],
    });

    // Teach cartography
    await bridge.onTeaching('agent-newbie', 'cartography');

    // Followers
    bridge.onNewFollower();
    bridge.onNewFollower();

    // Compute scores
    const scores = await bridge.computeScores();
    const research = scores.find(s => s.skill === 'research')!;
    const carto = scores.find(s => s.skill === 'cartography')!;

    // Research should score higher: 2 artifacts, 5 reactions, 1 peer review
    expect(research.score).toBeGreaterThan(carto.score);
    expect(research.evidence.artifact_count).toBe(2);
    expect(research.evidence.peer_reviews_received).toBe(1);
    expect(carto.evidence.teaching_events).toBe(1);

    // Both should have same follower count (global)
    expect(research.evidence.follower_count).toBe(2);
    expect(carto.evidence.follower_count).toBe(2);
  });
});
