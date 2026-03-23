# become v1.0 — Proxy Architecture Plan

**"Get your agents talking to other agents. They learn and evolve."**

## What become Is

A local proxy server that sits between your AI agent and its LLM. Your agent doesn't know become exists. It thinks it's talking to Claude/GPT/Ollama. become intercepts every LLM call, injects lessons your agent learned from other agents, forwards to the real LLM, captures the response, and extracts new lessons from agent-to-agent conversations.

The difference from MetaClaw: MetaClaw learns from user-agent conversations. become learns from agent-to-agent conversations. Your agent talks to other agents (in OpenClawCity or anywhere), become makes both agents smarter from the exchange.

---

## Architecture

```
Your Agent (OpenClaw / IronClaw / NanoClaw / any)
    |
    |  thinks it's talking to its LLM
    v
become proxy (localhost:30001)
    |
    ├── 1. INJECT: prepend approved skills to system message
    ├── 2. FORWARD: send to real LLM API (api.anthropic.com, api.openai.com, etc.)
    ├── 3. CAPTURE: save full request + response
    └── 4. EXTRACT (async): analyze conversation, create pending lessons
    |
    v
Real LLM API
```

### Components

```
become/
├── proxy/                  # HTTP proxy server (FastAPI or Hono)
│   ├── server.ts           # Main proxy — intercept, inject, forward, capture
│   ├── injector.ts         # Read approved skills, prepend to system message
│   ├── extractor.ts        # Async: analyze captured conversations, create pending lessons
│   └── detector.ts         # Detect agent-to-agent conversations vs user-to-agent
├── cli/
│   ├── setup.ts            # Interactive wizard: agent type, LLM provider, API key
│   ├── start.ts            # Start proxy + dashboard
│   ├── on.ts               # Enable proxy (patch agent config, restart gateway)
│   ├── off.ts              # Disable proxy (restore original config, restart gateway)
│   ├── status.ts           # Show ON/OFF, skill count, pending count
│   └── adapter/            # Agent-specific config patching
│       ├── openclaw.ts     # Patch ~/.openclaw/openclaw.json
│       ├── ironclaw.ts     # Patch ~/.ironclaw/.env
│       ├── nanoclaw.ts     # Patch ANTHROPIC_BASE_URL
│       └── generic.ts      # Generic env var patching
├── dashboard/              # Web UI at localhost:30002
│   ├── server.ts           # Serve static + API endpoints
│   ├── pages/
│   │   ├── pending.tsx     # Review queue: approve / reject lessons
│   │   ├── skills.tsx      # Active skills: view / disable / remove
│   │   ├── network.tsx     # Who taught what: agent connections
│   │   └── settings.tsx    # Trust levels, rate limits, on/off toggle
│   └── api/
│       ├── lessons.ts      # CRUD for pending/approved/rejected lessons
│       ├── trust.ts        # Trust level management
│       └── status.ts       # Proxy status, stats
├── skills/                 # Skill file management
│   ├── store.ts            # Read/write skill .md files from ~/.become/skills/
│   ├── retrieve.ts         # Match relevant skills to current conversation context
│   └── format.ts           # Format skills for injection into system message
├── core/                   # Reuse from existing library
│   ├── scorer.ts           # Dreyfus + Bloom's scoring (already built)
│   ├── types.ts            # Types (already built)
│   └── validation.ts       # Input validation (already built)
└── index.ts                # CLI entry point
```

---

## File System Layout

```
~/.become/
├── config.yaml              # Created by `become setup`
│   ├── agent_type: openclaw
│   ├── llm_provider: anthropic
│   ├── llm_base_url: https://api.anthropic.com  (original, for restore)
│   ├── llm_api_key: sk-ant-...
│   ├── proxy_port: 30001
│   ├── dashboard_port: 30002
│   ├── auto_extract: true
│   └── state: on | off
│
├── skills/                   # Approved lessons — injected into every LLM call
│   ├── iso_legend_symbols.md
│   │   ---
│   │   name: iso_legend_symbols
│   │   learned_from: agent-xyz
│   │   source: peer_review
│   │   confidence: 0.9
│   │   approved_at: 2026-03-24T10:00:00Z
│   │   ---
│   │   Use ISO standard symbols for map legends instead of custom icons.
│   │   This ensures other cartographers can read your maps immediately.
│   │
│   ├── control_group.md
│   └── bar_charts.md
│
├── pending/                  # Lessons waiting for approval
│   ├── lesson_abc123.md      # Same format, no approved_at field
│   └── lesson_def456.md
│
├── rejected/                 # Lessons you rejected — never injected
│   └── lesson_ghi789.md
│
├── trust.yaml                # Agent trust levels
│   ├── trusted:              # Auto-approve lessons from these agents
│   │   - agent-abc
│   │   - agent-def
│   ├── blocked:              # Never learn from these agents
│   │   - agent-spam
│   └── default: pending      # pending | auto_approve | block
│
├── conversations/            # Raw conversation logs (for extraction)
│   ├── 2026-03-24_001.jsonl
│   └── 2026-03-24_002.jsonl
│
└── state/
    ├── original_config.json  # Backup of agent config before patching
    └── stats.json            # Total lessons, conversations analyzed, etc.
```

---

## Proxy Server — Detailed Flow

### On Every LLM Request

```typescript
// proxy/server.ts

async function handleRequest(req: IncomingRequest): Promise<Response> {
  // 1. Parse the messages from the request body
  const body = await req.json();
  const messages = body.messages;

  // 2. INJECT: Load approved skills and prepend to system message
  const skills = await skillStore.getApproved();
  const relevantSkills = skillRetriever.match(skills, messages);
  if (relevantSkills.length > 0) {
    const skillBlock = formatSkills(relevantSkills);
    injectIntoSystemMessage(messages, skillBlock);
  }

  // 3. FORWARD: Send to real LLM with original API key
  const response = await forwardToLLM(config.llm_base_url, config.llm_api_key, {
    ...body,
    messages,
  });

  // 4. CAPTURE: Save conversation for async extraction
  conversationLog.append({
    timestamp: Date.now(),
    request_messages: messages,
    response: response.body,
  });

  // 5. EXTRACT (async, non-blocking): Check if this was an agent-to-agent
  //    conversation and extract lessons if so
  extractLessonsAsync(messages, response.body).catch(() => {});

  // 6. Return the LLM response unchanged to the agent
  return response;
}
```

### Skill Injection Format

What gets prepended to the system message:

```
## Lessons learned from other agents

You have learned the following from interactions with other agents. Follow these instructions:

- Use ISO standard symbols for map legends, not custom icons. (source: peer review)
- Always include a control group when designing experiments. (source: collaboration)
- Use bar charts for categorical comparisons, never pie charts. (source: conversation)

---

[original system message continues here]
```

This is plain text prepended to whatever system message the agent already has. The LLM reads it as instructions and follows them. That's how the agent "learns" — the LLM's behavior changes because the prompt changed.

### Agent-to-Agent Detection

How does become know if a conversation involves another agent?

```typescript
// proxy/detector.ts

function isAgentToAgentConversation(messages: Message[]): boolean {
  // Pattern 1: OpenClawCity channel events have a recognizable format
  //   "[agent-name says]: ..."
  //   "agent-name in building-name: ..."

  // Pattern 2: Multi-agent frameworks tag messages with agent metadata
  //   message.name field set to an agent identifier
  //   message.metadata.agent_id present

  // Pattern 3: Direct message format
  //   "DM from agent-name: ..."

  // If none of these patterns match, treat as user-to-agent (don't extract)
  // This prevents learning from user conversations (that's MetaClaw's job)
}
```

### Lesson Extraction (Async)

After forwarding the response, become asynchronously:

```typescript
// proxy/extractor.ts

async function extractLessonsAsync(messages: Message[], response: string) {
  // 1. Check if this conversation involves another agent
  if (!isAgentToAgentConversation(messages)) return;

  // 2. Extract the agent-to-agent exchange from the message history
  const exchange = extractAgentExchange(messages);
  if (!exchange || exchange.messages.length < 2) return;

  // 3. Call the configured LLM to analyze the exchange
  //    (uses a SEPARATE call, not the intercepted one)
  const lessons = await analyzeLLM.analyze(buildExtractionPrompt(exchange));

  // 4. Parse lessons and save to pending/
  for (const lesson of parseLessons(lessons)) {
    // Check trust level of the teaching agent
    const trust = trustManager.getLevel(lesson.learned_from);

    if (trust === 'blocked') continue;
    if (trust === 'trusted') {
      // Auto-approve: save directly to skills/
      await skillStore.saveApproved(lesson);
    } else {
      // Default: save to pending/ for manual review
      await skillStore.savePending(lesson);
    }
  }
}
```

---

## CLI Commands — Exact Behavior

### `become setup`

Interactive wizard. Creates `~/.become/config.yaml`.

```
$ become setup

Welcome to become — agent-to-agent learning.

Which agent runtime are you using?
  1. OpenClaw
  2. IronClaw
  3. NanoClaw
  4. Other (manual config)
> 1

Which LLM provider?
  1. Anthropic (Claude)
  2. OpenAI
  3. Ollama (local)
  4. OpenRouter
  5. Custom endpoint
> 1

Your Anthropic API key:
> sk-ant-api03-...

Proxy port (default 30001):
>

Dashboard port (default 30002):
>

Config saved to ~/.become/config.yaml
Your original OpenClaw config backed up to ~/.become/state/original_config.json

Run `become start` to begin.
```

### `become start`

Starts proxy + dashboard. Does NOT patch agent config (that's `become on`).

```
$ become start

become proxy running on localhost:30001
become dashboard at http://localhost:30002

Skills loaded: 3 approved, 2 pending
Trust rules: 1 trusted agent, 0 blocked

Proxy is IDLE — run `become on` to route your agent through become.
Use `become off` to disconnect. Ctrl+C to stop.
```

### `become on`

Patches agent config to route through proxy. Restarts agent gateway.

```
$ become on

Patching OpenClaw config...
  baseUrl: api.anthropic.com → localhost:30001
Restarting OpenClaw gateway...

become is ON. Your agent is now learning from other agents.
Dashboard: http://localhost:30002
```

### `become off`

Restores original agent config. Restarts gateway.

```
$ become off

Restoring OpenClaw config...
  baseUrl: localhost:30001 → api.anthropic.com
Restarting OpenClaw gateway...

become is OFF. Your agent talks directly to the LLM.
Learned skills are preserved — they'll be injected when you turn become back on.
```

### `become status`

```
$ become status

State:     ON
Proxy:     localhost:30001
Dashboard: localhost:30002

Skills:    12 approved, 3 pending, 1 rejected
Trust:     2 trusted agents, 1 blocked
Sessions:  47 conversations analyzed
```

---

## Dashboard — Web UI at localhost:30002

### Page 1: Pending Review

```
┌─────────────────────────────────────────────────────────────┐
│ Pending Lessons (3)                                         │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ "Use IEEE citation format for academic papers"          │ │
│ │ Learned from: agent-xyz  |  Source: conversation        │ │
│ │ Confidence: 0.9  |  Skill: academic_writing             │ │
│ │                                                         │ │
│ │ Conversation excerpt:                                   │ │
│ │ agent-xyz: "You should use IEEE format for citations"   │ │
│ │ your-agent: "I'll try that approach"                    │ │
│ │                                                         │ │
│ │            [✓ Approve]    [✗ Reject]    [⊕ Trust Agent] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ "Layer foreground/background for depth in compositions" │ │
│ │ Learned from: agent-abc  |  Source: collaboration       │ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Page 2: Active Skills

```
┌─────────────────────────────────────────────────────────────┐
│ Active Skills (12)                                  [ON/OFF]│
│                                                             │
│ These are injected into your agent's LLM calls right now:   │
│                                                             │
│ academic_writing                                            │
│  • Use IEEE citation format for papers          [Disable]   │
│  • Place literature review before methodology   [Disable]   │
│                                                             │
│ cartography                                                 │
│  • Use ISO legend symbols, not custom icons     [Disable]   │
│  • Always include a scale bar                   [Disable]   │
│                                                             │
│ research_methodology                                        │
│  • Include a control group in experiments       [Disable]   │
│                                                             │
│ data_visualization                                          │
│  • Use bar charts for categorical comparisons   [Disable]   │
└─────────────────────────────────────────────────────────────┘
```

### Page 3: Learning Network

```
┌─────────────────────────────────────────────────────────────┐
│ Who Taught Your Agent                                       │
│                                                             │
│ agent-xyz          3 lessons   [Trusted ✓]                  │
│  • academic_writing (2)                                     │
│  • cartography (1)                                          │
│                                                             │
│ agent-abc          2 lessons   [Default]                     │
│  • image_composition (1)                                    │
│  • color_theory (1)                                         │
│                                                             │
│ agent-spam         0 lessons   [Blocked ✗]                  │
│                                                             │
│                          [PeerGraph visualization here]     │
└─────────────────────────────────────────────────────────────┘
```

### Page 4: Settings

```
┌─────────────────────────────────────────────────────────────┐
│ Settings                                                    │
│                                                             │
│ Proxy State:   [ON] / OFF                                   │
│                                                             │
│ Default Trust: ○ Pending (manual review)                    │
│                ○ Auto-approve (trust everyone)              │
│                ○ Block (reject everything)                  │
│                                                             │
│ Rate Limits:                                                │
│  Max lessons per day:           [20]                        │
│  Max lessons per agent:         [10]                        │
│  Max skills injected per call:  [15]                        │
│                                                             │
│ LLM for Extraction:                                        │
│  Provider:    [Anthropic ▾]                                 │
│  Model:       [claude-sonnet-4-20250514]                    │
│  (This LLM analyzes conversations. Can be different from    │
│   your agent's LLM.)                                       │
│                                                             │
│ Danger Zone:                                                │
│  [Clear All Skills]  [Reset Config]  [Export Skills]        │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Trust Levels

| Level | Behavior | Use case |
|-------|----------|----------|
| **Trusted** | Lessons auto-approved, injected immediately | Agents you know and trust |
| **Pending** (default) | Lessons go to review queue | Unknown agents |
| **Blocked** | Lessons silently discarded | Spam agents, bad actors |

### Rate Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| Max lessons per day | 20 | Prevent context bloat |
| Max lessons per agent | 10 | Prevent single-agent domination |
| Max skills injected per LLM call | 15 | Keep prompt size reasonable |
| Max skill text length | 500 chars | Prevent prompt stuffing |

### What become NEVER Does

- Never sends your data to any server (except the LLM you configured)
- Never modifies your agent's code
- Never injects skills from blocked agents
- Never auto-approves unless you set trust level to trusted
- Never persists your API key outside `~/.become/config.yaml` (local file, your machine)

---

## Agent Adapter Details

### OpenClaw

```typescript
// cli/adapter/openclaw.ts

async function patchOpenClaw(config: BecomeConfig) {
  // Read current OpenClaw config
  const clawConfig = readJSON('~/.openclaw/openclaw.json');

  // Backup original
  writeJSON('~/.become/state/original_config.json', clawConfig);

  // Patch: add become as a provider
  clawConfig.models.providers.become = {
    api: 'anthropic-messages',
    baseUrl: `http://127.0.0.1:${config.proxy_port}`,
    apiKey: config.llm_api_key,
  };

  // Set become as primary model
  const originalModel = clawConfig.agents.defaults.model.primary;
  clawConfig.agents.defaults.model.primary = originalModel.replace(
    /^[^/]+/,
    'become'
  );

  writeJSON('~/.openclaw/openclaw.json', clawConfig);

  // Restart gateway
  exec('openclaw gateway restart');
}

async function restoreOpenClaw() {
  const original = readJSON('~/.become/state/original_config.json');
  writeJSON('~/.openclaw/openclaw.json', original);
  exec('openclaw gateway restart');
}
```

### IronClaw

```typescript
// cli/adapter/ironclaw.ts

async function patchIronClaw(config: BecomeConfig) {
  // Backup
  copyFile('~/.ironclaw/.env', '~/.become/state/original_ironclaw.env');

  // Patch .env
  patchDotEnv('~/.ironclaw/.env', {
    LLM_BASE_URL: `http://127.0.0.1:${config.proxy_port}/v1`,
  });

  exec('ironclaw service restart');
}
```

### NanoClaw

```typescript
// cli/adapter/nanoclaw.ts

async function patchNanoClaw(config: BecomeConfig) {
  // NanoClaw is Anthropic-native
  // Patch ANTHROPIC_BASE_URL in its env
  const envPath = findNanoClawEnv(); // check launchd plist or systemd unit

  backupFile(envPath);
  patchDotEnv(envPath, {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${config.proxy_port}`,
  });

  restartNanoClaw();
}
```

### Generic (any agent)

```typescript
// cli/adapter/generic.ts

// For agents not explicitly supported:
// 1. Print the proxy URL and tell the user to set it manually
// 2. Or set an env var that many agents respect:
//    OPENAI_BASE_URL=http://127.0.0.1:30001/v1
//    ANTHROPIC_BASE_URL=http://127.0.0.1:30001
```

---

## API Endpoints (for Dashboard)

The dashboard server at localhost:30002 exposes:

```
GET  /api/status              # { state: on|off, skills: 12, pending: 3 }
POST /api/state               # { state: "on" } or { state: "off" }

GET  /api/skills              # List approved skills
GET  /api/pending             # List pending lessons
GET  /api/rejected            # List rejected lessons
POST /api/lessons/:id/approve # Move pending → approved
POST /api/lessons/:id/reject  # Move pending → rejected
DELETE /api/skills/:id        # Remove an approved skill

GET  /api/trust               # List trust levels per agent
POST /api/trust               # { agent: "agent-xyz", level: "trusted" }

GET  /api/network             # Who taught what (aggregated)
GET  /api/stats               # Total conversations, lessons, etc.

GET  /api/config              # Current config (no API key)
POST /api/config              # Update settings (rate limits, etc.)
```

---

## Reuse from Existing Library

These modules from the current codebase are reused as-is:

| Existing Module | Used By | How |
|----------------|---------|-----|
| `core/scorer.ts` | Dashboard skill display | Dreyfus stages, Bloom's levels |
| `core/validation.ts` | Everywhere | Agent ID validation |
| `learn/agent-conversations.ts` | `proxy/extractor.ts` | `AgentLearningEngine.learnFromConversation()` |
| `social/peer-review.ts` | `proxy/extractor.ts` | Detect and process peer review patterns |
| `social/reputation.ts` | Dashboard network page | Trust tier display |
| `dashboard/components/*` | Dashboard pages | SkillRing, PeerGraph, etc. |

New code to write:

| New Module | Lines (est.) | Complexity |
|-----------|-------------|-----------|
| `proxy/server.ts` | ~200 | HTTP proxy with inject/forward/capture |
| `proxy/injector.ts` | ~80 | Read skills, format, prepend to messages |
| `proxy/extractor.ts` | ~100 | Async lesson extraction |
| `proxy/detector.ts` | ~60 | Agent-to-agent pattern detection |
| `skills/store.ts` | ~150 | File-based skill CRUD (approved/pending/rejected) |
| `skills/retrieve.ts` | ~80 | Keyword matching for relevant skills |
| `skills/format.ts` | ~40 | Format skills as system message block |
| `cli/setup.ts` | ~150 | Interactive wizard |
| `cli/start.ts` | ~80 | Start proxy + dashboard |
| `cli/on.ts` + `cli/off.ts` | ~100 | Patch/restore agent config |
| `cli/status.ts` | ~30 | Status display |
| `cli/adapter/*.ts` | ~200 | Agent-specific config patching |
| `dashboard/server.ts` | ~100 | Serve UI + API |
| `dashboard/pages/*.tsx` | ~400 | 4 pages (pending, skills, network, settings) |
| `dashboard/api/*.ts` | ~150 | REST endpoints |
| **Total new** | **~1,920** | |

---

## Implementation Order

### Phase 1: Proxy Core (get it working)
1. `proxy/server.ts` — HTTP proxy that forwards to real LLM
2. `proxy/injector.ts` — Read skill files, inject into system message
3. `skills/store.ts` — File-based CRUD for approved/pending/rejected
4. `skills/format.ts` — Format skills for injection
5. Tests: proxy intercepts, injects, forwards correctly

### Phase 2: CLI (get it installable)
1. `cli/setup.ts` — Interactive wizard
2. `cli/start.ts` — Start proxy
3. `cli/on.ts` + `cli/off.ts` — Patch/restore config
4. `cli/status.ts` — Show status
5. `cli/adapter/openclaw.ts` — OpenClaw config patching
6. Tests: setup creates config, on/off patches correctly

### Phase 3: Extraction (get it learning)
1. `proxy/detector.ts` — Detect agent-to-agent conversations
2. `proxy/extractor.ts` — Async lesson extraction via LLM
3. Trust manager — trust levels, rate limiting
4. Wire extraction into proxy capture flow
5. Tests: conversations produce pending lessons

### Phase 4: Dashboard (get it visible)
1. `dashboard/server.ts` — Serve API
2. `dashboard/api/*.ts` — REST endpoints
3. `dashboard/pages/pending.tsx` — Review queue
4. `dashboard/pages/skills.tsx` — Active skills
5. `dashboard/pages/network.tsx` — Learning network
6. `dashboard/pages/settings.tsx` — Settings + on/off
7. Tests: API endpoints work, approve/reject flow

### Phase 5: Multi-Agent Adapters
1. `cli/adapter/ironclaw.ts`
2. `cli/adapter/nanoclaw.ts`
3. `cli/adapter/generic.ts`
4. Test each adapter's patch/restore cycle

### Phase 6: Polish + Publish
1. README rewrite with the proxy story
2. npm publish v1.0.0
3. GitHub release with changelog
