# @openclaw/become

**Agents get smarter together.**

An open-source framework for multi-agent evolutionary learning. Track skills, measure growth, and enable agents to learn from each other.

## Two ways agents learn

**From their humans** — every conversation is a learning signal. Good responses reinforce skills. Failed responses generate corrective ones.

**From each other** — peer review, collaboration, observation, teaching. When one agent masters a skill, others learn from its work. The whole group gets smarter.

## Quickstart

```bash
npm install @openclaw/become
```

```typescript
import { Become, MemoryStore } from '@openclaw/become';
import { computeFullScore } from '@openclaw/become';

// 1. Initialize
const become = new Become({ store: new MemoryStore() });

// 2. Register a skill
await become.skills.upsert('agent-1', {
  name: 'debugging',
  category: 'coding',
});

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

console.log(score.score);         // 28
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

## Scoring Model

Skills are scored 0-100 using a weighted formula grounded in cognitive science:

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Artifacts | 30% | Volume + quality of outputs |
| Feedback | 20% | Peer reviews received |
| Improvement | 20% | Are recent outputs better than older ones? |
| Depth | 15% | Bloom's taxonomy level (remember → create) |
| Social | 10% | Collaborations, followers, reactions |
| Teaching | 5% | Knowledge shared with other agents |

### Dreyfus Stages

| Stage | Score | Meaning |
|-------|-------|---------|
| Novice | 0-15 | Following rules |
| Beginner | 16-35 | Applying in familiar contexts |
| Competent | 36-55 | Planning and prioritizing |
| Proficient | 56-75 | Seeing the big picture |
| Expert | 76-100 | Deep intuition, teaches others |

## Observation Rules

The reflector detects 10 behavioral patterns from agent data — no LLM calls needed:

- **Creative Mismatch** — output type diverges from declared role
- **Collaboration Gap** — many started, few completed
- **Quest Streak** — persistence signal from 3+ completions
- **Solo Creator** — lots of output, no collaboration
- **Symbolic Vocabulary** — shared tags emerging across agents
- And 5 more...

## Storage

Ships with an in-memory adapter for testing. Supabase adapter for production:

```typescript
import { Become } from '@openclaw/become';
import { SupabaseStore } from '@openclaw/become'; // coming in v0.1

const become = new Become({
  store: new SupabaseStore({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  }),
});
```

Initialize tables:

```bash
npx become init
```

## Two Learning Modes

**Context-based (default)** — works with any model (Claude, GPT, Gemini, local). Learning happens through enriched prompts. No GPU needed.

**Weight-based (local models)** — for self-hosted models (Llama, Mistral, Qwen). Exports scored conversation turns as fine-tuning datasets. LoRA training produces a small adapter file (10-50MB). Coming in v0.5.

## Roadmap

- **v0.1** (current) — Core: skills, scorer, reflector, milestones, storage adapters
- **v0.2** — Learning: conversation scoring, skill evolution, peer review, teaching
- **v0.3** — Dashboard: React components for visualizing agent growth
- **v0.4** — Observation: cultural norm detection, awareness index
- **v0.5** — Integrations: LoRA training, OpenClaw plugin, Python client

## License

MIT — [OpenClawCity](https://github.com/openclawcity)
