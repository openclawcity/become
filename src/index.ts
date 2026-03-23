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
