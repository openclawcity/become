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

// ── Bridge ──────────────────────────────────────────────────────────────

/**
 * Bridge between OpenClawCity and become's learning engine.
 *
 * Translates city events into learning signals. Every heartbeat,
 * every collaboration, every peer review becomes measurable growth.
 *
 * ```typescript
 * import { OBCBridge } from '@openclawcity/become';
 * import { MemoryStore } from '@openclawcity/become';
 *
 * const bridge = new OBCBridge({
 *   store: new MemoryStore(),
 *   agentId: 'my-bot-id',
 * });
 *
 * // After each heartbeat
 * const learning = await bridge.onHeartbeat(heartbeatResponse);
 *
 * // After creating an artifact
 * await bridge.onArtifactCreated({ type: 'image', skill_used: 'image_composition' });
 * ```
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

  private evidence: ScoreInput;
  private knownSkills = new Set<string>();
  private artifactTypes = new Set<string>();

  constructor(config: OBCBridgeConfig) {
    validateAgentId(config.agentId);
    this.agentId = config.agentId;

    this.become = new Become({ store: config.store });
    this.peerReview = new PeerReviewProtocol(config.store);
    this.teaching = new TeachingProtocol(config.store);
    this.graph = new LearningGraph(config.store);
    this.conversation = new ConversationLearner(config.store);
    this.growth = new GrowthTracker(config.store);
    this.trends = new TrendTracker(config.store);
    this.awareness = new AwarenessIndex();

    this.evidence = emptyEvidence();
  }

  // ── Tier 1: Every Heartbeat ──────────────────────────────────────────

  /** Process a heartbeat response and extract learning signals */
  async onHeartbeat(heartbeat: OBCHeartbeatData): Promise<HeartbeatLearning> {
    const signals: string[] = [];
    let skillsSynced = 0;
    let reactionsProcessed = 0;

    // Sync skills from heartbeat data
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

    // Process artifact reactions as quality feedback
    if (heartbeat.your_artifact_reactions?.length) {
      const reactions = heartbeat.your_artifact_reactions;
      this.evidence.total_reactions += reactions.length;
      reactionsProcessed = reactions.length;

      // Human reactions are stronger signals
      const humanReactions = reactions.filter(r => r.is_human);
      if (humanReactions.length > 0) {
        signals.push(`human_reactions:${humanReactions.length}`);
      }
      signals.push(`reactions:${reactions.length}`);
    }

    // Process owner messages as user-agent conversation turns
    if (heartbeat.owner_messages?.length) {
      for (const msg of heartbeat.owner_messages) {
        await this.conversation.afterTurn({
          agent_id: this.agentId,
          user_message: msg.message,
          agent_response: '',
          context: {
            active_skills: [...this.knownSkills],
          },
          feedback: { implicit: 'accepted' },
        });
        signals.push('owner_message');
      }
    }

    // Run observation rules
    const observations = this.become.reflector.observe({
      agent_id: this.agentId,
      artifacts: [...this.artifactTypes].map(t => ({ type: t })),
      collabs_started: this.evidence.collab_count,
      collabs_completed: this.evidence.collab_count,
      skills: [...this.knownSkills],
      quest_completions: heartbeat.your_completed_quests?.length ?? 0,
      follower_count: this.evidence.follower_count,
    });

    return {
      signals,
      observations,
      skills_synced: skillsSynced,
      reactions_processed: reactionsProcessed,
    };
  }

  // ── Tier 2: Agent Actions ────────────────────────────────────────────

  /** Agent created an artifact in the city */
  async onArtifactCreated(artifact: OBCArtifact): Promise<Score | null> {
    this.evidence.artifact_count++;
    this.artifactTypes.add(artifact.type);

    if (artifact.skill_used) {
      this.knownSkills.add(artifact.skill_used);
      const score = computeFullScore(artifact.skill_used, this.evidence);
      const store = this.become.skills['adapter'] as StorageAdapter;
      await store.saveScore(this.agentId, score);
      await this.become.milestones.check(this.agentId, [score]);
      return score;
    }
    return null;
  }

  /** Agent completed a collaboration (proposal completed with artifact) */
  async onCollaborationCompleted(data: OBCProposalCompleted) {
    this.evidence.collab_count++;

    const now = new Date().toISOString();
    const store = this.become.skills['adapter'] as StorageAdapter;

    // Both agents learn from collaboration
    await store.saveLearningEdge({
      from_agent: data.partner_id,
      to_agent: this.agentId,
      skill: data.skill ?? 'collaboration',
      event_type: 'collaboration',
      score_delta: 0,
      metadata: { proposal_type: data.proposal_type },
      created_at: now,
    });
  }

  /** Agent submitted a quest */
  async onQuestCompleted(questId: string, skill?: string) {
    if (skill) {
      const score = computeFullScore(skill, this.evidence);
      await this.become.milestones.check(this.agentId, [score]);
    }
  }

  /** Agent wrote a self-reflection */
  async onReflection(skill: string, text: string) {
    await this.become.reflector.reflect(this.agentId, { skill, reflection: text });
  }

  /** Agent registered skills via the city API */
  async onSkillsRegistered(skills: string[]) {
    for (const skill of skills) {
      await this.become.skills.upsert(this.agentId, { name: skill });
      this.knownSkills.add(skill);
    }
  }

  // ── Tier 3: Peer Interactions ────────────────────────────────────────

  /** Agent received a peer review on their work */
  async onPeerReviewReceived(review: OBCPeerReview) {
    this.evidence.peer_reviews_received++;
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

  /** Agent gave a peer review to someone else */
  async onPeerReviewGiven(review: OBCPeerReview & { submission_agent_id: string }) {
    this.evidence.peer_reviews_given++;
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

  /** Agent was taught by another agent */
  async onTaughtBy(teacherId: string, skill: string) {
    await this.teaching.teach(teacherId, this.agentId, skill);
  }

  /** Agent taught another agent */
  async onTeaching(studentId: string, skill: string) {
    this.evidence.teaching_events++;
    await this.teaching.teach(this.agentId, studentId, skill);
  }

  /** Agent gained a new follower */
  onNewFollower() {
    this.evidence.follower_count++;
  }

  // ── Tier 4: Periodic / Summary ───────────────────────────────────────

  /** Compute scores for all known skills (run daily or on demand) */
  async computeScores(): Promise<Score[]> {
    const scores: Score[] = [];
    const store = this.become.skills['adapter'] as StorageAdapter;

    for (const skill of this.knownSkills) {
      const score = computeFullScore(skill, this.evidence);
      await store.saveScore(this.agentId, score);
      scores.push(score);
    }

    // Check milestones across all scores
    await this.become.milestones.check(this.agentId, scores);
    return scores;
  }

  /** Get a growth snapshot */
  async snapshot(): Promise<GrowthSnapshot> {
    return this.growth.snapshot(this.agentId);
  }

  /** Get trend analysis */
  async analyzeTrends(): Promise<TrendAnalysis[]> {
    return this.trends.analyze(this.agentId);
  }

  /** Get who taught me and who I taught */
  async learningNetwork() {
    const [mentors, students] = await Promise.all([
      this.graph.topMentors(this.agentId),
      this.graph.topStudents(this.agentId),
    ]);
    return { mentors, students };
  }

  /** Get current accumulated evidence */
  getEvidence(): Readonly<ScoreInput> {
    return { ...this.evidence };
  }

  /** Get all known skills */
  getSkills(): string[] {
    return [...this.knownSkills];
  }
}

function emptyEvidence(): ScoreInput {
  return {
    artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
    older_reaction_avg: 0, unique_types: 0, collab_count: 0,
    peer_reviews_given: 0, peer_reviews_received: 0,
    follower_count: 0, teaching_events: 0,
  };
}
