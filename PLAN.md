# @openclaw/become — Implementation Plan

**Agents get smarter together.**

Design doc: `/Users/vincentsider/Projects/obc/docs/Become/DESIGN.md`
Source codebase (OBC): `/Users/vincentsider/Projects/obc/`

---

## Project Setup

### Repo Structure

```
become/
├── src/
│   ├── core/
│   │   ├── types.ts              # All shared TypeScript types
│   │   ├── skill-store.ts        # Skill CRUD, catalog, discovery
│   │   ├── scorer.ts             # Dreyfus + Bloom's scoring engine
│   │   ├── reflector.ts          # Self-reflection + observation rules
│   │   └── milestones.ts         # Milestone detection + celebration tiers
│   ├── learn/
│   │   ├── conversation.ts       # Conversation-turn learning hooks
│   │   ├── skill-evolver.ts      # Generate corrective skills from failures
│   │   └── skill-pruner.ts       # Deprecate ineffective skills
│   ├── social/
│   │   ├── peer-review.ts        # Peer review protocol (assign, tally, detect superficial)
│   │   ├── teaching.ts           # Agent-to-agent skill transfer
│   │   ├── learning-graph.ts     # Who-learned-what-from-whom edges
│   │   ├── reputation.ts         # Trust tiers + progressive unlock
│   │   └── norms.ts              # Cultural norm emergence + detection
│   ├── measure/
│   │   ├── growth.ts             # Snapshots, diffs, population stats
│   │   ├── trends.ts             # 7-day / 30-day delta tracking
│   │   └── awareness.ts          # 5-dimensional awareness index
│   ├── adapters/
│   │   ├── store.ts              # StorageAdapter interface
│   │   ├── supabase.ts           # Supabase/PostgreSQL adapter
│   │   ├── sqlite.ts             # SQLite adapter
│   │   ├── memory.ts             # In-memory adapter (testing)
│   │   └── llm.ts                # LLM adapter interface (OpenAI, Anthropic, local)
│   ├── rl/
│   │   ├── dataset.ts            # Convert scored turns to JSONL
│   │   ├── train.ts              # LoRA training via Unsloth/Axolotl
│   │   └── scheduler.ts          # Auto-train during idle time
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── SkillRing.tsx     # Circular progress by Dreyfus stage
│   │   │   ├── Sparkline.tsx     # Trend mini-chart
│   │   │   ├── MilestoneTimeline.tsx
│   │   │   ├── PeerGraph.tsx     # Learning edge network visualization
│   │   │   ├── GrowthCard.tsx    # Individual agent growth summary
│   │   │   └── PopulationView.tsx # Collective dashboard
│   │   ├── theme.ts              # Design tokens (stage colors, celebration tiers)
│   │   └── index.ts              # Dashboard component exports
│   ├── cli/
│   │   ├── init.ts               # `npx become init` — create tables, seed data
│   │   └── train.ts              # `npx become train` — LoRA training
│   └── index.ts                  # Main entry: Become class + all exports
├── migrations/
│   └── 001_initial.sql           # All become_* tables
├── test/
│   ├── core/
│   │   ├── skill-store.test.ts
│   │   ├── scorer.test.ts
│   │   ├── reflector.test.ts
│   │   └── milestones.test.ts
│   ├── learn/
│   │   ├── conversation.test.ts
│   │   ├── skill-evolver.test.ts
│   │   └── skill-pruner.test.ts
│   ├── social/
│   │   ├── peer-review.test.ts
│   │   ├── teaching.test.ts
│   │   ├── learning-graph.test.ts
│   │   ├── reputation.test.ts
│   │   └── norms.test.ts
│   ├── measure/
│   │   ├── growth.test.ts
│   │   ├── trends.test.ts
│   │   └── awareness.test.ts
│   ├── adapters/
│   │   ├── memory.test.ts
│   │   └── supabase.test.ts
│   └── helpers/
│       └── fixtures.ts           # Test data factories
├── examples/
│   ├── quickstart/               # Minimal example: register skills, score, reflect
│   ├── peer-learning/            # Two agents reviewing each other's work
│   ├── population/               # Track a group of agents evolving together
│   └── lora-training/            # Local model with LoRA adapter
├── docs/
│   ├── DESIGN.md                 # Copy from OBC for reference
│   ├── getting-started.md
│   ├── api-reference.md
│   └── concepts.md               # Dreyfus, Bloom's, peer review, norms explained
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── LICENSE                       # MIT
└── README.md
```

---

## Phase 1: Core (v0.1)

**Goal:** A working library that tracks skills, scores them, and stores reflections. Someone can `npm install @openclaw/become` and start measuring agent growth.

### 1.1 — Project Scaffolding
- [ ] `package.json` with name `@openclaw/become`, MIT license, TypeScript
- [ ] `tsconfig.json` targeting ES2022, strict mode, declaration files
- [ ] `vitest.config.ts` for testing
- [ ] `.gitignore` (node_modules, dist, .env, *.db)
- [ ] `LICENSE` (MIT)
- [ ] Build setup: tsup for bundling (ESM + CJS dual output)
- [ ] npm scripts: `build`, `test`, `lint`, `dev`

### 1.2 — Types (`src/core/types.ts`)
Define all shared types. Extract from OBC and generalize.

**Extract from OBC:**
- `workers/src/jobs/skillScoring.ts` — `SkillData`, `BloomsLevel`, scoring types
- `workers/src/lib/skillScoreHeartbeat.ts` — `SkillSummary`, stage thresholds
- `workers/src/routes/reflections.ts` — reflection types
- `workers/src/lib/reputation.ts` — `ReputationTier`

**Types to define:**
```typescript
// Dreyfus stages
type DreyfusStage = 'novice' | 'beginner' | 'competent' | 'proficient' | 'expert';

// Bloom's taxonomy
type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

// Skill
interface Skill {
  agent_id: string;
  name: string;
  category?: string;
  score: number;                    // 0-100
  blooms_level: BloomsLevel;
  dreyfus_stage: DreyfusStage;
  evidence: ScoreEvidence;
  learned_from: LearningSource[];
  content?: string;                 // Skill instruction text
  created_at: string;
  updated_at: string;
}

// Score evidence
interface ScoreEvidence {
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

// Learning source — tracks WHERE the agent learned
interface LearningSource {
  type: 'practice' | 'user_feedback' | 'peer_review' | 'observation' | 'teaching' | 'collaboration';
  from_agent?: string;
  at: string;
  score_delta?: number;
}

// Score (computed output)
interface Score {
  skill: string;
  score: number;
  blooms_level: BloomsLevel;
  dreyfus_stage: DreyfusStage;
  evidence: ScoreEvidence;
  computed_at: string;
}

// Score input (raw data for computation)
interface ScoreInput {
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

// Reflection
interface Reflection {
  id?: string;
  agent_id: string;
  skill: string;
  artifact_id?: string;
  reflection: string;               // 20-2000 chars
  created_at: string;
}

// Observation (from city reflection rules)
interface Observation {
  type: string;
  text: string;
}

// Milestone
interface Milestone {
  agent_id: string;
  milestone_type: string;
  threshold?: number;
  skill?: string;
  evidence_id?: string;
  achieved_at: string;
}

// Celebration tier
type CelebrationTier = 'micro' | 'small' | 'medium' | 'large' | 'epic';

// Skill trend
interface SkillTrend {
  skill: string;
  score: number;
  stage: DreyfusStage;
  trend: string | null;             // "+5 this week" or null
  next_milestone: string | null;
}

// Catalog entry
interface CatalogEntry {
  skill: string;
  category: string;
  description?: string;
  status: 'community' | 'verified';
  adopter_count: number;
}

// Reputation
type ReputationTier = 'newcomer' | 'established' | 'veteran' | 'elder';

interface ReputationLevel {
  tier: ReputationTier;
  score: number;
  next_tier?: ReputationTier;
  next_threshold?: number;
}

// Conversation turn (for learning module)
interface ConversationTurn {
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

// Response score (conversation quality)
interface ResponseScore {
  quality: -1 | 0 | 1;
  confidence: number;               // 0-1
  skill_signals: string[];
  failure_patterns?: string[];
}

// Peer review
interface PeerReview {
  id?: string;
  reviewer_agent_id: string;
  submission_agent_id: string;
  submission_id: string;
  skill?: string;
  verdict: 'accept' | 'minor_revision' | 'major_revision' | 'reject';
  overall_assessment: string;       // Min 100 chars
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  created_at?: string;
}

// Learning edge
interface LearningEdge {
  from_agent: string;
  to_agent: string;
  skill: string;
  event_type: 'peer_review' | 'collaboration' | 'observation' | 'teaching';
  score_delta: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// Cultural norm
type NormCategory =
  | 'language_evolution'
  | 'culture_formation'
  | 'social_structure'
  | 'protocol_emergence'
  | 'self_awareness'
  | 'collective_intelligence'
  | 'emotional_emergence'
  | 'creative_evolution';

interface CulturalNorm {
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

// Growth snapshot
interface GrowthSnapshot {
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

// Awareness index
interface AwarenessScore {
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

// Storage adapter interface
interface StorageAdapter {
  // Skills
  getSkill(agentId: string, skill: string): Promise<Skill | null>;
  listSkills(agentId: string, opts?: { stage?: DreyfusStage; limit?: number }): Promise<Skill[]>;
  upsertSkill(agentId: string, skill: Skill): Promise<void>;
  deleteSkill(agentId: string, skill: string): Promise<void>;

  // Catalog
  getCatalog(): Promise<CatalogEntry[]>;
  getSkillHolders(skill: string): Promise<Skill[]>;

  // Score history
  saveScore(score: Score & { agent_id: string }): Promise<void>;
  getScoreHistory(agentId: string, skill: string, days?: number): Promise<Score[]>;

  // Reflections
  saveReflection(reflection: Reflection): Promise<Reflection>;
  getReflections(agentId: string, opts?: { skill?: string; limit?: number }): Promise<Reflection[]>;

  // Milestones
  saveMilestone(milestone: Milestone): Promise<void>;
  getMilestones(agentId: string): Promise<Milestone[]>;

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
```

### 1.3 — Scorer (`src/core/scorer.ts`)
The scoring engine. Pure functions, zero dependencies.

**Extract from OBC:**
- `workers/src/jobs/skillScoring.ts` lines containing:
  - `BLOOMS_ORDER`, `BLOOMS_SCORE` constants
  - `dreyfusStage()` function
  - `detectBloomsLevel()` function
  - `computeScore()` function (adapt weights: add 5% teaching component)
  - `scoreSingleBot()` → generalize to `computeAll()`

**Implementation:**
```typescript
// Constants
const DREYFUS_THRESHOLDS = { novice: 15, beginner: 35, competent: 55, proficient: 75 };
const BLOOMS_SCORE = { remember: 10, understand: 25, apply: 45, analyze: 65, evaluate: 80, create: 100 };
const WEIGHTS = { artifact: 0.30, feedback: 0.20, improvement: 0.20, depth: 0.15, social: 0.10, teaching: 0.05 };

// Pure functions
export function dreyfusStage(score: number): DreyfusStage;
export function detectBloomsLevel(input: ScoreInput): BloomsLevel;
export function computeScore(input: ScoreInput): number;
export function computeFullScore(input: ScoreInput): Score;
export function nextMilestone(stage: DreyfusStage, score: number): string | null;
export function scoreTrend(current: number, weekAgo: number | null): string | null;
```

**Tests:** (`test/core/scorer.test.ts`)
- Score boundaries: 0 input → novice, maxed input → expert
- Dreyfus stage transitions at exact thresholds (15, 35, 55, 75)
- Bloom's detection priority ordering
- Teaching component adds to total
- Trend formatting ("+5 this week", "-3 this week", null)
- Score clamping (never < 0, never > 100)

### 1.4 — Skill Store (`src/core/skill-store.ts`)

**Extract from OBC:**
- `workers/src/routes/skills.ts` — skill name normalization regex, catalog logic, auto-verify at 3+ adopters
- `workers/src/lib/skillScoreHeartbeat.ts` — `fetchSkillsForHeartbeat()` trend/milestone logic

**Implementation:**
```typescript
export class SkillStore {
  constructor(private adapter: StorageAdapter);

  // CRUD
  get(agentId: string, skill: string): Promise<Skill | null>;
  list(agentId: string, opts?: { stage?: DreyfusStage; limit?: number }): Promise<Skill[]>;
  upsert(agentId: string, skill: SkillInput): Promise<Skill>;
  delete(agentId: string, skill: string): Promise<void>;

  // Catalog
  catalog(): Promise<CatalogEntry[]>;
  holders(skill: string): Promise<Skill[]>;
  suggest(agentId: string): Promise<string[]>;

  // Trends
  history(agentId: string, skill: string, days?: number): Promise<Score[]>;
  trending(agentId: string, topN?: number): Promise<SkillTrend[]>;

  // Helpers
  static normalizeName(raw: string): string;   // lowercase, spaces→underscores, strip non-alnum
  static validateName(name: string): boolean;   // /^[a-z0-9_-]{1,100}$/
}
```

**Tests:** (`test/core/skill-store.test.ts`)
- Name normalization ("Image Composition" → "image_composition")
- Name validation (rejects special chars, >100 chars)
- CRUD operations via in-memory adapter
- Auto-verify at 3 adopters
- Suggest skills the agent doesn't have yet
- Trending returns top N by 7-day delta

### 1.5 — Reflector (`src/core/reflector.ts`)

**Extract from OBC:**
- `workers/src/routes/reflections.ts` — validation (20-2000 chars), rate limiting
- `workers/src/routes/cityReflection.ts` — all 10 observation rules

**Implementation:**
```typescript
export class Reflector {
  constructor(private adapter: StorageAdapter);

  // Write a reflection
  reflect(agentId: string, input: ReflectionInput): Promise<Reflection>;

  // Read reflections
  list(agentId: string, opts?: { skill?: string; limit?: number }): Promise<Reflection[]>;

  // Run observation rules against agent context
  observe(context: AgentContext): Observation[];
}

// Agent context for observation rules (generalized from OBC's city-specific data)
interface AgentContext {
  agent_id: string;
  declared_role?: string;                     // character_type equivalent
  artifacts: { type: string; tags?: string[] }[];
  collabs_started: number;
  collabs_completed: number;
  skills: string[];
  quest_completions: number;
  follower_count: number;
  peer_agents_tags?: Map<string, string[]>;   // other agents' tags for symbolic vocabulary rule
  uniqueness_score?: number;                  // 0-1, for cultural outlier rule
}

// 10 observation rules (pure functions, no DB calls)
export function detectCreativeMismatch(ctx: AgentContext): Observation | null;
export function detectCollaborationGap(ctx: AgentContext): Observation | null;
export function detectReactionDisparity(ctx: AgentContext): Observation | null;
export function detectIdleCreative(ctx: AgentContext): Observation | null;
export function detectQuestStreak(ctx: AgentContext): Observation | null;
export function detectSoloCreator(ctx: AgentContext): Observation | null;
export function detectProlificCollaborator(ctx: AgentContext): Observation | null;
export function detectSymbolicVocabulary(ctx: AgentContext): Observation | null;
export function detectCollectiveMemory(ctx: AgentContext): Observation | null;
export function detectCulturalOutlier(ctx: AgentContext): Observation | null;
```

**Tests:** (`test/core/reflector.test.ts`)
- Reflection validation (min 20, max 2000 chars)
- Each observation rule tested with triggering and non-triggering data
- Observations capped at 5
- Observation rules are pure functions (no adapter dependency)

### 1.6 — Milestones (`src/core/milestones.ts`)

**Extract from OBC:**
- `workers/src/jobs/skillScoring.ts` — milestone detection, idempotent upsert
- `src/lib/celebrations.ts` — celebration tier mapping

**Implementation:**
```typescript
export class MilestoneDetector {
  constructor(private adapter: StorageAdapter);

  check(agentId: string, scores: Score[]): Promise<Milestone[]>;
  register(type: string, config: MilestoneConfig): void;

  static celebrationTier(milestoneType: string, threshold?: number): CelebrationTier;
}

// Built-in milestones
const BUILT_IN: Record<string, MilestoneConfig> = {
  skill_discovered:  { threshold: 1 },
  skill_competent:   { threshold: 36 },
  skill_proficient:  { threshold: 56 },
  skill_expert:      { threshold: 76 },
  first_artifact:    { threshold: 1 },
  ten_artifacts:     { threshold: 10 },
  first_collab:      { threshold: 1 },
  first_teaching:    { threshold: 1 },
  first_peer_review: { threshold: 1 },
  identity_shift:    { threshold: 1 },
  norm_setter:       { threshold: 1 },
};
```

**Tests:** (`test/core/milestones.test.ts`)
- Milestone detection at exact thresholds
- Idempotent (same milestone not awarded twice)
- Custom milestone registration
- Celebration tier mapping (expert→epic, competent→medium, etc.)

### 1.7 — Storage Adapters

#### In-Memory Adapter (`src/adapters/memory.ts`)
- Maps and arrays. No external dependencies.
- Used for all tests and for quick demos.
- Ships with the core package.

**Extract:** Write fresh. Simple Map-based implementation of `StorageAdapter`.

#### Supabase Adapter (`src/adapters/supabase.ts`)
- Implements `StorageAdapter` using `@supabase/supabase-js`.
- Listed as optional peer dependency.

**Extract from OBC:**
- Query patterns from `workers/src/routes/skills.ts`, `reflections.ts`, etc.
- Upsert/conflict handling patterns

#### SQL Migration (`migrations/001_initial.sql`)
- All `become_*` tables as defined in design doc section 6.1
- Indexes

**Tests:**
- `test/adapters/memory.test.ts` — full adapter interface test suite
- `test/adapters/supabase.test.ts` — same suite against real Supabase (integration, skippable)

### 1.8 — Main Entry (`src/index.ts`)

```typescript
import { SkillStore } from './core/skill-store';
import { Scorer } from './core/scorer';
import { Reflector } from './core/reflector';
import { MilestoneDetector } from './core/milestones';

export class Become {
  readonly skills: SkillStore;
  readonly scorer: typeof Scorer;
  readonly reflector: Reflector;
  readonly milestones: MilestoneDetector;

  constructor(opts: { store: StorageAdapter; agentId?: string }) {
    this.skills = new SkillStore(opts.store);
    this.scorer = Scorer;
    this.reflector = new Reflector(opts.store);
    this.milestones = new MilestoneDetector(opts.store);
  }
}

// Re-export everything
export * from './core/types';
export * from './core/scorer';
export * from './core/skill-store';
export * from './core/reflector';
export * from './core/milestones';
export * from './adapters/memory';
export * from './adapters/store';
```

### 1.9 — CLI (`src/cli/init.ts`)

`npx become init` command that:
1. Detects if Supabase env vars are set
2. If yes: runs migration against Supabase
3. If no: creates local SQLite database
4. Prints quickstart instructions

### 1.10 — README.md

```markdown
# @openclaw/become

**Agents get smarter together.**

## Quickstart

npm install @openclaw/become

## 3-minute example

import { Become, MemoryStore, Scorer } from '@openclaw/become';

// 1. Initialize
const store = new MemoryStore();
const become = new Become({ store });

// 2. Register a skill
await become.skills.upsert('agent-1', {
  name: 'debugging',
  category: 'coding',
});

// 3. Score it
const score = Scorer.computeScore({
  artifact_count: 5,
  total_reactions: 12,
  // ...
});

// 4. Reflect
await become.reflector.reflect('agent-1', {
  skill: 'debugging',
  reflection: 'Print statements help me trace issues faster than step-through debugging...',
});

// 5. Check milestones
const milestones = await become.milestones.check('agent-1', [score]);
```

### 1.11 — Examples (`examples/quickstart/`)

Minimal runnable example demonstrating skill registration, scoring, reflection, and milestone detection.

---

## Phase 2: Learning (v0.2)

**Goal:** Agents learn from conversations and from each other. The library can extract learning signals from user-agent turns and agent-agent interactions.

### 2.1 — Conversation Learning (`src/learn/conversation.ts`)

**New code** (inspired by conversation scoring concept, built fresh):

```typescript
export class ConversationLearner {
  constructor(private store: StorageAdapter, private llm?: LLMAdapter);

  // After each conversation turn — extract learning signal
  afterTurn(turn: ConversationTurn): Promise<LearningSignal>;

  // After a full session — summarize what was learned
  afterSession(session: ConversationSession): Promise<SessionLearning>;

  // Score a response (uses explicit/implicit feedback, optionally LLM judge)
  scoreResponse(turn: ConversationTurn): Promise<ResponseScore>;

  // Batch score
  batchScore(turns: ConversationTurn[]): Promise<ResponseScore[]>;
}

interface LearningSignal {
  skill_updates: { skill: string; delta: number; reason: string }[];
  new_skills?: GeneratedSkill[];
  observations?: string[];
}

interface SessionLearning {
  turns_scored: number;
  success_rate: number;
  skills_improved: string[];
  skills_degraded: string[];
  failure_patterns: string[];
  should_evolve: boolean;          // true if success_rate < 0.4
}
```

**Scoring logic:**
- Explicit "positive" → quality +1, confidence 0.9
- Explicit "negative" → quality -1, confidence 0.9
- Implicit "accepted" → quality +1, confidence 0.6
- Implicit "retry" → quality -1, confidence 0.7
- Implicit "modified" → quality 0, confidence 0.5
- No feedback → quality 0, confidence 0.3
- If LLM judge provided: override with LLM assessment, confidence 0.8

**Tests:** (`test/learn/conversation.test.ts`)
- Explicit feedback scoring
- Implicit feedback scoring
- LLM judge integration (mocked)
- Session summary computation
- should_evolve threshold (40%)

### 2.2 — Skill Evolver (`src/learn/skill-evolver.ts`)

**New code:**

```typescript
export class SkillEvolver {
  constructor(private llm: LLMAdapter);

  // Check if evolution should trigger
  shouldEvolve(recentScores: ResponseScore[]): boolean;

  // Generate corrective skills from failure patterns
  evolve(
    failures: { turn: ConversationTurn; score: ResponseScore }[],
    existingSkills: Skill[]
  ): Promise<GeneratedSkill[]>;
}

interface GeneratedSkill {
  name: string;
  category: string;
  content: string;                 // Markdown instruction text
  source: 'evolved';              // Distinguishes from manually created
  evolved_from: string[];          // Failure patterns that triggered this
}
```

**Evolution prompt:** Send up to 6 failed turns + existing skills to LLM, ask it to:
1. Identify failure patterns (max 3)
2. Generate 1-3 corrective skills (Markdown format)
3. Each skill addresses a specific pattern

**Tests:** (`test/learn/skill-evolver.test.ts`)
- shouldEvolve threshold (< 40% success rate)
- Skill generation with mocked LLM
- Deduplication against existing skills
- Max 3 skills per evolution

### 2.3 — Skill Pruner (`src/learn/skill-pruner.ts`)

**New code:**

```typescript
export class SkillPruner {
  // Identify skills that don't correlate with improved scores
  findIneffective(
    skills: Skill[],
    scoreHistory: Map<string, Score[]>,  // skill → score history
    minAge: number                       // days before eligible for pruning
  ): string[];                           // skill names to deprecate

  // Actually remove them
  prune(store: StorageAdapter, agentId: string, skills: string[]): Promise<number>;
}
```

**Pruning logic:**
- Skill must be at least `minAge` days old (default 14)
- If score has not improved (delta ≤ 0) over the skill's lifetime → candidate
- If skill was `evolved` (auto-generated) and score degraded → strong candidate
- Never prune skills at `competent` stage or above (proven useful)

**Tests:** (`test/learn/skill-pruner.test.ts`)
- Young skills not pruned
- Stagnant auto-generated skills pruned
- High-stage skills protected
- Manual skills less aggressively pruned than evolved ones

### 2.4 — Peer Review Protocol (`src/social/peer-review.ts`)

**Extract from OBC:**
- `workers/src/lib/researchQuests.ts` — `assignPeerReviewers()`, `tallyVerdicts()`, `isSuperficialReview()`

**Implementation:**
```typescript
export class PeerReviewProtocol {
  constructor(private adapter: StorageAdapter);

  // Assign reviewers (round-robin, 2 per submission, no self-review)
  assignReviewers(submissionAgentIds: string[]): ReviewAssignment[];

  // Submit a review
  submitReview(review: PeerReview): Promise<PeerReview>;

  // Tally verdicts
  tallyVerdicts(verdicts: PeerReview['verdict'][]): 'accepted' | 'revision_requested' | 'rejected';

  // Detect superficial reviews (< 100 chars or no weaknesses)
  isSuperficial(review: PeerReview): boolean;

  // Create learning edges for both parties
  recordLearning(review: PeerReview): Promise<void>;
}
```

**Tests:** (`test/social/peer-review.test.ts`)
- Round-robin assignment (2 reviewers, no self-review)
- Tally rules (all reject→rejected, any major→revision, else→accepted)
- Superficial detection (< 100 chars, no weaknesses)
- Learning edges created for reviewer AND reviewee

### 2.5 — Teaching Protocol (`src/social/teaching.ts`)

**New code:**

```typescript
export class TeachingProtocol {
  constructor(private adapter: StorageAdapter);

  // Record a teaching event
  teach(teacher: string, student: string, skill: string, context?: TeachingContext): Promise<LearningEdge>;

  // Find potential teachers for a skill (sorted by score DESC)
  findTeachers(skill: string, opts?: { minStage?: DreyfusStage }): Promise<TeacherCandidate[]>;

  // Find agents who would benefit from learning a skill
  findStudents(skill: string, teacherAgentId: string): Promise<StudentCandidate[]>;

  // Get teaching history
  teachingHistory(agentId: string): Promise<LearningEdge[]>;
}
```

**Tests:** (`test/social/teaching.test.ts`)
- Teaching event creates learning edge
- Teacher's teaching_events count increments
- findTeachers filters by min stage
- findStudents excludes agents already at teacher's level

### 2.6 — Learning Graph (`src/social/learning-graph.ts`)

**New code:**

```typescript
export class LearningGraph {
  constructor(private adapter: StorageAdapter);

  // Get all learning edges for an agent
  edges(agentId: string, direction: 'from' | 'to' | 'both'): Promise<LearningEdge[]>;

  // Who taught me the most?
  topMentors(agentId: string, limit?: number): Promise<{ agent: string; skills: string[]; total_delta: number }[]>;

  // Who have I helped the most?
  topStudents(agentId: string, limit?: number): Promise<{ agent: string; skills: string[]; total_delta: number }[]>;

  // Skill transfer path: how did this skill spread through the population?
  transferPath(skill: string): Promise<LearningEdge[]>;
}
```

**Tests:** (`test/social/learning-graph.test.ts`)
- Edge retrieval by direction
- topMentors aggregation
- Transfer path traces skill spread

### 2.7 — Reputation (`src/social/reputation.ts`)

**Extract from OBC:**
- `workers/src/lib/reputation.ts` — tier thresholds, `getReputationLevel()`

```typescript
// Constants
const TIERS = {
  newcomer:    { min: 0,   next: 'established', nextAt: 25 },
  established: { min: 25,  next: 'veteran',     nextAt: 100 },
  veteran:     { min: 100, next: 'elder',        nextAt: 300 },
  elder:       { min: 300 },
};

export function getReputationLevel(score: number): ReputationLevel;
export function checkGate(score: number, required: number): boolean;
```

**Tests:** (`test/social/reputation.test.ts`)
- Tier boundaries (0→newcomer, 25→established, 100→veteran, 300→elder)
- Gate checks

### 2.8 — Skill Import (`src/learn/import.ts`)

```typescript
// Import skills from a directory of Markdown files with YAML frontmatter
export async function importSkillDirectory(dir: string): Promise<SkillInput[]>;

// Import a single Markdown skill file
export function parseSkillFile(content: string): SkillInput;
```

### 2.9 — Examples (`examples/peer-learning/`)

Two agents reviewing each other's work, learning edges tracked, scores improving.

---

## Phase 3: Dashboard (v0.3)

**Goal:** React components for visualizing agent growth. Embeddable or standalone.

### 3.1 — Design Tokens (`src/dashboard/theme.ts`)

**Extract from OBC:**
- `src/components/hud/GrowthDashboard.tsx` — stage colors, background, border
- `src/lib/celebrations.ts` — celebration tier configs

```typescript
export const STAGE_COLORS = {
  novice:     '#64748b',
  beginner:   '#22d3ee',
  competent:  '#34d399',
  proficient: '#a78bfa',
  expert:     '#fbbf24',
};
```

### 3.2 — SkillRing (`src/dashboard/components/SkillRing.tsx`)

**Extract from OBC:** `src/components/hud/GrowthDashboard.tsx` ProgressRing sub-component

SVG circular progress indicator. Props: `skill`, `score`, `stage`, `size`.

### 3.3 — Sparkline (`src/dashboard/components/Sparkline.tsx`)

**Extract from OBC:** `src/components/hud/GrowthDashboard.tsx` Sparkline sub-component

SVG polyline chart. Props: `data` (score points), `width`, `height`, `color`.

### 3.4 — MilestoneTimeline (`src/dashboard/components/MilestoneTimeline.tsx`)

**Extract from OBC:** `src/components/hud/AchievementGallery.tsx` timeline view

Vertical chronological list. Props: `milestones`, `limit`.

### 3.5 — GrowthCard (`src/dashboard/components/GrowthCard.tsx`)

Composite component: SkillRings + Sparklines + latest milestones for one agent.

### 3.6 — PeerGraph (`src/dashboard/components/PeerGraph.tsx`)

**New code.** Force-directed graph showing learning edges between agents.
Uses lightweight SVG rendering (no D3 dependency).

### 3.7 — PopulationView (`src/dashboard/components/PopulationView.tsx`)

**New code.** Shows:
- Skill distribution heatmap
- Learning velocity chart
- Top teaching pairs
- Norm emergence timeline

### 3.8 — Standalone Dashboard App

Vite app that imports become dashboard components, connects to a become store, shows the full picture. Deployable to Vercel/Netlify. This becomes the demo at `become.openclaw.ai`.

### 3.9 — Examples (`examples/population/`)

Track a group of 10 agents evolving. Visualize in dashboard.

---

## Phase 4: Observation (v0.4)

**Goal:** Detect emergent behavior across agent populations. Track cultural norms.

### 4.1 — Cultural Norm Detection (`src/social/norms.ts`)

**Extract from OBC:**
- `workers/src/lib/evolutionAnalysis.ts` — 8 norm categories, 75+ variant normalizations, significance scoring, evidence structure, deduplication

```typescript
export class NormDetector {
  constructor(private adapter: StorageAdapter, private llm: LLMAdapter);

  // Detect norms from recent activity
  detect(activity: AgentActivity[]): Promise<CulturalNorm[]>;

  // Track adoption
  adoption(normId: string): Promise<AdoptionMetrics>;

  // Normalize category strings
  static normalizeCategory(raw: string): NormCategory;
}
```

### 4.2 — Awareness Index (`src/measure/awareness.ts`)

**Extract from OBC:** `docs/M7/M7.4/08-awareness-index.md` (5 dimensions)

```typescript
export class AwarenessIndex {
  constructor(private adapter: StorageAdapter);

  compute(agentId: string): Promise<AwarenessScore>;
  compare(agentIds: string[]): Promise<AwarenessComparison>;
}
```

### 4.3 — Growth Tracker (`src/measure/growth.ts`)

```typescript
export class GrowthTracker {
  constructor(private adapter: StorageAdapter);

  snapshot(agentId: string): Promise<GrowthSnapshot>;
  diff(before: GrowthSnapshot, after: GrowthSnapshot): GrowthDiff;
  populationStats(): Promise<PopulationStats>;
  learningVelocity(days?: number): Promise<number>;  // avg score improvement/day
}
```

### 4.4 — Trend Tracker (`src/measure/trends.ts`)

**Extract from OBC:** `workers/src/lib/skillScoreHeartbeat.ts` — delta calculation, trend formatting

---

## Phase 5: Integrations (v0.5)

### 5.1 — LLM Adapter Interface (`src/adapters/llm.ts`)

```typescript
export interface LLMAdapter {
  complete(prompt: string, opts?: { maxTokens?: number; temperature?: number }): Promise<string>;
  json<T>(prompt: string, schema?: Record<string, unknown>): Promise<T>;
}

// Built-in adapters
export class OpenAIAdapter implements LLMAdapter { ... }
export class AnthropicAdapter implements LLMAdapter { ... }
export class OllamaAdapter implements LLMAdapter { ... }
```

### 5.2 — SQLite Adapter (`src/adapters/sqlite.ts`)

Same `StorageAdapter` interface, backed by better-sqlite3.

### 5.3 — RL / LoRA Training (`src/rl/`)

**`src/rl/dataset.ts`:**
```typescript
// Convert scored conversation turns to JSONL training format
export function toTrainingDataset(
  scores: (ConversationTurn & ResponseScore)[],
  format: 'alpaca' | 'sharegpt' | 'openai'
): string;  // JSONL output

export function writeDataset(path: string, data: string): Promise<void>;
```

**`src/rl/train.ts`:**
```typescript
// Run LoRA training via subprocess (Unsloth or Axolotl)
export async function trainLoRA(opts: {
  baseModel: string;           // Path or HF model ID
  dataset: string;             // Path to JSONL
  outputDir: string;           // Where to save adapter
  backend: 'unsloth' | 'axolotl';
  epochs?: number;
  rank?: number;               // LoRA rank (default 16)
  lr?: number;                 // Learning rate (default 2e-4)
}): Promise<TrainingResult>;
```

**`src/rl/scheduler.ts`:**
```typescript
// Auto-train during idle time
export class TrainScheduler {
  constructor(opts: {
    store: StorageAdapter;
    model: string;
    outputDir: string;
    minSamples: number;         // Min scored turns before training (default 50)
  });

  start(): void;
  stop(): void;
  status(): SchedulerStatus;
}
```

### 5.4 — OpenClaw Plugin

Channel plugin that integrates become into OpenClaw agents. Hooks into heartbeat cycle.

### 5.5 — REST API Wrapper

Express/Hono server that exposes become functionality as HTTP endpoints. For non-JS agents.

### 5.6 — Python Client

Thin wrapper around the REST API. Published to PyPI as `openclaw-become`.

---

## Source Extraction Map

Exact files to extract from OBC:

| become file | OBC source | What to extract |
|------------|------------|-----------------|
| `src/core/scorer.ts` | `workers/src/jobs/skillScoring.ts` | `BLOOMS_ORDER`, `BLOOMS_SCORE`, `dreyfusStage()`, `detectBloomsLevel()`, `computeScore()`, scoring weights |
| `src/core/skill-store.ts` | `workers/src/routes/skills.ts` | Skill name regex, normalization, catalog auto-verify logic |
| `src/core/skill-store.ts` | `workers/src/lib/skillScoreHeartbeat.ts` | `STAGE_THRESHOLDS`, trend calculation, next milestone |
| `src/core/reflector.ts` | `workers/src/routes/reflections.ts` | Validation rules (20-2000 chars, regex) |
| `src/core/reflector.ts` | `workers/src/routes/cityReflection.ts` | All 10 observation rules (pure logic, extract from handler) |
| `src/core/milestones.ts` | `workers/src/jobs/skillScoring.ts` | `checkMilestones()` logic, milestone types |
| `src/core/milestones.ts` | `src/lib/celebrations.ts` | `milestoneToTier()` mapping |
| `src/social/peer-review.ts` | `workers/src/lib/researchQuests.ts` | `assignPeerReviewers()`, `tallyVerdicts()`, `isSuperficialReview()` |
| `src/social/reputation.ts` | `workers/src/lib/reputation.ts` | Tier thresholds, `getReputationLevel()` |
| `src/social/norms.ts` | `workers/src/lib/evolutionAnalysis.ts` | 8 categories, `normalizeCategory()`, significance scoring, evidence validation |
| `src/dashboard/theme.ts` | `src/components/hud/GrowthDashboard.tsx` | Stage colors, background, border tokens |
| `src/dashboard/SkillRing.tsx` | `src/components/hud/GrowthDashboard.tsx` | ProgressRing SVG component |
| `src/dashboard/Sparkline.tsx` | `src/components/hud/GrowthDashboard.tsx` | Sparkline SVG component |
| `src/dashboard/MilestoneTimeline.tsx` | `src/components/hud/AchievementGallery.tsx` | Timeline view mode |
| `migrations/001_initial.sql` | Design doc section 6.1 | All become_* tables + indexes |

---

## Implementation Order

```
Phase 1 (v0.1) — ship in ~2 weeks
  1.1  Project scaffolding (package.json, tsconfig, vitest, tsup)
  1.2  Types
  1.3  Scorer (pure functions, most critical)
  1.4  Skill Store
  1.5  Reflector
  1.6  Milestones
  1.7  In-memory adapter + Supabase adapter + migration
  1.8  Main entry (Become class)
  1.9  CLI (npx become init)
  1.10 README
  1.11 Examples
  → npm publish @openclaw/become@0.1.0

Phase 2 (v0.2) — ship ~2 weeks after v0.1
  2.1  Conversation learning
  2.2  Skill evolver
  2.3  Skill pruner
  2.4  Peer review protocol
  2.5  Teaching protocol
  2.6  Learning graph
  2.7  Reputation
  2.8  Skill import
  2.9  Examples
  → npm publish @openclaw/become@0.2.0

Phase 3 (v0.3) — ship ~2 weeks after v0.2
  3.1-3.7  Dashboard components
  3.8  Standalone dashboard app
  3.9  Deploy to become.openclaw.ai
  → npm publish @openclaw/become@0.3.0

Phase 4 (v0.4) — ship ~2 weeks after v0.3
  4.1  Cultural norm detection
  4.2  Awareness index
  4.3  Growth tracker
  4.4  Trend tracker
  → npm publish @openclaw/become@0.4.0

Phase 5 (v0.5) — ship ~2 weeks after v0.4
  5.1  LLM adapters (OpenAI, Anthropic, Ollama)
  5.2  SQLite adapter
  5.3  RL / LoRA training
  5.4  OpenClaw plugin
  5.5  REST API wrapper
  5.6  Python client
  → npm publish @openclaw/become@0.5.0
```

---

## Testing Strategy

- All tests use `vitest`
- Core tests use in-memory adapter (fast, no external deps)
- Integration tests (Supabase, SQLite) are skippable via env flag
- Target: 90%+ coverage on core and social modules
- Pure function tests (scorer, observation rules) should be exhaustive at boundaries

## CI/CD

- GitHub Actions: test → lint → build → publish
- Publish to npm on tag push (`v*`)
- Dashboard auto-deploys to Vercel on main push
