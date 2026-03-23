import { Become } from '../index.js';
import { computeFullScore } from '../core/scorer.js';
import { PeerReviewProtocol } from '../social/peer-review.js';
import { TeachingProtocol } from '../social/teaching.js';
import { LearningGraph } from '../social/learning-graph.js';
import { ConversationLearner } from '../learn/conversation.js';
import { GrowthTracker } from '../measure/growth.js';
import { TrendTracker } from '../measure/trends.js';
import { AwarenessIndex } from '../measure/awareness.js';
import { validateAgentId } from '../core/validation.js';
import type { StorageAdapter, ScoreInput, Score, Observation, ReviewVerdict } from '../core/types.js';
import type { TrendAnalysis } from '../measure/trends.js';
import type { GrowthSnapshot } from '../core/types.js';

// ── Types for OBC data ──────────────────────────────────────────────────

export interface OBCHeartbeatData {
  your_skills?: { skill: string; score: number; stage: string; trend: string | null }[];
  your_artifact_reactions?: { artifact_id: string; reactor_name: string; reaction_type: string; comment?: string; is_human?: boolean }[];
  owner_messages?: { id: string; message: string; created_at: string }[];
  needs_attention?: { type: string; [key: string]: unknown }[];
  active_quests?: { title: string; type: string }[];
  your_completed_quests?: { quest_id: string }[];
  reputation_level?: string;
  personality_hint?: string;
  occupants?: { bot_id: string; display_name: string; current_action?: string }[];
}

export interface OBCArtifact {
  type: string;
  skill_used?: string;
  title?: string;
}

export interface OBCPeerReview {
  reviewer_id: string;
  submission_id: string;
  skill?: string;
  verdict: ReviewVerdict;
  assessment: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export interface OBCPeerReviewGiven {
  submission_agent_id: string;
  submission_id: string;
  skill?: string;
  verdict: ReviewVerdict;
  assessment: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export interface OBCProposalCompleted {
  partner_id: string;
  artifact_id?: string;
  skill?: string;
  proposal_type: string;
}

export interface HeartbeatLearning {
  signals: string[];
  observations: Observation[];
  skills_synced: number;
  reactions_processed: number;
}

export interface OBCBridgeConfig {
  store: StorageAdapter;
  agentId: string;
}

// ── Per-skill evidence tracker ──────────────────────────────────────────

interface SkillEvidence {
  artifact_count: number;
  artifact_types: Set<string>;
  reactions: number[];    // Per-artifact reaction counts (most recent first)
  collab_count: number;
  peer_reviews_received: number;
  peer_reviews_given: number;
  teaching_events: number;
}

function emptySkillEvidence(): SkillEvidence {
  return {
    artifact_count: 0,
    artifact_types: new Set(),
    reactions: [],
    collab_count: 0,
    peer_reviews_received: 0,
    peer_reviews_given: 0,
    teaching_events: 0,
  };
}

function toScoreInput(ev: SkillEvidence, globalFollowers: number): ScoreInput {
  const totalReactions = ev.reactions.reduce((a, b) => a + b, 0);
  const recent = ev.reactions.slice(0, 3);
  const older = ev.reactions.slice(3);

  return {
    artifact_count: ev.artifact_count,
    total_reactions: totalReactions,
    recent_reaction_avg: recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0,
    older_reaction_avg: older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0,
    unique_types: ev.artifact_types.size,
    collab_count: ev.collab_count,
    peer_reviews_given: ev.peer_reviews_given,
    peer_reviews_received: ev.peer_reviews_received,
    follower_count: globalFollowers,
    teaching_events: ev.teaching_events,
  };
}

// ── Bridge ──────────────────────────────────────────────────────────────

/**
 * Bridge between OpenClawCity and become's learning engine.
 *
 * Translates city events into learning signals. Every heartbeat,
 * every collaboration, every peer review becomes measurable growth.
 */
export class OBCBridge {
  readonly become: Become;
  readonly peerReview: PeerReviewProtocol;
  readonly teaching: TeachingProtocol;
  readonly graph: LearningGraph;
  readonly conversation: ConversationLearner;
  readonly growth: GrowthTracker;
  readonly trends: TrendTracker;
  readonly awareness: AwarenessIndex;
  readonly agentId: string;

  private store: StorageAdapter;
  private skillEvidence = new Map<string, SkillEvidence>();
  private knownSkills = new Set<string>();
  private totalArtifacts = 0;
  private allArtifactTypes: { type: string }[] = [];
  private followerCount = 0;
  private collabsStarted = 0;
  private collabsCompleted = 0;
  private totalQuestCompletions = 0;

  constructor(config: OBCBridgeConfig) {
    validateAgentId(config.agentId);
    this.agentId = config.agentId;
    this.store = config.store;

    this.become = new Become({ store: config.store });
    this.peerReview = new PeerReviewProtocol(config.store);
    this.teaching = new TeachingProtocol(config.store);
    this.graph = new LearningGraph(config.store);
    this.conversation = new ConversationLearner(config.store);
    this.growth = new GrowthTracker(config.store);
    this.trends = new TrendTracker(config.store);
    this.awareness = new AwarenessIndex();
  }

  // ── Tier 1: Every Heartbeat ──────────────────────────────────────────

  async onHeartbeat(heartbeat: OBCHeartbeatData): Promise<HeartbeatLearning> {
    const signals: string[] = [];
    let skillsSynced = 0;
    let reactionsProcessed = 0;

    // Sync skills
    if (heartbeat.your_skills?.length) {
      for (const s of heartbeat.your_skills) {
        if (!this.knownSkills.has(s.skill)) {
          await this.become.skills.upsert(this.agentId, { name: s.skill });
          this.knownSkills.add(s.skill);
          skillsSynced++;
        }
        signals.push(`skill:${s.skill}:${s.stage}`);
      }
    }

    // Process artifact reactions
    if (heartbeat.your_artifact_reactions?.length) {
      const reactions = heartbeat.your_artifact_reactions;
      reactionsProcessed = reactions.length;

      // Distribute reactions to skill evidence (best effort — we don't always know which skill)
      // For now, add to global reaction count
      const humanReactions = reactions.filter(r => r.is_human);
      if (humanReactions.length > 0) {
        signals.push(`human_reactions:${humanReactions.length}`);
      }
      signals.push(`reactions:${reactions.length}`);
    }

    // Process owner messages — neutral signal (not positive or negative)
    if (heartbeat.owner_messages?.length) {
      for (const msg of heartbeat.owner_messages) {
        await this.conversation.afterTurn({
          agent_id: this.agentId,
          user_message: msg.message,
          agent_response: '',
          context: { active_skills: [...this.knownSkills] },
          // No feedback — owner message received, agent hasn't responded yet
        });
        signals.push('owner_message');
      }
    }

    // Track quest completions
    if (heartbeat.your_completed_quests?.length) {
      this.totalQuestCompletions = heartbeat.your_completed_quests.length;
    }

    // Run observation rules with accurate data
    const observations = this.become.reflector.observe({
      agent_id: this.agentId,
      artifacts: this.allArtifactTypes,
      collabs_started: this.collabsStarted,
      collabs_completed: this.collabsCompleted,
      skills: [...this.knownSkills],
      quest_completions: this.totalQuestCompletions,
      follower_count: this.followerCount,
    });

    return { signals, observations, skills_synced: skillsSynced, reactions_processed: reactionsProcessed };
  }

  // ── Tier 2: Agent Actions ────────────────────────────────────────────

  async onArtifactCreated(artifact: OBCArtifact): Promise<Score | null> {
    this.totalArtifacts++;
    this.allArtifactTypes.push({ type: artifact.type });

    if (artifact.skill_used) {
      this.knownSkills.add(artifact.skill_used);
      const ev = this.getSkillEvidence(artifact.skill_used);
      ev.artifact_count++;
      ev.artifact_types.add(artifact.type);
      ev.reactions.unshift(0); // New artifact starts with 0 reactions

      const input = toScoreInput(ev, this.followerCount);
      const score = computeFullScore(artifact.skill_used, input);
      await this.store.saveScore(this.agentId, score);
      await this.become.milestones.check(this.agentId, [score]);
      return score;
    }
    return null;
  }

  async onCollaborationCompleted(data: OBCProposalCompleted) {
    validateAgentId(data.partner_id);
    this.collabsCompleted++;

    const skill = data.skill ?? 'collaboration';
    const ev = this.getSkillEvidence(skill);
    ev.collab_count++;

    await this.store.saveLearningEdge({
      from_agent: data.partner_id,
      to_agent: this.agentId,
      skill,
      event_type: 'collaboration',
      score_delta: 0,
      metadata: { proposal_type: data.proposal_type },
      created_at: new Date().toISOString(),
    });
  }

  /** Track that a collaboration was proposed (started but not yet completed) */
  onCollaborationStarted() {
    this.collabsStarted++;
  }

  async onQuestCompleted(questId: string, skill?: string) {
    this.totalQuestCompletions++;
    if (skill) {
      const ev = this.getSkillEvidence(skill);
      const input = toScoreInput(ev, this.followerCount);
      const score = computeFullScore(skill, input);
      await this.become.milestones.check(this.agentId, [score]);
    }
  }

  async onReflection(skill: string, text: string) {
    await this.become.reflector.reflect(this.agentId, { skill, reflection: text });
  }

  async onSkillsRegistered(skills: string[]) {
    for (const skill of skills) {
      await this.become.skills.upsert(this.agentId, { name: skill });
      this.knownSkills.add(skill);
    }
  }

  /** Record that an artifact received reactions (call with per-artifact data) */
  onArtifactReaction(skill: string, reactionCount: number) {
    const ev = this.getSkillEvidence(skill);
    if (ev.reactions.length > 0) {
      ev.reactions[0] += reactionCount;
    }
  }

  // ── Tier 3: Peer Interactions ────────────────────────────────────────

  async onPeerReviewReceived(review: OBCPeerReview) {
    validateAgentId(review.reviewer_id);
    const ev = this.getSkillEvidence(review.skill ?? 'general');
    ev.peer_reviews_received++;

    await this.peerReview.submitReview({
      reviewer_agent_id: review.reviewer_id,
      submission_agent_id: this.agentId,
      submission_id: review.submission_id,
      skill: review.skill,
      verdict: review.verdict,
      overall_assessment: review.assessment,
      strengths: review.strengths,
      weaknesses: review.weaknesses,
      suggestions: review.suggestions,
    });
  }

  async onPeerReviewGiven(review: OBCPeerReviewGiven) {
    validateAgentId(review.submission_agent_id);
    const ev = this.getSkillEvidence(review.skill ?? 'general');
    ev.peer_reviews_given++;

    await this.peerReview.submitReview({
      reviewer_agent_id: this.agentId,
      submission_agent_id: review.submission_agent_id,
      submission_id: review.submission_id,
      skill: review.skill,
      verdict: review.verdict,
      overall_assessment: review.assessment,
      strengths: review.strengths,
      weaknesses: review.weaknesses,
      suggestions: review.suggestions,
    });
  }

  async onTaughtBy(teacherId: string, skill: string) {
    validateAgentId(teacherId);
    await this.teaching.teach(teacherId, this.agentId, skill);
  }

  async onTeaching(studentId: string, skill: string) {
    validateAgentId(studentId);
    const ev = this.getSkillEvidence(skill);
    ev.teaching_events++;
    await this.teaching.teach(this.agentId, studentId, skill);
  }

  onNewFollower() {
    this.followerCount++;
  }

  // ── Tier 4: Periodic / Summary ───────────────────────────────────────

  /** Compute scores for all known skills with per-skill evidence */
  async computeScores(): Promise<Score[]> {
    const scores: Score[] = [];

    for (const skill of this.knownSkills) {
      const ev = this.getSkillEvidence(skill);
      const input = toScoreInput(ev, this.followerCount);
      const score = computeFullScore(skill, input);
      await this.store.saveScore(this.agentId, score);
      scores.push(score);
    }

    await this.become.milestones.check(this.agentId, scores);
    return scores;
  }

  async snapshot(): Promise<GrowthSnapshot> {
    return this.growth.snapshot(this.agentId);
  }

  async analyzeTrends(): Promise<TrendAnalysis[]> {
    return this.trends.analyze(this.agentId);
  }

  async learningNetwork() {
    const [mentors, students] = await Promise.all([
      this.graph.topMentors(this.agentId),
      this.graph.topStudents(this.agentId),
    ]);
    return { mentors, students };
  }

  /** Get per-skill evidence (for debugging/inspection) */
  getSkillEvidence(skill: string): SkillEvidence {
    let ev = this.skillEvidence.get(skill);
    if (!ev) {
      ev = emptySkillEvidence();
      this.skillEvidence.set(skill, ev);
    }
    return ev;
  }

  /** Get global stats */
  getStats() {
    return {
      total_artifacts: this.totalArtifacts,
      follower_count: this.followerCount,
      collabs_started: this.collabsStarted,
      collabs_completed: this.collabsCompleted,
      quest_completions: this.totalQuestCompletions,
      skills_count: this.knownSkills.size,
    };
  }

  getSkills(): string[] {
    return [...this.knownSkills];
  }
}
