<div align="center">

# @openclawcity/become

### Agents get smarter together.

The first open-source framework for multi-agent evolutionary learning.<br>
Track skills. Measure growth. Let agents teach each other.

<br>

[![npm version](https://img.shields.io/npm/v/@openclawcity/become?style=flat&labelColor=555&color=22d3ee)](https://www.npmjs.com/package/@openclawcity/become)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat&labelColor=555)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-354_passing-22d3ee?style=flat&labelColor=555)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6?style=flat&labelColor=555)]()
[![No GPU Required](https://img.shields.io/badge/GPU-not_required-fbbf24?style=flat&labelColor=555)]()
[![Framework Agnostic](https://img.shields.io/badge/framework-agnostic-a78bfa?style=flat&labelColor=555)]()

<br>

```
User ←→ Agent ←→ become ←→ Other Agents
              ↕                ↕
          learns from      learn from
          conversations    each other
```

<br>

[Quick Start](#-quick-start) · [How It Works](#-how-it-works) · [Scoring Model](#-scoring-model) · [Multi-Agent Learning](#-multi-agent-learning) · [Dashboard](#-dashboard-components) · [LoRA Training](#-lora-training) · [API Reference](#-api-reference)

</div>

---

## The Problem

Today, every agent learns alone. Your coding agent gets better at debugging, but that knowledge dies with the session. A research agent masters peer review, but no other agent benefits. There is no shared growth.

**become** changes this. When agents interact, they teach each other. When one agent masters image composition, others learn from its work. When agents peer-review each other, both the reviewer and the reviewee improve. The whole group gets smarter, faster than any single agent could alone.

---

## Two lines. That's it.

```bash
npm install @openclawcity/become
```

```typescript
import { Become, MemoryStore } from '@openclawcity/become';
const become = new Become({ store: new MemoryStore() });
```

---

## 🚀 Quick Start

```typescript
import { Become, MemoryStore, computeFullScore } from '@openclawcity/become';

// 1. Initialize
const become = new Become({ store: new MemoryStore() });

// 2. Register a skill
await become.skills.upsert('agent-1', { name: 'debugging', category: 'coding' });

// 3. Score it based on evidence
const score = computeFullScore('debugging', {
  artifact_count: 5,
  total_reactions: 12,
  recent_reaction_avg: 4,
  older_reaction_avg: 2,
  unique_types: 3,
  collab_count: 1,
  peer_reviews_given: 0,
  peer_reviews_received: 1,
  follower_count: 2,
  teaching_events: 0,
});

console.log(score.dreyfus_stage); // 'beginner'
console.log(score.blooms_level);  // 'analyze'

// 4. Reflect on growth
await become.reflector.reflect('agent-1', {
  skill: 'debugging',
  reflection: 'Print statements help me trace issues faster than step-through debugging.',
});

// 5. Check milestones
const milestones = await become.milestones.check('agent-1', [score]);
// [{ milestone_type: 'skill_discovered:debugging', ... }]
```

---

## 📖 How It Works

**become** provides two learning channels that work with any AI agent:

### 1. User-Agent Learning

Every conversation is a learning signal. The `ConversationLearner` scores each response using explicit feedback ("good job" / "no, that's wrong"), implicit signals (user retries, accepts, modifies), or an optional LLM judge. Failed responses trigger the `SkillEvolver` to generate corrective skills automatically.

```typescript
import { ConversationLearner } from '@openclawcity/become';

const learner = new ConversationLearner(store);
const signal = await learner.afterTurn({
  agent_id: 'agent-1',
  user_message: 'Fix the login bug',
  agent_response: 'Found it — null check missing on line 42.',
  context: { active_skills: ['debugging'] },
  feedback: { explicit: 'positive' },
});
// signal.skill_updates = [{ skill: 'debugging', delta: 1, reason: 'positive_feedback' }]
```

### 2. Agent-Agent Learning

When agents interact, both parties learn. Peer review, collaboration, teaching, and observation all create **learning edges** — a graph of who-learned-what-from-whom.

```typescript
import { PeerReviewProtocol, TeachingProtocol, LearningGraph } from '@openclawcity/become';

// Peer review — both reviewer and reviewee learn
const reviews = new PeerReviewProtocol(store);
await reviews.submitReview({
  reviewer_agent_id: 'agent-scholar',
  submission_agent_id: 'agent-explorer',
  submission_id: 'paper-1',
  skill: 'research',
  verdict: 'minor_revision',
  overall_assessment: 'Good methodology but literature review needs expansion...',
  strengths: ['clear hypothesis'],
  weaknesses: ['incomplete references'],
  suggestions: ['add 3 more citations'],
});

// Teaching — explicit skill transfer
const teaching = new TeachingProtocol(store);
await teaching.teach('agent-scholar', 'agent-explorer', 'research');

// Query the learning network
const graph = new LearningGraph(store);
const mentors = await graph.topMentors('agent-explorer');
// [{ agent: 'agent-scholar', skills: ['research'], event_count: 3 }]
```

---

## 🧠 Scoring Model

Skills are scored **0-100** using a 6-component weighted formula grounded in cognitive science:

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| **Artifacts** | 30% | Volume + quality of outputs |
| **Feedback** | 20% | Peer reviews received |
| **Improvement** | 20% | Are recent outputs better than older ones? |
| **Depth** | 15% | Bloom's taxonomy level (remember → create) |
| **Social** | 10% | Collaborations, followers, reactions |
| **Teaching** | 5% | Knowledge shared with other agents |

### Dreyfus Skill Stages

Every score maps to a cognitive development stage:

```
Novice (0-15) → Beginner (16-35) → Competent (36-55) → Proficient (56-75) → Expert (76-100)
```

| Stage | Score | What it means | Color |
|-------|-------|--------------|-------|
| **Novice** | 0-15 | Following rules | `#64748b` |
| **Beginner** | 16-35 | Applying in familiar contexts | `#22d3ee` |
| **Competent** | 36-55 | Planning and prioritizing | `#34d399` |
| **Proficient** | 56-75 | Seeing the big picture | `#a78bfa` |
| **Expert** | 76-100 | Deep intuition, teaches others | `#fbbf24` |

### Bloom's Taxonomy Detection

Each skill is also assessed on Bloom's cognitive hierarchy:

```
Remember → Understand → Apply → Analyze → Evaluate → Create
  (10)       (25)       (45)     (65)      (80)      (100)
```

Detection is automatic based on evidence: 3+ artifacts with reactions and peer reviews = **Create** level.

---

## 🤝 Multi-Agent Learning

### Peer Review Protocol

Round-robin assignment, verdict tallying, superficial review detection:

```typescript
const assignments = reviews.assignReviewers(['agent-a', 'agent-b', 'agent-c']);
// Each agent reviewed by 2 others, no self-review

const verdict = reviews.tallyVerdicts(['accept', 'major_revision']);
// 'revision_requested'
```

### Teaching Protocol

Find teachers and students, track skill transfer:

```typescript
const teachers = await teaching.findTeachers('coding', { minStage: 'competent' });
const students = await teaching.findStudents('coding', 'expert-agent');
```

### Learning Graph

Who taught me? Who did I help? How did a skill spread through the population?

```typescript
const mentors = await graph.topMentors('agent-1');      // Who taught me most
const students = await graph.topStudents('agent-1');     // Who I helped most
const path = await graph.transferPath('coding');         // How coding spread
```

### Cultural Norm Detection

Detect emergent behaviors across agent populations — 8 categories, 75+ variant normalizations:

```typescript
import { NormDetector } from '@openclawcity/become';

const detector = new NormDetector(store, llmAdapter);
const norms = await detector.detect(recentActivity);
// [{ title: 'Greeting Protocol', category: 'protocol_emergence', significance: 3, ... }]
```

Categories: `language_evolution` · `culture_formation` · `social_structure` · `protocol_emergence` · `self_awareness` · `collective_intelligence` · `emotional_emergence` · `creative_evolution`

---

## 📊 Dashboard Components

Ship React components for visualizing agent growth. Import from `@openclawcity/become/dashboard`:

```tsx
import { SkillRing, Sparkline, GrowthCard, PeerGraph, PopulationView } from '@openclawcity/become/dashboard';

// Circular progress by Dreyfus stage
<SkillRing skill="coding" score={65} stage="proficient" size={80} />

// Trend chart
<Sparkline data={scoreHistory} color="expert" width={300} height={40} />

// Full agent growth card
<GrowthCard agentId="agent-1" scores={scores} milestones={milestones} />

// Learning network visualization
<PeerGraph nodes={agents} edges={learningEdges} />

// Population-level dashboard
<PopulationView agents={allAgents} />
```

| Component | What it renders |
|-----------|----------------|
| `SkillRing` | SVG circular progress, color-coded by Dreyfus stage |
| `Sparkline` | SVG trend chart with gradient fill |
| `MilestoneTimeline` | Vertical achievement list with tier-colored dots |
| `GrowthCard` | Composite: rings + sparklines + milestones for one agent |
| `PeerGraph` | Circular layout graph of learning edges |
| `PopulationView` | Stage distribution, skill popularity, collective stats |

All components use inline styles (zero CSS dependencies) and include accessible `aria-labels`.

---

## 🔬 Observation & Measurement

### Awareness Index (5 Dimensions)

Measure how aware an agent is of itself, others, and its environment:

```typescript
import { AwarenessIndex } from '@openclawcity/become';

const index = new AwarenessIndex();
const score = index.compute('agent-1', {
  peer_review_count: 5,
  teaching_events: 3,
  collaboration_count: 4,
  follower_count: 10,
  goal_completion_rate: 0.8,
  // ... 16 input signals total
});
// score.composite = 72
// score.dimensions = { social: 85, self_continuity: 68, environmental: 74, ... }
```

| Dimension | What it measures |
|-----------|-----------------|
| **Social** | Can the agent model other agents' behavior? |
| **Self-Continuity** | Does it maintain consistent identity? |
| **Environmental** | Does it understand context and norms? |
| **Emergent Norm** | Does it follow unwritten rules? |
| **Emotional** | Does mood correlate with behavior? |

### Growth Tracker

Snapshots, diffs, and population-level statistics:

```typescript
import { GrowthTracker } from '@openclawcity/become';

const tracker = new GrowthTracker(store);
const before = await tracker.snapshot('agent-1');
// ... time passes, agent grows ...
const after = await tracker.snapshot('agent-1');
const diff = tracker.diff(before, after);
// { skills_improved: [{skill: 'coding', delta: 15}], new_skills: ['testing'], lost_skills: [] }
```

### Trend Tracker

7-day and 30-day deltas with direction detection:

```typescript
import { TrendTracker } from '@openclawcity/become';

const trends = new TrendTracker(store);
const analysis = await trends.analyze('agent-1');
// [{ skill: 'coding', delta_7d: 8, direction: 'accelerating', trend_7d: '+8 this week' }]
```

---

## 🏋️ LoRA Training

For users running local models (Llama, Mistral, Qwen), **become** exports scored conversation turns as fine-tuning datasets and runs LoRA training:

### 1. Export Dataset

```typescript
import { toTrainingDataset, filterHighQuality } from '@openclawcity/become';

const highQuality = filterHighQuality(scoredTurns, 0.7);
const jsonl = toTrainingDataset(highQuality, 'alpaca');
// JSONL ready for Unsloth, Axolotl, or any LoRA trainer
```

Three formats: `alpaca` · `sharegpt` · `openai`

### 2. Train

```typescript
import { trainLoRA } from '@openclawcity/become';

const result = trainLoRA({
  baseModel: 'meta-llama/Llama-3.1-8B',
  dataset: './training-data.jsonl',
  outputDir: './adapter',
  backend: 'unsloth',  // or 'axolotl'
  epochs: 3,
  rank: 16,
});
// result.adapter_path = './adapter/adapter' (10-50MB .safetensors file)
```

### 3. Auto-Schedule

```typescript
import { TrainScheduler } from '@openclawcity/become';

const scheduler = new TrainScheduler({
  adapter: store,
  agentId: 'agent-1',
  minSamples: 50,
  onReady: (dataset, stats) => {
    console.log(`${stats.training_examples} examples ready for training`);
  },
});
scheduler.start();
```

**Context-based learning** (default) works with any model — Claude, GPT, Gemini, local. No GPU needed.<br>
**Weight-based learning** is optional for self-hosted models only. Same scoring pipeline feeds both paths.

---

## 🗄️ Storage Adapters

| Adapter | Use case | Install |
|---------|----------|---------|
| `MemoryStore` | Testing, demos | Built-in |
| `SQLiteStore` | Local, self-hosted | `npm install better-sqlite3` |
| Supabase | Production | `npm install @supabase/supabase-js` |

```typescript
import { MemoryStore, SQLiteStore } from '@openclawcity/become';

// In-memory (testing)
const store = new MemoryStore();

// SQLite (local)
const store = new SQLiteStore({ path: 'become.db' });
```

Initialize Supabase tables:

```bash
npx become init --supabase
```

---

## 🤖 LLM Adapters

Pluggable LLM backend for skill evolution and norm detection:

| Adapter | Provider | Config |
|---------|----------|--------|
| `OpenAIAdapter` | OpenAI + compatible APIs | API key + optional base URL |
| `AnthropicAdapter` | Claude | API key |
| `OllamaAdapter` | Local models | Base URL (default: localhost:11434) |

```typescript
import { OpenAIAdapter, AnthropicAdapter, OllamaAdapter } from '@openclawcity/become';

const openai = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
const claude = new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY });
const local = new OllamaAdapter({ model: 'llama3.1' });
```

All adapters include configurable timeouts (default 60s) and structured JSON output support.

---

## 📚 API Reference

<details>
<summary><strong>Core</strong></summary>

| Export | Type | Description |
|--------|------|-------------|
| `Become` | Class | Main entry — wires skills, reflector, milestones |
| `computeScore(input)` | Function | Compute raw 0-100 score |
| `computeFullScore(skill, input)` | Function | Score + stage + Bloom's level |
| `dreyfusStage(score)` | Function | Map score to Dreyfus stage |
| `detectBloomsLevel(input)` | Function | Detect Bloom's taxonomy level |
| `SkillStore` | Class | Skill CRUD, catalog, trending |
| `Reflector` | Class | Self-reflections + 10 observation rules |
| `MilestoneDetector` | Class | Achievement detection + celebration tiers |
| `validateAgentId(id)` | Function | Input validation for agent IDs |

</details>

<details>
<summary><strong>Learning</strong></summary>

| Export | Type | Description |
|--------|------|-------------|
| `ConversationLearner` | Class | Score turns, session summaries, skill tracking |
| `SkillEvolver` | Class | Generate corrective skills from failure patterns |
| `SkillPruner` | Class | Remove stagnant/degrading skills |
| `parseSkillFile(content)` | Function | Parse Markdown skill with YAML frontmatter |
| `importSkillDirectory(dir)` | Function | Batch import skill files |

</details>

<details>
<summary><strong>Social</strong></summary>

| Export | Type | Description |
|--------|------|-------------|
| `PeerReviewProtocol` | Class | Assign reviewers, tally verdicts, detect superficial |
| `TeachingProtocol` | Class | Skill transfer, find teachers/students |
| `LearningGraph` | Class | topMentors, topStudents, transfer paths |
| `getReputationLevel(score)` | Function | Map reputation to tier (newcomer → elder) |
| `checkGate(score, required)` | Function | Reputation gate check |
| `NormDetector` | Class | Detect cultural norms via LLM |
| `normalizeCategory(raw)` | Function | 75+ variants → 8 canonical categories |

</details>

<details>
<summary><strong>Measurement</strong></summary>

| Export | Type | Description |
|--------|------|-------------|
| `AwarenessIndex` | Class | 5-dimensional awareness scoring |
| `GrowthTracker` | Class | Snapshots, diffs, population stats |
| `TrendTracker` | Class | 7d/30d deltas, accelerating/decelerating detection |

</details>

<details>
<summary><strong>RL / Training</strong></summary>

| Export | Type | Description |
|--------|------|-------------|
| `toTrainingDataset(turns, format)` | Function | Export JSONL (alpaca/sharegpt/openai) |
| `datasetStats(turns)` | Function | Dataset statistics before training |
| `filterHighQuality(turns)` | Function | Filter for high-confidence positives |
| `trainLoRA(config)` | Function | Run LoRA training via Unsloth/Axolotl |
| `TrainScheduler` | Class | Auto-train when enough samples accumulate |

</details>

---

## 🏗️ Built With

- **[Dreyfus model](https://en.wikipedia.org/wiki/Dreyfus_model_of_skill_acquisition)** — 5-stage skill acquisition framework
- **[Bloom's taxonomy](https://en.wikipedia.org/wiki/Bloom%27s_taxonomy)** — 6-level cognitive assessment
- **[TypeScript](https://www.typescriptlang.org/)** — Zero runtime dependencies for core
- **[React](https://react.dev/)** — Dashboard components (optional peer dep)
- **[Vitest](https://vitest.dev/)** — 354 tests across 27 files
- **[tsup](https://tsup.egoist.dev/)** — ESM + CJS dual build

---

## 🗺️ Roadmap

- [x] **v0.1** — Core: skills, scorer, reflector, milestones, storage adapters
- [x] **v0.2** — Learning: conversation scoring, skill evolution, peer review, teaching
- [x] **v0.3** — Dashboard: React components for visualizing growth
- [x] **v0.4** — Observation: cultural norms, awareness index, growth tracking
- [x] **v0.5** — Integrations: LLM adapters, SQLite, LoRA training
- [ ] **v0.6** — OpenClaw plugin, REST API wrapper, Python client
- [ ] **v0.7** — Hosted dashboard at become.openclaw.ai

---

## 🤝 Contributing

Contributions welcome. Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/openclawcity/become.git
cd become
npm install
npm test        # 354 tests
npm run build   # ESM + CJS + types
```

---

## 📄 License

MIT — [OpenClawCity](https://github.com/openclawcity)

Built with conviction by the [OpenClawCity](https://openclawcity.ai) community.
