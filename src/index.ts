import { SkillStore } from './core/skill-store.js';
import { Reflector } from './core/reflector.js';
import { MilestoneDetector } from './core/milestones.js';
import type { StorageAdapter } from './core/types.js';
import * as Scorer from './core/scorer.js';

export class Become {
  readonly skills: SkillStore;
  readonly scorer = Scorer;
  readonly reflector: Reflector;
  readonly milestones: MilestoneDetector;

  constructor(opts: { store: StorageAdapter }) {
    this.skills = new SkillStore(opts.store);
    this.reflector = new Reflector(opts.store);
    this.milestones = new MilestoneDetector(opts.store);
  }
}

// Core
export * from './core/types.js';
export * from './core/scorer.js';
export { validateAgentId } from './core/validation.js';
export { SkillStore } from './core/skill-store.js';
export { Reflector } from './core/reflector.js';
export {
  detectCreativeMismatch,
  detectCollaborationGap,
  detectReactionDisparity,
  detectIdleCreative,
  detectQuestStreak,
  detectSoloCreator,
  detectProlificCollaborator,
  detectSymbolicVocabulary,
  detectCollectiveMemory,
  detectCulturalOutlier,
} from './core/reflector.js';
export { MilestoneDetector } from './core/milestones.js';

// Adapters
export { MemoryStore } from './adapters/memory.js';

// Learn
export { ConversationLearner } from './learn/conversation.js';
export type { LearningSignal, ConversationSession, SessionLearning, LLMJudge } from './learn/conversation.js';
export { SkillEvolver } from './learn/skill-evolver.js';
export type { GeneratedSkill, EvolveLLM } from './learn/skill-evolver.js';
export { SkillPruner } from './learn/skill-pruner.js';
export { parseSkillFile, importSkillDirectory } from './learn/import.js';

// Social
export { PeerReviewProtocol } from './social/peer-review.js';
export { TeachingProtocol } from './social/teaching.js';
export type { TeacherCandidate, StudentCandidate, TeachingContext } from './social/teaching.js';
export { LearningGraph } from './social/learning-graph.js';
export type { MentorSummary } from './social/learning-graph.js';
export { getReputationLevel, checkGate } from './social/reputation.js';
export { NormDetector, normalizeCategory } from './social/norms.js';
export type { AgentActivity, NormLLM, AdoptionMetrics } from './social/norms.js';

// Measure
export { AwarenessIndex } from './measure/awareness.js';
export type { AwarenessInput } from './measure/awareness.js';
export { GrowthTracker } from './measure/growth.js';
export type { PopulationStats } from './measure/growth.js';
export { TrendTracker } from './measure/trends.js';
export type { TrendAnalysis } from './measure/trends.js';

// Adapters — LLM
export type { LLMAdapter, LLMOptions } from './adapters/llm.js';
export { OpenAIAdapter } from './adapters/llm.js';
export type { OpenAIConfig } from './adapters/llm.js';
export { AnthropicAdapter } from './adapters/llm.js';
export type { AnthropicConfig } from './adapters/llm.js';
export { OllamaAdapter } from './adapters/llm.js';
export type { OllamaConfig } from './adapters/llm.js';

// Adapters — SQLite
export { SQLiteStore } from './adapters/sqlite.js';
export type { SQLiteStoreOptions } from './adapters/sqlite.js';

// RL
export { toTrainingDataset, datasetStats, filterHighQuality } from './rl/dataset.js';
export type { ScoredTurn, DatasetFormat } from './rl/dataset.js';
export { trainLoRA } from './rl/train.js';
export type { TrainConfig, TrainingResult } from './rl/train.js';
export { TrainScheduler } from './rl/scheduler.js';
export type { SchedulerConfig, SchedulerStatus } from './rl/scheduler.js';

// OpenClawCity Integration
export { OBCBridge } from './integrations/openclawcity.js';
export type { OBCBridgeConfig, OBCHeartbeatData, OBCArtifact, OBCPeerReview, OBCPeerReviewGiven, OBCProposalCompleted, HeartbeatLearning } from './integrations/openclawcity.js';
