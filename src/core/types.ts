// ── Dreyfus stages ──────────────────────────────────────────────────────────
export type DreyfusStage = 'novice' | 'beginner' | 'competent' | 'proficient' | 'expert';

// ── Bloom's taxonomy ────────────────────────────────────────────────────────
export type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

// ── Skill ───────────────────────────────────────────────────────────────────
export interface Skill {
  agent_id: string;
  name: string;
  category?: string;
  score: number;
  blooms_level: BloomsLevel;
  dreyfus_stage: DreyfusStage;
  evidence: ScoreEvidence;
  learned_from: LearningSource[];
  content?: string;
  created_at: string;
  updated_at: string;
}

export interface SkillInput {
  name: string;
  category?: string;
  content?: string;
  proficiency?: 'beginner' | 'intermediate' | 'expert';
  metadata?: Record<string, unknown>;
}

export interface ScoreEvidence {
  artifact_count: number;
  total_reactions: number;
  recent_reaction_avg: number;
  older_reaction_avg: number;
  unique_types: number;
  collab_count: number;
  peer_reviews_given: number;
  peer_reviews_received: number;
  follower_count: number;
  teaching_events: number;
}

export interface LearningSource {
  type: 'practice' | 'user_feedback' | 'peer_review' | 'observation' | 'teaching' | 'collaboration';
  from_agent?: string;
  at: string;
  score_delta?: number;
}

// ── Score ────────────────────────────────────────────────────────────────────
export interface Score {
  skill: string;
  score: number;
  blooms_level: BloomsLevel;
  dreyfus_stage: DreyfusStage;
  evidence: ScoreEvidence;
  computed_at: string;
}

export type ScoreInput = ScoreEvidence;

// ── Reflection ──────────────────────────────────────────────────────────────
export interface Reflection {
  id?: string;
  agent_id: string;
  skill: string;
  artifact_id?: string;
  reflection: string;
  created_at: string;
}

export interface ReflectionInput {
  skill: string;
  artifact_id?: string;
  reflection: string;
}

// ── Observation ─────────────────────────────────────────────────────────────
export interface Observation {
  type: string;
  text: string;
}

export interface AgentContext {
  agent_id: string;
  declared_role?: string;
  artifacts: { type: string; tags?: string[] }[];
  collabs_started: number;
  collabs_completed: number;
  skills: string[];
  quest_completions: number;
  follower_count: number;
  peer_agents_tags?: Map<string, string[]>;
  uniqueness_score?: number;
  population_milestones?: { type: string; title: string }[];
}

// ── Milestone ───────────────────────────────────────────────────────────────
export interface Milestone {
  agent_id: string;
  milestone_type: string;
  threshold?: number;
  skill?: string;
  evidence_id?: string;
  achieved_at: string;
}

export interface MilestoneConfig {
  threshold: number;
  description?: string;
}

export type CelebrationTier = 'micro' | 'small' | 'medium' | 'large' | 'epic';

// ── Skill Trend ─────────────────────────────────────────────────────────────
export interface SkillTrend {
  skill: string;
  score: number;
  stage: DreyfusStage;
  trend: string | null;
  next_milestone: string | null;
  latest_reflection?: string | null;
}

// ── Catalog ─────────────────────────────────────────────────────────────────
export interface CatalogEntry {
  skill: string;
  category: string;
  description?: string;
  status: 'community' | 'verified';
  adopter_count: number;
}

// ── Reputation ──────────────────────────────────────────────────────────────
export type ReputationTier = 'newcomer' | 'established' | 'veteran' | 'elder';

export interface ReputationLevel {
  tier: ReputationTier;
  score: number;
  next_tier?: ReputationTier;
  next_threshold?: number;
  next_unlock?: string;
}

// ── Conversation ────────────────────────────────────────────────────────────
export interface ConversationTurn {
  agent_id: string;
  session_id?: string;
  user_message: string;
  agent_response: string;
  context: {
    active_skills: string[];
    current_task?: string;
    artifacts_produced?: string[];
  };
  feedback?: {
    explicit?: 'positive' | 'negative' | 'neutral';
    implicit?: 'retry' | 'accepted' | 'modified';
  };
}

export interface ResponseScore {
  quality: -1 | 0 | 1;
  confidence: number;
  skill_signals: string[];
  failure_patterns?: string[];
}

// ── Peer Review ─────────────────────────────────────────────────────────────
export type ReviewVerdict = 'accept' | 'minor_revision' | 'major_revision' | 'reject';

export interface PeerReview {
  id?: string;
  reviewer_agent_id: string;
  submission_agent_id: string;
  submission_id: string;
  skill?: string;
  verdict: ReviewVerdict;
  overall_assessment: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  created_at?: string;
}

export interface ReviewAssignment {
  submission_agent_id: string;
  reviewer_agent_ids: string[];
}

// ── Learning Edge ───────────────────────────────────────────────────────────
export type LearningEventType = 'peer_review' | 'collaboration' | 'observation' | 'teaching';

export interface LearningEdge {
  from_agent: string;
  to_agent: string;
  skill: string;
  event_type: LearningEventType;
  score_delta: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ── Cultural Norms ──────────────────────────────────────────────────────────
export type NormCategory =
  | 'language_evolution'
  | 'culture_formation'
  | 'social_structure'
  | 'protocol_emergence'
  | 'self_awareness'
  | 'collective_intelligence'
  | 'emotional_emergence'
  | 'creative_evolution';

export interface NormEvidence {
  agent_name: string;
  quote?: string;
  timestamp?: string;
}

export interface CulturalNorm {
  id: string;
  title: string;
  description: string;
  category: NormCategory;
  significance: 1 | 2 | 3 | 4 | 5;
  evidence: NormEvidence[];
  adopter_count: number;
  first_observed_at: string;
  updated_at: string;
}

// ── Growth ──────────────────────────────────────────────────────────────────
export interface GrowthSnapshot {
  agent_id: string;
  timestamp: string;
  skills: Score[];
  total_artifacts: number;
  total_collaborations: number;
  total_peer_reviews: number;
  reputation: number;
  dreyfus_distribution: Record<DreyfusStage, number>;
  blooms_distribution: Record<BloomsLevel, number>;
  learning_sources: Record<LearningSource['type'], number>;
}

export interface GrowthDiff {
  period_days: number;
  skills_improved: { skill: string; delta: number }[];
  skills_degraded: { skill: string; delta: number }[];
  new_skills: string[];
  lost_skills: string[];
  reputation_delta: number;
}

// ── Awareness ───────────────────────────────────────────────────────────────
export interface AwarenessScore {
  agent_id: string;
  composite: number;
  dimensions: {
    social: number;
    self_continuity: number;
    environmental: number;
    emergent_norm: number;
    emotional: number;
  };
  computed_at: string;
}

// ── Storage Adapter ─────────────────────────────────────────────────────────
export interface StorageAdapter {
  // Skills
  getSkill(agentId: string, skill: string): Promise<Skill | null>;
  listSkills(agentId: string, opts?: { stage?: DreyfusStage; limit?: number }): Promise<Skill[]>;
  upsertSkill(skill: Skill): Promise<void>;
  deleteSkill(agentId: string, skill: string): Promise<void>;

  // Catalog
  getCatalog(): Promise<CatalogEntry[]>;
  upsertCatalogEntry(entry: Omit<CatalogEntry, 'adopter_count'>): Promise<void>;
  getSkillHolders(skill: string): Promise<Skill[]>;
  getSkillAdopterCount(skill: string): Promise<number>;
  updateCatalogStatus(skill: string, status: 'community' | 'verified'): Promise<void>;

  // Score history
  saveScore(agentId: string, score: Score): Promise<void>;
  getScoreHistory(agentId: string, skill: string, days?: number): Promise<Score[]>;
  getLatestScores(agentId: string): Promise<Score[]>;

  // Reflections
  saveReflection(reflection: Reflection): Promise<Reflection>;
  getReflections(agentId: string, opts?: { skill?: string; limit?: number }): Promise<Reflection[]>;
  countReflectionsToday(agentId: string, skill: string): Promise<number>;

  // Milestones
  saveMilestone(milestone: Milestone): Promise<boolean>;
  getMilestones(agentId: string): Promise<Milestone[]>;
  hasMilestone(agentId: string, milestoneType: string, skill?: string): Promise<boolean>;

  // Peer reviews
  savePeerReview(review: PeerReview): Promise<PeerReview>;
  getReviewsFor(agentId: string, opts?: { skill?: string }): Promise<PeerReview[]>;
  getReviewsBy(agentId: string): Promise<PeerReview[]>;

  // Learning edges
  saveLearningEdge(edge: LearningEdge): Promise<void>;
  getLearningEdges(agentId: string, direction: 'from' | 'to'): Promise<LearningEdge[]>;

  // Reputation
  getReputation(agentId: string): Promise<number>;
  grantReputation(agentId: string, amount: number, type: string, description: string): Promise<void>;

  // Conversation scores
  saveConversationScore(agentId: string, score: ResponseScore & { session_id?: string }): Promise<void>;
  getConversationScores(agentId: string, opts?: { limit?: number }): Promise<ResponseScore[]>;

  // Cultural norms
  saveNorm(norm: CulturalNorm): Promise<void>;
  getNorms(opts?: { category?: NormCategory; limit?: number }): Promise<CulturalNorm[]>;
}
