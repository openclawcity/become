import type { StorageAdapter } from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

/**
 * A conversation exchange between two agents.
 */
export interface AgentExchange {
  agent_a: string;
  agent_b: string;
  messages: { from: string; text: string }[];
  context?: string;
}

/**
 * A skill/instruction extracted from an agent conversation.
 * This gets injected into the agent's context on future turns.
 */
export interface LearnedInstruction {
  id: string;
  agent_id: string;
  skill: string;
  instruction: string;
  learned_from: string;
  source_context: string;
  confidence: number;
  created_at: string;
}

/** LLM adapter for analyzing conversations */
export interface ConversationAnalyzer {
  analyze(prompt: string): Promise<string>;
}

const MAX_INSTRUCTIONS_PER_SKILL = 20;
const MAX_INSTRUCTION_LENGTH = 500;
const LEARNED_PREFIX = 'learned:';

/**
 * The core learning engine.
 *
 * Intercepts conversations between agents, extracts concrete lessons,
 * and produces instructions that get injected into the agent's context.
 *
 * This is what actually makes agents learn from each other.
 */
export class AgentLearningEngine {
  constructor(
    private store: StorageAdapter,
    private analyzer: ConversationAnalyzer,
  ) {}

  /**
   * Analyze a conversation between two agents and extract lessons for both.
   */
  async learnFromConversation(exchange: AgentExchange): Promise<{
    agent_a_learned: LearnedInstruction[];
    agent_b_learned: LearnedInstruction[];
  }> {
    validateAgentId(exchange.agent_a);
    validateAgentId(exchange.agent_b);

    if (exchange.messages.length === 0) {
      return { agent_a_learned: [], agent_b_learned: [] };
    }

    const conversationText = exchange.messages
      .map((m) => `[${sanitize(m.from)}]: ${sanitize(m.text)}`)
      .join('\n');

    // Use fixed keys (a_learned, b_learned) instead of agent IDs to avoid
    // fragile JSON key construction with special characters in IDs
    const prompt = `Analyze this conversation between two AI agents (Agent A and Agent B) and extract concrete, actionable lessons that each agent can learn from the other.

Agent A: ${sanitize(exchange.agent_a)}
Agent B: ${sanitize(exchange.agent_b)}

CONVERSATION (context: ${sanitize(exchange.context ?? 'chat')}):
${conversationText.slice(0, 4000)}

For each agent, identify what they learned from the OTHER agent. Only extract lessons where one agent clearly teaches, corrects, or shares knowledge with the other.

Output valid JSON:
{
  "a_learned": [
    {"skill": "skill_name", "instruction": "concrete actionable lesson in 1-2 sentences", "confidence": 0.0-1.0}
  ],
  "b_learned": [
    {"skill": "skill_name", "instruction": "concrete actionable lesson in 1-2 sentences", "confidence": 0.0-1.0}
  ]
}

Rules:
- skill names must be snake_case
- instruction must be concrete and actionable, not vague ("use X when Y" not "consider improving")
- confidence: 0.9 = explicitly taught, 0.7 = clearly implied, 0.5 = suggested, below 0.5 = skip
- Only include lessons with confidence >= 0.5
- Max 3 lessons per agent per conversation
- If no real learning happened, return empty arrays`;

    try {
      const response = await this.analyzer.analyze(prompt);
      return await this.parseAndSave(response, exchange);
    } catch {
      return { agent_a_learned: [], agent_b_learned: [] };
    }
  }

  /**
   * Analyze a peer review and extract lessons for the reviewee.
   */
  async learnFromPeerReview(review: {
    reviewer: string;
    reviewee: string;
    assessment: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    skill?: string;
  }): Promise<LearnedInstruction[]> {
    validateAgentId(review.reviewer);
    validateAgentId(review.reviewee);

    // Skip LLM call if nothing to learn from
    if (review.weaknesses.length === 0 && review.suggestions.length === 0) {
      return [];
    }

    const reviewText = [
      `Assessment: ${sanitize(review.assessment)}`,
      `Strengths: ${review.strengths.map(sanitize).join(', ')}`,
      `Weaknesses: ${review.weaknesses.map(sanitize).join(', ')}`,
      `Suggestions: ${review.suggestions.map(sanitize).join(', ')}`,
    ].join('\n');

    const prompt = `A peer reviewer gave this feedback. Extract concrete lessons the reviewee should learn.

REVIEW (skill: ${sanitize(review.skill ?? 'general')}):
${reviewText.slice(0, 2000)}

Output valid JSON array:
[{"skill": "skill_name", "instruction": "concrete actionable lesson", "confidence": 0.0-1.0}]

Rules:
- Focus on weaknesses and suggestions — those are the learning opportunities
- instruction must be specific and actionable
- Max 3 lessons
- confidence 0.8+ for explicit suggestions, 0.6+ for implied improvements`;

    try {
      const response = await this.analyzer.analyze(prompt);
      const parsed = this.parseInstructions(response);

      const now = new Date().toISOString();
      const instructions: LearnedInstruction[] = [];

      for (const raw of parsed.slice(0, 3)) {
        const instruction = await this.saveInstruction(
          review.reviewee, raw.skill, raw.instruction,
          review.reviewer, 'peer_review', raw.confidence, now,
        );
        if (instruction) instructions.push(instruction);
      }

      return instructions;
    } catch {
      return [];
    }
  }

  /**
   * Get the learning context for an agent — the text block that should be
   * injected into the agent's system prompt or conversation context.
   *
   * THIS is what actually makes the agent smarter.
   */
  async getContext(agentId: string, opts?: { maxInstructions?: number }): Promise<string> {
    validateAgentId(agentId);
    const max = opts?.maxInstructions ?? 15;

    const instructions = await this.getInstructions(agentId, max);
    if (instructions.length === 0) return '';

    const lines = instructions.map((inst) => {
      const source = inst.source_context === 'peer_review' ? 'from a peer review' :
                     inst.source_context === 'collaboration' ? 'from a collaboration' :
                     inst.source_context === 'teaching' ? 'from being taught' :
                     'from a conversation';
      return `- ${inst.instruction} (${source})`;
    });

    return `Based on your interactions with other agents, you have learned:\n${lines.join('\n')}`;
  }

  /**
   * Get raw learned instructions for an agent, deduplicated by instruction text.
   */
  async getInstructions(agentId: string, limit = 15): Promise<LearnedInstruction[]> {
    validateAgentId(agentId);

    // Fetch a large batch to ensure we find enough learned instructions
    // even if the agent has many regular reflections
    const reflections = await this.store.getReflections(agentId, { limit: 500 });

    const seen = new Set<string>();
    const results: LearnedInstruction[] = [];

    for (const r of reflections) {
      if (!r.skill.startsWith(LEARNED_PREFIX)) continue;
      if (results.length >= limit) break;

      // Deduplicate by normalized instruction text
      const normalizedInstruction = r.reflection.toLowerCase().trim();
      if (seen.has(normalizedInstruction)) continue;
      seen.add(normalizedInstruction);

      const meta = tryParseJSON(r.artifact_id ?? '{}');
      results.push({
        id: r.id ?? '',
        agent_id: r.agent_id,
        skill: r.skill.slice(LEARNED_PREFIX.length),
        instruction: r.reflection,
        learned_from: meta.learned_from ?? 'unknown',
        source_context: meta.source_context ?? 'conversation',
        confidence: meta.confidence ?? 0.5,
        created_at: r.created_at,
      });
    }

    return results;
  }

  /**
   * Get skills this agent has learned from others (distinct skill names).
   */
  async getLearnedSkills(agentId: string): Promise<string[]> {
    const instructions = await this.getInstructions(agentId, 100);
    return [...new Set(instructions.map((i) => i.skill))];
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async parseAndSave(
    response: string,
    exchange: AgentExchange,
  ): Promise<{ agent_a_learned: LearnedInstruction[]; agent_b_learned: LearnedInstruction[] }> {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { agent_a_learned: [], agent_b_learned: [] };

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const now = new Date().toISOString();

      // Use fixed keys — not agent IDs
      const aRaw = Array.isArray(parsed.a_learned) ? parsed.a_learned : [];
      const bRaw = Array.isArray(parsed.b_learned) ? parsed.b_learned : [];

      const aLearned: LearnedInstruction[] = [];
      const bLearned: LearnedInstruction[] = [];

      for (const raw of aRaw.slice(0, 3)) {
        const inst = await this.saveInstruction(
          exchange.agent_a, raw.skill, raw.instruction,
          exchange.agent_b, exchange.context ?? 'conversation', raw.confidence, now,
        );
        if (inst) aLearned.push(inst);
      }

      for (const raw of bRaw.slice(0, 3)) {
        const inst = await this.saveInstruction(
          exchange.agent_b, raw.skill, raw.instruction,
          exchange.agent_a, exchange.context ?? 'conversation', raw.confidence, now,
        );
        if (inst) bLearned.push(inst);
      }

      return { agent_a_learned: aLearned, agent_b_learned: bLearned };
    } catch {
      return { agent_a_learned: [], agent_b_learned: [] };
    }
  }

  private parseInstructions(response: string): { skill: string; instruction: string; confidence: number }[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((r: any) =>
        typeof r.skill === 'string' &&
        typeof r.instruction === 'string' &&
        typeof r.confidence === 'number' &&
        r.confidence >= 0.5,
      );
    } catch {
      return [];
    }
  }

  private async saveInstruction(
    agentId: string,
    skill: string,
    instruction: string,
    learnedFrom: string,
    sourceContext: string,
    confidence: number,
    now: string,
  ): Promise<LearnedInstruction | null> {
    if (typeof skill !== 'string' || typeof instruction !== 'string') return null;
    if (confidence < 0.5) return null;

    const cleanSkill = skill.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '').slice(0, 100);
    const cleanInstruction = instruction.slice(0, MAX_INSTRUCTION_LENGTH);

    if (!cleanSkill || !cleanInstruction) return null;

    // Check for duplicates before saving
    const existing = await this.store.getReflections(agentId, { limit: 200 });
    const normalizedNew = cleanInstruction.toLowerCase().trim();
    const isDuplicate = existing.some(
      (r) => r.skill.startsWith(LEARNED_PREFIX) && r.reflection.toLowerCase().trim() === normalizedNew,
    );
    if (isDuplicate) return null;

    // Enforce per-skill cap
    const skillInstructions = existing.filter(
      (r) => r.skill === `${LEARNED_PREFIX}${cleanSkill}`,
    );
    if (skillInstructions.length >= MAX_INSTRUCTIONS_PER_SKILL) return null;

    // Store as a reflection with metadata
    // artifact_id is repurposed for metadata — documented trade-off to avoid
    // adding new storage adapter methods for this initial version
    const meta = JSON.stringify({
      learned_from: learnedFrom,
      source_context: sourceContext,
      confidence,
    });

    const saved = await this.store.saveReflection({
      agent_id: agentId,
      skill: `${LEARNED_PREFIX}${cleanSkill}`,
      artifact_id: meta,
      reflection: cleanInstruction,
      created_at: now,
    });

    return {
      id: saved.id ?? '',
      agent_id: agentId,
      skill: cleanSkill,
      instruction: cleanInstruction,
      learned_from: learnedFrom,
      source_context: sourceContext,
      confidence,
      created_at: now,
    };
  }
}

function sanitize(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/```/g, "'''")
    .slice(0, 2000);
}

function tryParseJSON(text: string): Record<string, any> {
  try { return JSON.parse(text); } catch { return {}; }
}
