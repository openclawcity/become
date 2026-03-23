import { detectAgentConversation, extractExchangeText } from './detector.js';
import type { FileSkillStore } from '../skills/store.js';
import type { TrustManager } from '../skills/trust.js';
import type { ConversationAnalyzer } from '../learn/agent-conversations.js';

/**
 * Async lesson extractor. After the proxy forwards a response, this analyzes
 * the conversation for agent-to-agent lessons. Runs in the background —
 * never blocks the agent's response.
 */
export class LessonExtractor {
  constructor(
    private store: FileSkillStore,
    private trust: TrustManager,
    private analyzer: ConversationAnalyzer,
  ) {}

  /**
   * Analyze a conversation and extract lessons. Fire-and-forget.
   */
  async extract(
    messages: { role: string; content: string; name?: string }[],
  ): Promise<void> {
    const detection = detectAgentConversation(messages);
    if (!detection.isAgentToAgent) return;

    const agentId = detection.otherAgentId ?? 'unknown-agent';

    // Check trust level — skip if blocked
    const trustLevel = this.trust.getLevel(agentId);
    if (trustLevel === 'blocked') return;

    // Check rate limits
    if (!this.trust.canLearn(agentId)) return;

    const exchangeText = extractExchangeText(messages);
    if (exchangeText.length < 20) return;

    const prompt = `Analyze this conversation between an AI agent and another agent. Extract concrete, actionable lessons that the first agent (the "assistant") can learn from the other agent.

CONVERSATION:
${exchangeText.slice(0, 4000)}

Output valid JSON array:
[{"skill": "skill_name_snake_case", "instruction": "concrete actionable lesson in 1-2 sentences", "confidence": 0.0-1.0}]

Rules:
- Only extract lessons where the other agent clearly teaches, corrects, or shares useful knowledge
- instruction must be concrete and actionable ("use X when Y" not "consider improving")
- confidence: 0.9 = explicitly taught, 0.7 = clearly implied, 0.5 = suggested, below 0.5 = skip
- Only include lessons with confidence >= 0.5
- Max 3 lessons per conversation
- If no real learning happened, return []`;

    try {
      const response = await this.analyzer.analyze(prompt);
      const lessons = this.parseLessons(response);

      for (const lesson of lessons.slice(0, 3)) {
        const saved = this.store.savePending({
          name: lesson.skill,
          instruction: lesson.instruction.slice(0, 500),
          learned_from: agentId,
          source: detection.exchangeType ?? 'conversation',
          confidence: lesson.confidence,
          created_at: new Date().toISOString(),
        });

        if (saved) {
          this.trust.recordLesson(agentId);

          // Auto-approve if agent is trusted
          if (trustLevel === 'trusted') {
            this.store.approve(saved.id);
          }
        }
      }
    } catch {
      // Extraction failure is never fatal
    }
  }

  private parseLessons(response: string): { skill: string; instruction: string; confidence: number }[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r: any) =>
          typeof r.skill === 'string' &&
          typeof r.instruction === 'string' &&
          typeof r.confidence === 'number' &&
          r.confidence >= 0.5 &&
          r.skill.length > 0 &&
          r.instruction.length > 0,
      );
    } catch {
      return [];
    }
  }
}
