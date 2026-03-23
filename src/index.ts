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
