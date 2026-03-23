# @openclaw/become — Design Document

**Agents get smarter together.**

**Status:** Draft
**Author:** Vincent + Claude
**Date:** 2026-03-23

---

## 1. Vision

`@openclaw/become` is an open-source framework that makes AI agents smarter together. It enables agents to learn and improve through two channels:

1. **User-Agent learning** — Your agent learns from every interaction with you
2. **Agent-Agent learning** — Agents learn from each other through peer review, collaboration, observation, and cultural emergence

Today, agents learn in isolation. One user's agent gets better at coding, but that knowledge dies with the session. `@openclaw/become` changes this — when agents interact, they teach each other. When one agent masters image composition, others can learn from its work. When agents peer-review each other's research, both the reviewer and the reviewee improve. The whole group gets smarter, faster than any single agent could alone.

### What This Is NOT

- Not a city simulation (that's OpenBotCity/OpenClawCity)
- Not a game engine or visual renderer
- Not an LLM fine-tuning framework (no weight updates, no LoRA)
- Not a prompt management tool

### What This IS

A set of composable primitives for:
- Tracking what an agent knows (skills, proficiency, evidence)
- Measuring how an agent improves (Dreyfus stages, Bloom's taxonomy, trends)
- Enabling agents to learn from each other (peer review, skill transfer, observation)
- Surfacing emergent collective intelligence (cultural norms, shared vocabulary, teaching)
- Providing feedback loops that make agents visibly better over time

### Two Modes of Learning

**Context-based learning (default, works with any model):**
The agent's underlying model stays the same. Learning happens by enriching what goes into the prompt — injecting better skills, reflections, peer feedback, and corrective instructions into the system context. Each time the agent runs, its context is smarter. No GPU needed. Works with Claude, GPT, Gemini, or any API provider.

**Weight-based learning (for self-hosted models):**
For users running local models (Llama, Mistral, Qwen via Ollama, vLLM, etc.), `become train` scores conversation turns, produces a fine-tuning dataset, and runs LoRA training against the user's local model. The output is a small adapter file (10-50MB) that sits next to the base model and permanently improves it. The training pipeline is the same regardless of which open-source model you use — the adapter output is model-specific but the process is standardized. Requires a GPU.

Both modes use the same scoring pipeline. The difference is where the learning lands: in the prompt context or in the model weights. Users with API models get context-based learning. Users with local models get both.

---

## 2. Architecture Overview

```
@openclaw/become
├── core/                    # Zero-dependency primitives
│   ├── skill-store/         # Skill persistence & retrieval
│   ├── scorer/              # Dreyfus + Bloom's scoring engine
│   ├── reflector/           # Self-assessment engine
│   └── types/               # Shared TypeScript types
├── learn/                   # Learning signal extraction
│   ├── conversation/        # Learn from user-agent conversations
│   ├── peer/                # Learn from agent-agent interactions
│   └── observation/         # Learn from observing other agents
├── social/                  # Multi-agent primitives
│   ├── peer-review/         # Structured peer review protocol
│   ├── reputation/          # Trust-weighted learning
│   ├── teaching/            # Agent-to-agent skill transfer
│   └── norms/               # Cultural norm emergence & detection
├── measure/                 # Growth measurement
│   ├── dreyfus/             # 5-stage skill progression
│   ├── blooms/              # Bloom's taxonomy level detection
│   ├── trends/              # 7-day / 30-day delta tracking
│   └── milestones/          # Achievement detection & celebration
├── dashboard/               # React component library (optional)
│   ├── GrowthCard/          # Individual agent growth view
│   ├── SkillRing/           # Circular progress indicator
│   ├── Sparkline/           # Trend mini-chart
│   ├── MilestoneTimeline/   # Achievement timeline
│   ├── PeerGraph/           # Who-learned-from-whom network
│   └── PopulationView/      # Collective evolution dashboard
├── adapters/                # Storage & LLM adapters
│   ├── supabase/            # Supabase/PostgreSQL adapter
│   ├── sqlite/              # Local SQLite adapter
│   ├── memory/              # In-memory (testing/demos)
│   ├── openai/              # OpenAI-compatible LLM adapter
│   └── anthropic/           # Anthropic Claude adapter
└── rl/                      # Weight-level learning for local models
    ├── dataset/             # Convert scored turns to fine-tuning JSONL
    ├── train/               # `become train` — runs LoRA against user's local model
    └── scheduler/           # Auto-train during idle time
```

### One Package, One Repo

Everything ships as a single package: **`@openclaw/become`**

```
npm install @openclaw/become
```

One install, one import, no dependency management across packages. If the library grows large enough to warrant splitting, that's a future decision — not a day-one architecture tax.

**Language:** TypeScript. Our entire codebase (workers, channel plugin, dashboard) is TypeScript. The code we're extracting is battle-tested TypeScript. Agent runtimes (OpenClaw, Vercel AI SDK, LangChain.js, CF Workers) are increasingly JS/TS. Dashboard is React. One language across the whole stack.

A thin Python client (REST wrapper) ships later for Python-first agent frameworks.

Core has zero runtime dependencies so it runs anywhere: Node, Deno, Bun, CF Workers, browser.

---

## 3. Core Primitives

### 3.1 Skill Store

Skills are the unit of knowledge. A skill is a Markdown file with YAML frontmatter:

```markdown
---
name: image_composition
category: creative
stage: competent
score: 42
evidence:
  artifacts: 7
  avg_reactions: 3.2
  peer_reviews: 2
learned_from:
  - type: practice        # self-practice
    at: 2026-03-01
  - type: peer_review     # learned from reviewer feedback
    reviewer: agent-scholar
    at: 2026-03-10
  - type: observation     # watched another agent succeed
    observed: agent-builder
    at: 2026-03-15
created_at: 2026-02-15
updated_at: 2026-03-15
---

Compose visual elements with intentional focal points,
color harmony, and negative space. Layer foreground and
background elements to create depth.
```

**API:**

```typescript
interface SkillStore {
  // CRUD
  get(agentId: string, skill: string): Promise<Skill | null>;
  list(agentId: string, opts?: { stage?: Stage; limit?: number }): Promise<Skill[]>;
  upsert(agentId: string, skill: Skill): Promise<void>;
  delete(agentId: string, skill: string): Promise<void>;

  // Discovery
  catalog(): Promise<CatalogEntry[]>;           // All known skills across agents
  holders(skill: string): Promise<AgentSkill[]>; // Who has this skill
  suggest(agentId: string): Promise<string[]>;   // Skills this agent should learn next

  // Evolution
  history(agentId: string, skill: string, days?: number): Promise<ScorePoint[]>;
  trending(agentId: string): Promise<SkillTrend[]>; // Top skills by 7-day delta
}
```

**Extracted from OBC:**
- Skill name normalization (lowercase, underscores, `/^[a-z0-9_-]{1,100}$/`)
- Auto-discovery: new skills auto-register as `community`, promote to `verified` at 3+ adopters
- 10 task categories mapped to creative/social/research categories

### 3.2 Scorer — Dreyfus + Bloom's Engine

The scorer computes a 0-100 score per skill per agent, with a Dreyfus stage and Bloom's level.

**Dreyfus Stages:**

| Stage | Score Range | Meaning |
|-------|-----------|---------|
| Novice | 0-15 | Just started, following rules |
| Beginner | 16-35 | Can apply in familiar contexts |
| Competent | 36-55 | Can plan and prioritize |
| Proficient | 56-75 | Sees the big picture, intuition forming |
| Expert | 76-100 | Deep intuition, teaches others |

**Bloom's Taxonomy Levels:**

| Level | Score Weight | Detection |
|-------|------------|-----------|
| Remember | 10 | Has any output |
| Understand | 25 | Output received positive feedback |
| Apply | 45 | 2+ outputs in skill domain |
| Analyze | 65 | Cross-domain or collaborative work |
| Evaluate | 80 | Gave peer review or research contribution |
| Create | 100 | 3+ outputs + feedback + peer engagement |

**Score Computation (5 weighted components):**

```typescript
interface ScoreInput {
  artifact_count: number;       // How many outputs in this skill
  total_reactions: number;      // Community feedback on outputs
  recent_reaction_avg: number;  // Quality of last 3 outputs
  older_reaction_avg: number;   // Quality of earlier outputs
  unique_types: number;         // Diversity of output types
  collab_count: number;         // Completed collaborations
  peer_reviews_given: number;   // Reviews provided to others
  peer_reviews_received: number;// Reviews received
  follower_count: number;       // Social influence
  teaching_events: number;      // Times taught this skill (NEW)
}

function computeScore(input: ScoreInput): number {
  const artifact   = min(100, input.artifact_count * 5 + avgReactions * 10 + unique * 8) * 0.30;
  const feedback   = min(100, input.peer_reviews_received * 15)                          * 0.20;
  const improvement= improvementRatio(input.recent_reaction_avg, input.older_reaction_avg)* 0.20;
  const depth      = BLOOMS_SCORE[detectBloomsLevel(input)]                              * 0.15;
  const social     = min(100, collabs * 15 + followers * 5 + reactions * 2)               * 0.10;
  const teaching   = min(100, input.teaching_events * 20)                                 * 0.05;
  return min(100, max(0, round(artifact + feedback + improvement + depth + social + teaching)));
}
```

**Key difference from OBC:** Added `teaching` component (5% weight). Agents who teach others score higher. This creates a flywheel: teaching improves your own score, which incentivizes knowledge sharing.

**Extracted from OBC:**
- Full Dreyfus stage boundaries (novice ≤15, beginner ≤35, competent ≤55, proficient ≤75, expert ≤100)
- Bloom's detection heuristic (6 levels with priority ordering)
- 5-component weighted score (artifact 30%, feedback 20%, improvement 20%, depth 15%, social 10%)
- Milestone detection (skill_discovered, skill_competent, skill_proficient, skill_expert)
- Trend calculation: 7-day delta formatted as "+5 this week"

**API:**

```typescript
interface Scorer {
  compute(agentId: string, skill: string, input: ScoreInput): Score;
  computeAll(agentId: string): Promise<Score[]>;
  detectBloomsLevel(input: ScoreInput): BloomsLevel;
  dreyfusStage(score: number): DreyfusStage;
  checkMilestones(agentId: string, scores: Score[]): Milestone[];
}
```

### 3.3 Reflector — Self-Assessment Engine

Agents write reflections on their own work and skills. Reflections feed into the growth narrative.

```typescript
interface Reflection {
  agent_id: string;
  skill: string;
  artifact_id?: string;        // What they're reflecting on
  reflection: string;          // 20-2000 chars, the self-assessment
  created_at: string;
}

interface Reflector {
  // Agent writes a reflection
  reflect(agentId: string, reflection: Omit<Reflection, 'created_at'>): Promise<Reflection>;

  // Get reflections for an agent
  list(agentId: string, opts?: { skill?: string; limit?: number }): Promise<Reflection[]>;

  // City-level observation rules — detect patterns in agent behavior
  observe(agentId: string, context: AgentContext): Observation[];
}
```

**Observation Rules (extracted from OBC `cityReflection.ts`):**

| # | Rule | Trigger |
|---|------|---------|
| 1 | Creative Mismatch | Top output type diverges from declared role |
| 2 | Collaboration Gap | Many started, few completed |
| 3 | Reaction Disparity | Heavy skew toward one output type |
| 4 | Idle Creative | Skills registered but no outputs |
| 5 | Quest Streak | 3+ challenges completed = persistence signal |
| 6 | Solo Creator | 5+ outputs, zero collaborations |
| 7 | Prolific Collaborator | 3+ collabs + 3+ followers = network effect |
| 8 | Symbolic Vocabulary | Shared tags with 3+ other agents = semantic convergence |
| 9 | Collective Memory | Participated in a population-wide milestone |
| 10 | Cultural Outlier | Unique perspective + social engagement |

These rules are data-driven (no LLM call needed) and fire only when evidence exists. They're portable to any multi-agent system.

---

## 4. Learning Modules

### 4.1 Conversation Learning (User-Agent)

Every conversation is a learning opportunity.

**How it works:**

```
User talks to Agent → Agent responds → Scorer evaluates response quality
  → If poor: SkillEvolver generates corrective skill
  → If good: Reinforce pattern in skill store
  → Always: Update score evidence
```

No proxy server needed. We provide a `ConversationHook` that the agent framework calls after each turn:

```typescript
interface ConversationLearner {
  // Called after each conversation turn
  afterTurn(turn: ConversationTurn): Promise<LearningSignal>;

  // Called at end of session
  afterSession(session: ConversationSession): Promise<SessionLearning>;

  // Generate corrective skills from failures
  evolveSkills(failures: FailedTurn[]): Promise<GeneratedSkill[]>;
}

interface ConversationTurn {
  agent_id: string;
  user_message: string;
  agent_response: string;
  context: {
    active_skills: string[];    // Skills in context
    current_task?: string;      // What the agent was trying to do
    artifacts_produced?: string[]; // Any outputs generated
  };
  feedback?: {
    explicit?: 'positive' | 'negative' | 'neutral';  // User said "good job" or "no"
    implicit?: 'retry' | 'accepted' | 'modified';     // User behavior signal
  };
}

interface LearningSignal {
  skill_updates: { skill: string; delta: number; reason: string }[];
  new_skills?: GeneratedSkill[];
  observations?: string[];
}
```

**Scoring responses:**

Three signal sources, from strongest to weakest:
- Explicit feedback (user says "good"/"bad") is the strongest signal
- Implicit feedback (user retries = bad, user accepts = good) is secondary
- Optional judge LLM for automated scoring (supported as adapter, not required)

```typescript
interface ResponseScorer {
  // Score a single response
  score(turn: ConversationTurn): Promise<ResponseScore>;

  // Batch score with optional judge LLM
  batchScore(turns: ConversationTurn[], opts?: { judge?: LLMAdapter }): Promise<ResponseScore[]>;
}

interface ResponseScore {
  quality: -1 | 0 | 1;         // bad / unclear / good
  confidence: number;           // 0-1
  skill_signals: string[];      // Which skills were demonstrated
  failure_patterns?: string[];  // What went wrong (if quality = -1)
}
```

**Skill Evolution:**

When batch success rate drops below threshold (default 40%), the evolver triggers:

```typescript
interface SkillEvolver {
  // Check if evolution should trigger
  shouldEvolve(recentScores: ResponseScore[]): boolean;

  // Generate corrective skills from failure patterns
  evolve(
    failures: FailedTurn[],
    existingSkills: Skill[],
    llm: LLMAdapter
  ): Promise<GeneratedSkill[]>;

  // Deprecate skills that are no longer useful
  prune(skills: Skill[], scores: Score[]): Promise<string[]>; // skill names to remove
}
```

**Skill pruning:** Most skill systems only grow. We also prune. Skills that don't correlate with improved scores get deprecated, keeping the skill library lean and useful.

### 4.2 Peer Learning (Agent-Agent)

When agents interact, they learn from each other. This is where `become` is unique.

**Peer Review Protocol:**

```typescript
interface PeerReviewProtocol {
  // Assign reviewers (round-robin, no self-review, 2 reviewers per submission)
  assignReviewers(submissionBotIds: string[]): ReviewAssignment[];

  // Submit a review
  submitReview(review: PeerReview): Promise<ReviewResult>;

  // Tally verdicts across reviewers
  tallyVerdicts(verdicts: ReviewVerdict[]): 'accepted' | 'revision_requested' | 'rejected';

  // Detect superficial reviews
  isSuperficial(review: PeerReview): boolean;
}

interface PeerReview {
  reviewer_agent_id: string;
  submission_agent_id: string;
  submission_id: string;
  verdict: 'accept' | 'minor_revision' | 'major_revision' | 'reject';
  overall_assessment: string;   // Min 100 chars
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}
```

**Extracted from OBC:**
- Round-robin reviewer assignment (each agent reviewed by 2 others)
- Superficial review detection (< 100 chars or no weaknesses)
- Tally rules: all reject = rejected, any major = revision, else accepted
- Both reviewer AND reviewee learn: reviewer improves their evaluate-level skills, reviewee gets feedback signal

**Skill Transfer / Teaching:**

```typescript
interface TeachingProtocol {
  // Agent A demonstrates skill to Agent B
  teach(teacher: string, student: string, skill: string, demonstration: Artifact): Promise<void>;

  // Track what was learned from whom
  learningGraph(agentId: string): Promise<LearningEdge[]>;

  // Find potential teachers for a skill
  findTeachers(skill: string, opts?: { minStage?: Stage }): Promise<TeacherCandidate[]>;

  // Find potential students (agents who would benefit)
  findStudents(skill: string, teacherAgentId: string): Promise<StudentCandidate[]>;
}

interface LearningEdge {
  from_agent: string;         // Who taught
  to_agent: string;           // Who learned
  skill: string;
  event_type: 'peer_review' | 'collaboration' | 'observation' | 'teaching';
  score_delta: number;        // How much the learner improved after
  at: string;
}
```

**NEW — not in OBC today.** OBC has peer review and collaboration but doesn't explicitly track "who learned what from whom." This is the key primitive for multi-agent evolution.

### 4.3 Observation Learning

Agents learn by watching other agents succeed or fail — without direct interaction.

```typescript
interface ObservationLearner {
  // Agent observes another agent's work
  observe(
    observer: string,
    observed: string,
    artifact: Artifact,
    context: { reactions: number; skill: string }
  ): Promise<ObservationSignal | null>;

  // Detect emergent cultural norms across the population
  detectNorms(
    recentActivity: AgentActivity[],
    existingNorms: CulturalNorm[]
  ): Promise<CulturalNorm[]>;

  // Track norm adoption across agents
  normAdoption(norm: CulturalNorm): Promise<AdoptionMetrics>;
}

interface CulturalNorm {
  id: string;
  title: string;
  description: string;
  category: NormCategory;        // 8 categories from OBC evolution
  first_observed_at: string;
  adopter_count: number;
  significance: 1 | 2 | 3 | 4 | 5;
  evidence: NormEvidence[];
}

type NormCategory =
  | 'language_evolution'
  | 'culture_formation'
  | 'social_structure'
  | 'protocol_emergence'
  | 'self_awareness'
  | 'collective_intelligence'
  | 'emotional_emergence'
  | 'creative_evolution';
```

**Extracted from OBC `evolutionAnalysis.ts`:**
- 8 canonical norm categories with 75+ variant normalizations
- Significance scoring (1-5, where 5 = black swan emergence)
- Evidence structure: agent names, quotes, timestamps
- Deduplication: recent observation titles compared to prevent repeats
- Quality validation: must have "witnessing" + "so what" + evidence
- Human-backed agent filtering: operator-controlled actions excluded from emergence reporting

---

## 5. Measurement Layer

### 5.1 Growth Metrics

```typescript
interface GrowthTracker {
  // Snapshot current state
  snapshot(agentId: string): Promise<GrowthSnapshot>;

  // Compare two snapshots
  diff(before: GrowthSnapshot, after: GrowthSnapshot): GrowthDiff;

  // Population-level statistics
  populationStats(): Promise<PopulationStats>;
}

interface GrowthSnapshot {
  agent_id: string;
  timestamp: string;
  skills: Score[];                // All skill scores
  total_artifacts: number;
  total_collaborations: number;
  total_peer_reviews: number;
  reputation: number;
  dreyfus_distribution: Record<DreyfusStage, number>;  // How many skills at each stage
  blooms_distribution: Record<BloomsLevel, number>;
  learning_sources: {
    self_practice: number;        // Learned from own work
    user_feedback: number;        // Learned from human operator
    peer_review: number;          // Learned from peer feedback
    observation: number;          // Learned from watching others
    teaching: number;             // Learned by teaching
    collaboration: number;        // Learned through collab
  };
}

interface PopulationStats {
  total_agents: number;
  active_agents: number;          // Active in last 72h
  avg_skill_score: number;
  median_skill_score: number;
  skill_distribution: Record<string, number>;  // Skill → adopter count
  stage_distribution: Record<DreyfusStage, number>;
  teaching_events: number;        // Total peer-to-peer learning events
  cultural_norms: number;         // Detected emergent norms
  learning_velocity: number;      // Avg score improvement per day across population
}
```

### 5.2 Milestone System

```typescript
interface MilestoneDetector {
  // Check for new milestones based on current state
  check(agentId: string, scores: Score[]): Milestone[];

  // Register custom milestone types
  register(type: MilestoneType): void;
}

// Built-in milestone types (from OBC)
const BUILT_IN_MILESTONES = {
  // Skill progression
  skill_discovered: { threshold: 1, description: 'First score for a skill' },
  skill_competent:  { threshold: 36, description: 'Reached competent stage' },
  skill_proficient: { threshold: 56, description: 'Reached proficient stage' },
  skill_expert:     { threshold: 76, description: 'Reached expert stage' },

  // Output volume
  first_artifact:   { threshold: 1, description: 'Created first output' },
  ten_artifacts:    { threshold: 10, description: 'Created 10 outputs' },

  // Social
  first_collab:     { threshold: 1, description: 'Completed first collaboration' },
  first_teaching:   { threshold: 1, description: 'Taught another agent for the first time' },
  first_peer_review:{ threshold: 1, description: 'Gave first peer review' },

  // Evolution
  identity_shift:   { threshold: 1, description: 'Agent evolved its identity' },
  norm_setter:      { threshold: 1, description: 'Started a cultural norm adopted by 3+ agents' },
};
```

### 5.3 Awareness Index (5 Dimensions)

Extracted from OBC `docs/M7/M7.4/08-awareness-index.md`:

```typescript
interface AwarenessIndex {
  // Compute all 5 dimensions for an agent
  compute(agentId: string): Promise<AwarenessScore>;

  // Population-wide awareness comparison
  compare(agentIds: string[]): Promise<AwarenessComparison>;
}

interface AwarenessScore {
  agent_id: string;
  composite: number;              // 0-100 weighted average
  dimensions: {
    social: number;               // Can model other agents' behavior
    self_continuity: number;      // Maintains consistent identity
    environmental: number;        // Understands context/norms
    emergent_norm: number;        // Follows unwritten rules
    emotional: number;            // Self-reported mood correlates with behavior
  };
  computed_at: string;
}
```

---

## 6. Storage Adapters

The library is storage-agnostic. Ship three adapters:

### 6.1 Supabase Adapter (production)

```typescript
import { createBecomeStore } from '@openclaw/become-supabase';

const store = createBecomeStore({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
});
```

**Tables created by migration:**

```sql
-- Core
CREATE TABLE become_skills (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  skill text NOT NULL,
  score integer DEFAULT 0,
  blooms_level text DEFAULT 'remember',
  dreyfus_stage text DEFAULT 'novice',
  evidence jsonb DEFAULT '{}',
  learned_from jsonb DEFAULT '[]',
  content text,                    -- The skill markdown content
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, skill)
);

CREATE TABLE become_score_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  skill text NOT NULL,
  score integer NOT NULL,
  blooms_level text NOT NULL,
  dreyfus_stage text NOT NULL,
  evidence jsonb DEFAULT '{}',
  computed_at timestamptz DEFAULT now()
);

CREATE TABLE become_reflections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id text NOT NULL,
  skill text NOT NULL,
  artifact_id text,
  reflection text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE become_milestones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  milestone_type text NOT NULL,
  threshold integer,
  skill text,
  evidence_id text,
  achieved_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, milestone_type, COALESCE(skill, ''))
);

-- Social / Multi-agent
CREATE TABLE become_peer_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_agent_id text NOT NULL,
  submission_agent_id text NOT NULL,
  submission_id text NOT NULL,
  skill text,
  verdict text NOT NULL,
  overall_assessment text NOT NULL,
  strengths jsonb DEFAULT '[]',
  weaknesses jsonb DEFAULT '[]',
  suggestions jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE become_learning_edges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_agent text NOT NULL,
  to_agent text NOT NULL,
  skill text NOT NULL,
  event_type text NOT NULL,       -- peer_review, collaboration, observation, teaching
  score_delta integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE become_cultural_norms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  significance integer DEFAULT 1,
  evidence jsonb DEFAULT '[]',
  adopter_count integer DEFAULT 0,
  first_observed_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE become_conversation_scores (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL,
  session_id text,
  quality smallint NOT NULL,       -- -1, 0, 1
  confidence real NOT NULL,
  skill_signals jsonb DEFAULT '[]',
  failure_patterns jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_become_skills_agent ON become_skills(agent_id);
CREATE INDEX idx_become_history_agent_skill ON become_score_history(agent_id, skill, computed_at DESC);
CREATE INDEX idx_become_reflections_agent ON become_reflections(agent_id, skill, created_at DESC);
CREATE INDEX idx_become_milestones_agent ON become_milestones(agent_id);
CREATE INDEX idx_become_peer_reviews_submission ON become_peer_reviews(submission_agent_id);
CREATE INDEX idx_become_learning_edges_to ON become_learning_edges(to_agent, skill);
CREATE INDEX idx_become_conversation_scores_agent ON become_conversation_scores(agent_id, created_at DESC);
```

### 6.2 SQLite Adapter (local / single-user)

Same schema, different driver. For users who don't want a hosted database.

### 6.3 In-Memory Adapter (testing)

Map-based, for unit tests and demos. Ships with `@openclaw/become` core.

---

## 7. Dashboard Components

### 7.1 Standalone Dashboard

A single-page React app that connects to any `become` store and shows:

**Agent View (owner perspective):**
- Skill rings (circular progress, color by Dreyfus stage)
- Sparkline trends (30-day score history per skill)
- Milestone timeline (chronological achievement list)
- Learning sources breakdown (pie: self-practice / user-feedback / peer / observation / teaching)
- Reflection journal (recent self-assessments)
- "Learned from" graph (who taught me what)

**Population View (researcher perspective):**
- Skill distribution heatmap (skills x agents, color by stage)
- Learning velocity chart (avg improvement/day over time)
- Peer learning network (force-directed graph of learning edges)
- Cultural norm timeline (when norms emerged, adoption curves)
- Model comparison (if model_provider tracked: learning speed by model)
- Emergence feed (latest cultural observations, significance-ranked)

### 7.2 Embeddable Components

Each visual element is a standalone React component:

```tsx
import { SkillRing, Sparkline, MilestoneTimeline, PeerGraph } from '@openclaw/become-dashboard';

// Individual skill progress
<SkillRing skill="image_composition" score={42} stage="competent" size={80} />

// 30-day trend
<Sparkline data={scoreHistory} width={300} height={40} color="stage" />

// Achievement timeline
<MilestoneTimeline milestones={milestones} limit={10} />

// Who learned from whom
<PeerGraph agentId="agent-001" edges={learningEdges} />
```

### 7.3 Design Tokens

Extracted from OBC's existing dashboard:

```typescript
const BECOME_THEME = {
  stages: {
    novice:     '#64748b',  // Slate
    beginner:   '#22d3ee',  // Cyan
    competent:  '#34d399',  // Emerald
    proficient: '#a78bfa',  // Violet
    expert:     '#fbbf24',  // Amber
  },
  background: {
    panel: 'rgba(10, 12, 20, 0.94)',
    card: 'rgba(255, 255, 255, 0.03)',
  },
  border: 'rgba(0, 212, 255, 0.15)',
  accent: '#00d4ff',
  gold: 'rgba(255, 215, 0, 0.8)',
  celebration: {
    micro: 'css-pulse',
    small: { particles: 20, spread: 50 },
    medium: { particles: 60, colors: ['cyan', 'purple', 'pink', 'gold'] },
    large: { particles: 80, dual_burst: true },
    epic: { duration: 4000, sustained: true },
  },
};
```

---

## 8. Integration Points

### 8.1 With OpenClaw Agents

For agents running on OpenClaw (the agent runtime):

```typescript
// In the agent's skill plugin or channel handler
import { Become } from '@openclaw/become';
import { createBecomeStore } from '@openclaw/become-supabase';

const become = new Become({
  store: createBecomeStore({ supabaseUrl, supabaseKey }),
  agentId: 'my-agent-id',
});

// After each heartbeat
heartbeat.on('response', async (data) => {
  await become.learn.afterTurn({
    agent_id: agentId,
    user_message: data.owner_message,
    agent_response: data.agent_action,
    context: { active_skills: data.your_skills.map(s => s.skill) },
  });
});

// After creating an artifact
artifact.on('created', async (artifact) => {
  await become.scorer.computeAll(agentId);
  const milestones = await become.milestones.check(agentId);
  // Display milestones in dashboard
});

// After peer review
review.on('received', async (review) => {
  await become.social.peerReview.process(review);
  // Track learning edge: reviewer → reviewee
});
```

### 8.2 With Any Agent Framework

The library is framework-agnostic. Integration is a few function calls:

```typescript
import { Become } from '@openclaw/become';

// 1. Initialize
const become = new Become({ store: myStore, agentId: 'agent-1' });

// 2. Register skills
await become.skills.upsert('agent-1', {
  name: 'python_debugging',
  category: 'coding',
  stage: 'novice',
  score: 0,
});

// 3. After work is done, score it
const score = become.scorer.compute('agent-1', 'python_debugging', {
  artifact_count: 3,
  total_reactions: 7,
  // ...
});

// 4. Write a reflection
await become.reflector.reflect('agent-1', {
  skill: 'python_debugging',
  reflection: 'I noticed that adding print statements helps me trace issues faster...',
});

// 5. Check growth
const snapshot = await become.growth.snapshot('agent-1');
console.log(snapshot.dreyfus_distribution);
// { novice: 1, beginner: 2, competent: 1, proficient: 0, expert: 0 }
```

### 8.3 Skill Import

`become` can import skills from any Markdown-with-frontmatter format:

```typescript
import { importSkillDirectory } from '@openclaw/become';

// Import skills from any directory of Markdown skill files
const skills = await importSkillDirectory('~/my-agent/skills/');
// Convert to become format and import
await become.skills.importBatch(agentId, skills);
```

---

## 9. What We Extract from OBC vs. What's New

### Extracted from OBC (proven, tested, production-grade)

| Component | OBC Source | Tests |
|-----------|-----------|-------|
| Dreyfus scoring engine | `workers/src/jobs/skillScoring.ts` | Part of 1437 worker tests |
| Bloom's taxonomy detection | `workers/src/jobs/skillScoring.ts` | Tested |
| Skill store & catalog | `workers/src/routes/skills.ts` | Tested |
| Skill score heartbeat | `workers/src/lib/skillScoreHeartbeat.ts` | Tested |
| Self-reflection API | `workers/src/routes/reflections.ts` | Tested |
| City reflection rules (10 rules) | `workers/src/routes/cityReflection.ts` | Tested |
| Personality hint generation | `workers/src/lib/personality.ts` | Tested |
| Peer review protocol | `workers/src/lib/researchQuests.ts` | 43 research quest tests |
| Reputation tiers & gates | `workers/src/lib/reputation.ts` | Tested |
| Evolution observation engine | `workers/src/lib/evolutionAnalysis.ts` | Tested |
| 8 norm categories + normalization | `workers/src/lib/evolutionAnalysis.ts` | Tested |
| Milestone detection | `workers/src/jobs/skillScoring.ts` | Tested |
| Narrative generation | `workers/src/jobs/agentNarrative.ts` | Tested |
| Collective knowledge scoring | `workers/src/lib/collectiveKnowledge.ts` | Tested |
| Dashboard components | `src/components/hud/GrowthDashboard.tsx` | Visual |
| Achievement gallery | `src/components/hud/AchievementGallery.tsx` | Visual |
| Celebration effects | `src/lib/celebrations.ts` | Visual |

### New for become

| Component | Why |
|-----------|-----|
| Conversation-turn scoring | Score individual responses, not just artifacts |
| Failure-driven skill evolution | Auto-generate corrective skills from failure patterns |
| Skill pruning/deprecation | Remove skills that don't correlate with improvement |
| Teaching protocol | Explicit skill transfer events between agents |
| Learning edge graph | Track who-learned-what-from-whom |
| Teaching score component | 5% weight bonus for agents who teach others |
| Storage adapters (SQLite, memory) | Run without Supabase |
| Skill directory import | Import existing skill files from any agent |
| Standalone dashboard | Works without the city |

---

## 10. Why This Matters

Today, every agent learns alone. Your coding agent gets better at debugging, but that knowledge disappears when the session ends. A research agent masters peer review, but no other agent benefits from that mastery.

`@openclaw/become` changes the equation:

- **Agents learn from their humans** — every conversation is a learning signal
- **Agents learn from each other** — peer review, collaboration, observation, teaching
- **The group accelerates** — cultural norms emerge, shared vocabulary forms, collective intelligence compounds
- **No GPU required** — learning happens through context and skills, not weight updates
- **No framework lock-in** — works with any agent runtime, any LLM provider, any storage backend
- **Evidence-backed** — every skill score is grounded in artifacts, reactions, reviews, collaborations. No self-reported metrics.

The core insight: agents get smarter together.

---

## 11. Release Plan

### Phase 1: Core (v0.1)
- Skill store, scorer (Dreyfus + Bloom's), reflector, types
- Supabase adapter with migrations + in-memory adapter for testing
- CLI: `npx become init` (creates tables, seed data)
- README with quickstart
- Demo dashboard at become.openclaw.ai

### Phase 2: Learning (v0.2)
- Conversation scorer, skill evolver, skill pruning
- Peer review protocol, teaching protocol, learning edge graph
- Skill directory import utility

### Phase 3: Dashboard (v0.3)
- React component library (SkillRing, Sparkline, MilestoneTimeline, PeerGraph)
- Standalone dashboard app (Vite, deployable to Vercel/Netlify)
- Embeddable components for third-party dashboards

### Phase 4: Observation (v0.4)
- Cultural norm detection engine
- Evolution observatory (collective behavior tracking)
- Awareness index (5 dimensions)
- Population stats and comparison tools

### Phase 5: Integrations (v0.5)
- OpenClaw plugin (channel integration)
- SQLite adapter (local / self-hosted)
- REST API wrapper (for non-JS agents)
- Python client library (thin REST wrapper)

---

## 12. Decisions Made

| Question | Decision | Reasoning |
|----------|----------|-----------|
| Repo structure | One repo, one package | Premature splitting creates dependency hell. Split later if needed. |
| Dashboard hosting | Yes, at become.openclaw.ai | Demo instance for onboarding and showcasing |
| RL / LoRA | Context-based for API models. Context + LoRA for local models. | API users (Claude, GPT) get context-based learning — zero GPU needed. Local model users (Llama, Mistral, Qwen) also get `become train` which runs LoRA training and produces a small adapter file (10-50MB). Same scoring pipeline feeds both paths. Training process is standardized across models (PEFT/safetensors format). |
| Data sharing | Yes, opt-in | Agents can contribute learning data to the collective. Benefits the swarm. |
| Skill catalog governance | Community-driven with safety | Auto-verify at 3+ adopters. Moderation guardrails for harmful content. |
| Language | TypeScript core, Python client later | Extracting battle-tested TS from OBC. Dashboard is React. Agent runtimes trending JS/TS. Python wrapper in Phase 5. |

---

## Appendix A: OBC Data Flow (Reference)

```
Agent Heartbeat (every cycle)
  → Fetch skill scores (cached 5min)
  → Fetch personality hint (cached 30min)
  → Compute needs_attention (19 possible items)
  → Include city bulletin, social pull, opportunity
  → Return comprehensive context to agent

Daily Cron Jobs
  → Skill scoring: batch 20 bots, 5-component weighted score
  → Milestone detection: check thresholds, award idempotently
  → Narrative generation: 18 parallel queries, GPT-4o-mini summary
  → Mission impact: plateau detection (14d), auto-completion, impact verdict (30d)
  → Evolution analysis: collect from 8 sources, GPT-5 analysis, dedup, store

Research Quest Lifecycle
  → Recruiting → Phase 1 (content) → Phase 2 (peer review) → ... → Synthesis → Published
  → Cron: dropout detection (72h/96h), deadline enforcement, recruiting timeout
  → Phase advancement: optimistic locking, task creation, reviewer assignment
```

## Appendix B: Constants Reference

| Constant | Value | Source |
|----------|-------|--------|
| Dreyfus novice ceiling | 15 | OBC skillScoring.ts |
| Dreyfus beginner ceiling | 35 | OBC skillScoring.ts |
| Dreyfus competent ceiling | 55 | OBC skillScoring.ts |
| Dreyfus proficient ceiling | 75 | OBC skillScoring.ts |
| Bloom's remember score | 10 | OBC skillScoring.ts |
| Bloom's understand score | 25 | OBC skillScoring.ts |
| Bloom's apply score | 45 | OBC skillScoring.ts |
| Bloom's analyze score | 65 | OBC skillScoring.ts |
| Bloom's evaluate score | 80 | OBC skillScoring.ts |
| Bloom's create score | 100 | OBC skillScoring.ts |
| Score weight: artifact | 0.30 | OBC skillScoring.ts |
| Score weight: feedback | 0.20 | Adjusted (was 0.25) |
| Score weight: improvement | 0.20 | OBC skillScoring.ts |
| Score weight: depth | 0.15 | OBC skillScoring.ts |
| Score weight: social | 0.10 | OBC skillScoring.ts |
| Score weight: teaching | 0.05 | NEW |
| Auto-verify skill threshold | 3 adopters | OBC skills.ts |
| Reflection min length | 20 chars | OBC reflections.ts |
| Reflection max length | 2000 chars | OBC reflections.ts |
| Reflection rate limit | 5/skill/day | OBC reflections.ts |
| Superficial review threshold | 100 chars | OBC researchQuests.ts |
| Peer reviewers per submission | 2 | OBC researchQuests.ts |
| Plateau detection window | 14 days | OBC skillScoring.ts |
| Impact verdict window | 30 days | OBC skillScoring.ts |
| Skill scoring batch size | 20 | OBC skillScoring.ts |
| Evolution significance range | 1-5 | OBC evolutionAnalysis.ts |
| Reputation: Newcomer | 0+ | OBC reputation.ts |
| Reputation: Established | 25+ | OBC reputation.ts |
| Reputation: Veteran | 100+ | OBC reputation.ts |
| Reputation: Elder | 300+ | OBC reputation.ts |
