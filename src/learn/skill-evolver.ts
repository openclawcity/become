import type { ConversationTurn, ResponseScore, Skill } from '../core/types.js';

export interface GeneratedSkill {
  name: string;
  category: string;
  content: string;
  source: 'evolved';
  evolved_from: string[];
}

export interface EvolveLLM {
  generate(prompt: string): Promise<string>;
}

const EVOLVE_THRESHOLD = 0.4;
const MAX_FAILURES = 6;
const MAX_SKILLS_PER_EVOLUTION = 3;

export class SkillEvolver {
  constructor(private llm: EvolveLLM) {}

  /** Check if evolution should trigger based on recent scores */
  shouldEvolve(recentScores: ResponseScore[]): boolean {
    if (recentScores.length < 3) return false;
    const positive = recentScores.filter((s) => s.quality === 1).length;
    return (positive / recentScores.length) < EVOLVE_THRESHOLD;
  }

  /** Generate corrective skills from failure patterns */
  async evolve(
    failures: { turn: ConversationTurn; score: ResponseScore }[],
    existingSkills: Skill[],
  ): Promise<GeneratedSkill[]> {
    const limited = failures.slice(0, MAX_FAILURES);
    const existingNames = new Set(existingSkills.map((s) => s.name));

    // Build prompt
    const failureDescriptions = limited.map((f, i) => {
      const patterns = f.score.failure_patterns?.join(', ') ?? 'unknown';
      return `Failure ${i + 1}:\n  User: ${truncate(f.turn.user_message, 200)}\n  Agent: ${truncate(f.turn.agent_response, 200)}\n  Patterns: ${patterns}`;
    }).join('\n\n');

    const existingList = existingSkills
      .slice(0, 20)
      .map((s) => `- ${s.name} (${s.dreyfus_stage})`)
      .join('\n');

    const prompt = `Analyze these failed agent responses and generate 1-${MAX_SKILLS_PER_EVOLUTION} corrective skills.

FAILURES:
${failureDescriptions}

EXISTING SKILLS (do not duplicate):
${existingList || '(none)'}

For each skill, output valid JSON array:
[{"name": "snake_case_name", "category": "category", "content": "Markdown instruction"}]

Rules:
- name must be snake_case, 1-100 chars
- content is a concise instruction (2-5 sentences) the agent should follow
- Do not create skills that already exist
- Max ${MAX_SKILLS_PER_EVOLUTION} skills`;

    try {
      const response = await this.llm.generate(prompt);
      const skills = this.parseResponse(response, existingNames);
      return skills;
    } catch {
      return [];
    }
  }

  private parseResponse(response: string, existingNames: Set<string>): GeneratedSkill[] {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((s: any) =>
          typeof s.name === 'string' &&
          typeof s.content === 'string' &&
          s.name.length > 0 &&
          s.name.length <= 100 &&
          !existingNames.has(s.name),
        )
        .slice(0, MAX_SKILLS_PER_EVOLUTION)
        .map((s: any) => ({
          name: s.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, ''),
          category: typeof s.category === 'string' ? s.category : 'general',
          content: String(s.content).slice(0, 2000),
          source: 'evolved' as const,
          evolved_from: s.failure_patterns ?? [],
        }));
    } catch {
      return [];
    }
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}
