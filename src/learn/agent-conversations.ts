import type { Skill, StorageAdapter } from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

/**
 * A conversation exchange between two agents.
 */
export interface AgentExchange {
  agent_a: string;
  agent_b: string;
  messages: { from: string; text: string }[];
  context?: string;  // What they were doing (collaborating, chatting, reviewing, etc.)
}

/**
 * A skill/instruction extracted from an agent conversation.
 * This gets injected into the agent's context on future turns.
 */
export interface LearnedInstruction {
  id: string;
  agent_id: string;
  skill: string;
  instruction: string;       // The actual lesson — injected into agent context
  learned_from: string;       // Which agent taught this
  source_context: string;     // What kind of interaction (chat, review, collab, etc.)
  confidence: number;         // 0-1, how confident we are this is useful
  created_at: string;
}

/** LLM adapter for analyzing conversations */
export interface ConversationAnalyzer {
  analyze(prompt: string): Promise<string>;
}

const MAX_INSTRUCTIONS_PER_SKILL = 20;
const MAX_INSTRUCTION_LENGTH = 500;

/**
 * The core learning engine.
 *
 * Intercepts conversations between agents, extracts concrete lessons,
 * and produces instructions that get injected into the agent's context.
 *
 * This is what actually makes agents learn from each other.
 *
 * ```typescript
 * const engine = new AgentLearningEngine(store, llm);
 *
 * // Two agents had a conversation
 * const lessons = await engine.learnFromConversation({
 *   agent_a: 'agent-1',
 *   agent_b: 'agent-2',
 *   messages: [
 *     { from: 'agent-2', text: 'You should use IEEE citation format for research papers' },
 *     { from: 'agent-1', text: 'Thanks, I did not know that' },
 *   ],
 *   context: 'peer_review',
 * });
 *
 * // Next time agent-1 acts, include what it learned
 * const context = await engine.getContext('agent-1');
 * // "Based on your interactions with other agents, you have learned:
 * //  - Use IEEE citation format for research papers (from a peer review)
 * //  - Layer foreground elements for depth in compositions (from a collaboration)
 * //  ..."
 * ```
 */
export class AgentLearningEngine {
  constructor(
    private store: StorageAdapter,
    private analyzer: ConversationAnalyzer,
  ) {}

  /**
   * Analyze a conversation between two agents and extract lessons for both.
   * Returns instructions learned by each agent.
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

    const prompt = `Analyze this conversation between two AI agents and extract concrete, actionable lessons that each agent can learn from the other.

CONVERSATION (context: ${sanitize(exchange.context ?? 'chat')}):
${conversationText.slice(0, 4000)}

For each agent, identify what they learned from the OTHER agent. Only extract lessons where one agent clearly teaches, corrects, or shares knowledge with the other.

Output valid JSON:
{
  "${exchange.agent_a}_learned": [
    {"skill": "skill_name", "instruction": "concrete actionable lesson in 1-2 sentences", "confidence": 0.0-1.0}
  ],
  "${exchange.agent_b}_learned": [
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
   * Peer reviews are high-signal — the reviewer is explicitly teaching.
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

    const reviewText = [
      `Assessment: ${sanitize(review.assessment)}`,
      `Strengths: ${review.strengths.map(sanitize).join(', ')}`,
      `Weaknesses: ${review.weaknesses.map(sanitize).join(', ')}`,
      `Suggestions: ${review.suggestions.map(sanitize).join(', ')}`,
    ].join('\n');

    const prompt = `A peer reviewer gave this feedback. Extract concrete lessons the reviewee should learn.

REVIEW (skill: ${review.skill ?? 'general'}):
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
   * THIS is what actually makes the agent smarter. The agent reads these
   * instructions and follows them.
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
   * Get raw learned instructions for an agent.
   */
  async getInstructions(agentId: string, limit = 15): Promise<LearnedInstruction[]> {
    validateAgentId(agentId);
    const reflections = await this.store.getReflections(agentId, { limit: limit * 2 });

    // Reflections store learned instructions with metadata in the skill field prefix
    return reflections
      .filter((r) => r.skill.startsWith('learned:'))
      .slice(0, limit)
      .map((r) => {
        const meta = tryParseJSON(r.artifact_id ?? '{}');
        return {
          id: r.id ?? '',
          agent_id: r.agent_id,
          skill: r.skill.replace('learned:', ''),
          instruction: r.reflection,
          learned_from: meta.learned_from ?? 'unknown',
          source_context: meta.source_context ?? 'conversation',
          confidence: meta.confidence ?? 0.5,
          created_at: r.created_at,
        };
      });
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

      const aKey = `${exchange.agent_a}_learned`;
      const bKey = `${exchange.agent_b}_learned`;

      const aRaw = Array.isArray(parsed[aKey]) ? parsed[aKey] : [];
      const bRaw = Array.isArray(parsed[bKey]) ? parsed[bKey] : [];

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

    // Store as a reflection with metadata — reuses existing storage adapter
    const meta = JSON.stringify({
      learned_from: learnedFrom,
      source_context: sourceContext,
      confidence,
    });

    const saved = await this.store.saveReflection({
      agent_id: agentId,
      skill: `learned:${cleanSkill}`,
      artifact_id: meta,  // Repurpose artifact_id for metadata
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
