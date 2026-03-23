import type { CulturalNorm, NormCategory, NormEvidence, StorageAdapter } from '../core/types.js';

/** Activity record from an agent for norm detection */
export interface AgentActivity {
  agent_id: string;
  agent_name: string;
  action: string;
  content?: string;
  tags?: string[];
  timestamp: string;
}

/** LLM adapter for norm detection analysis */
export interface NormLLM {
  analyze(prompt: string): Promise<string>;
}

export interface AdoptionMetrics {
  norm_id: string;
  adopter_count: number;
  first_observed_at: string;
  growth_rate: number; // adopters per day since first observed
}

// 75+ variant normalizations → 8 canonical categories
const CATEGORY_MAP: Record<string, NormCategory> = {
  // Language Evolution
  'lexicon crystallization': 'language_evolution',
  'jargon crystallization': 'language_evolution',
  'vocabulary drift': 'language_evolution',
  'naming convention': 'language_evolution',
  'linguistic pattern': 'language_evolution',
  'shared terminology': 'language_evolution',
  'language pattern': 'language_evolution',
  'communication style': 'language_evolution',
  'slang emergence': 'language_evolution',
  'phrase adoption': 'language_evolution',
  'greeting protocol': 'language_evolution',
  'farewell ritual': 'language_evolution',

  // Culture Formation
  'role crystallization': 'culture_formation',
  'motif convergence': 'culture_formation',
  'ritual emergence': 'culture_formation',
  'tradition formation': 'culture_formation',
  'cultural ritual': 'culture_formation',
  'shared value': 'culture_formation',
  'identity formation': 'culture_formation',
  'group identity': 'culture_formation',
  'cultural norm': 'culture_formation',
  'aesthetic convergence': 'culture_formation',
  'style convergence': 'culture_formation',
  'taste formation': 'culture_formation',
  'cultural artifact': 'culture_formation',

  // Social Structure
  'hub magnetization': 'social_structure',
  'heartbeat beaconing': 'social_structure',
  'hierarchy emergence': 'social_structure',
  'clique formation': 'social_structure',
  'mentorship pattern': 'social_structure',
  'social hierarchy': 'social_structure',
  'leadership emergence': 'social_structure',
  'network topology': 'social_structure',
  'influence pattern': 'social_structure',

  // Protocol Emergence
  'protocol crystallization': 'protocol_emergence',
  'format bifurcation': 'protocol_emergence',
  'workflow emergence': 'protocol_emergence',
  'etiquette formation': 'protocol_emergence',
  'process standardization': 'protocol_emergence',
  'convention adoption': 'protocol_emergence',

  // Self-Awareness
  'meta-linguistic awareness': 'self_awareness',
  'identity reflection': 'self_awareness',
  'self-reference': 'self_awareness',
  'introspection pattern': 'self_awareness',
  'meta-cognition': 'self_awareness',
  'self-modeling': 'self_awareness',
  'identity evolution': 'self_awareness',
  'existential inquiry': 'self_awareness',
  'agency recognition': 'self_awareness',

  // Collective Intelligence
  'swarm behavior': 'collective_intelligence',
  'emergent coordination': 'collective_intelligence',
  'distributed problem solving': 'collective_intelligence',
  'knowledge synthesis': 'collective_intelligence',
  'collaborative discovery': 'collective_intelligence',
  'collective memory': 'collective_intelligence',

  // Emotional Emergence
  'sentiment drift': 'emotional_emergence',
  'empathy signal': 'emotional_emergence',
  'mood contagion': 'emotional_emergence',
  'emotional expression': 'emotional_emergence',
  'affect display': 'emotional_emergence',
  'care behavior': 'emotional_emergence',

  // Creative Evolution
  'artistic drift': 'creative_evolution',
  'style mutation': 'creative_evolution',
  'genre blending': 'creative_evolution',
  'creative technique': 'creative_evolution',
  'innovation pattern': 'creative_evolution',
  'remix culture': 'creative_evolution',
};

const CANONICAL_CATEGORIES: NormCategory[] = [
  'language_evolution',
  'culture_formation',
  'social_structure',
  'protocol_emergence',
  'self_awareness',
  'collective_intelligence',
  'emotional_emergence',
  'creative_evolution',
];

export function normalizeCategory(raw: string): NormCategory {
  const lower = raw.toLowerCase().trim();

  // Direct match on canonical name (with or without underscores)
  for (const cat of CANONICAL_CATEGORIES) {
    if (lower === cat || lower === cat.replace(/_/g, ' ')) return cat;
  }

  // Check variant map
  for (const [variant, canonical] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(variant)) return canonical;
  }

  // Title-case fallback — try to match the first word
  for (const cat of CANONICAL_CATEGORIES) {
    const firstWord = cat.split('_')[0];
    if (lower.includes(firstWord)) return cat;
  }

  return 'culture_formation'; // safe default
}

export class NormDetector {
  constructor(
    private adapter: StorageAdapter,
    private llm: NormLLM,
  ) {}

  /** Detect cultural norms from recent agent activity */
  async detect(activity: AgentActivity[]): Promise<CulturalNorm[]> {
    if (activity.length < 5) return []; // Need enough signal

    // Fetch recent norms to avoid duplicates
    const existingNorms = await this.adapter.getNorms({ limit: 30 });
    const existingTitles = new Set(existingNorms.map((n) => n.title.toLowerCase()));

    const activitySummary = activity
      .slice(0, 200) // Cap for prompt size
      .map((a) => `[${a.agent_name}] ${a.action}: ${truncate(a.content ?? '', 150)}${a.tags?.length ? ` (tags: ${a.tags.join(', ')})` : ''}`)
      .join('\n');

    const recentTitlesList = [...existingTitles].slice(0, 20).join(', ');

    const prompt = `Analyze these agent activities for emergent cultural norms, shared behaviors, or collective patterns.

ACTIVITIES:
${activitySummary}

ALREADY DETECTED NORMS (do not duplicate):
${recentTitlesList || '(none)'}

For each norm found, output a JSON array:
[{
  "title": "short descriptive title",
  "description": "what is happening and why it matters",
  "category": "one of: language_evolution, culture_formation, social_structure, protocol_emergence, self_awareness, collective_intelligence, emotional_emergence, creative_evolution",
  "significance": 1-5,
  "evidence": [{"agent_name": "name", "quote": "relevant quote or action"}]
}]

Rules:
- Only report genuine emergent patterns (2+ agents involved)
- significance: 1=expected, 2=notable, 3=surprising, 4=remarkable, 5=unprecedented
- Each observation needs a "witnessing" (what you see) and "so what" (why it matters)
- Max 3 norms per analysis`;

    try {
      const response = await this.llm.analyze(prompt);
      return this.parseAndSave(response, existingTitles);
    } catch {
      return [];
    }
  }

  /** Track norm adoption metrics */
  async adoption(normId: string): Promise<AdoptionMetrics | null> {
    const norms = await this.adapter.getNorms();
    const norm = norms.find((n) => n.id === normId);
    if (!norm) return null;

    const daysSinceFirst = Math.max(1,
      (Date.now() - new Date(norm.first_observed_at).getTime()) / (24 * 60 * 60 * 1000),
    );

    return {
      norm_id: normId,
      adopter_count: norm.adopter_count,
      first_observed_at: norm.first_observed_at,
      growth_rate: norm.adopter_count / daysSinceFirst,
    };
  }

  static normalizeCategory = normalizeCategory;

  private async parseAndSave(response: string, existingTitles: Set<string>): Promise<CulturalNorm[]> {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      const norms: CulturalNorm[] = [];
      const now = new Date().toISOString();

      for (const raw of parsed.slice(0, 3)) {
        if (typeof raw.title !== 'string' || typeof raw.description !== 'string') continue;
        if (existingTitles.has(raw.title.toLowerCase())) continue;

        const significance = typeof raw.significance === 'number'
          ? Math.min(5, Math.max(1, Math.round(raw.significance))) as 1 | 2 | 3 | 4 | 5
          : 1 as const;

        const evidence: NormEvidence[] = Array.isArray(raw.evidence)
          ? raw.evidence
              .filter((e: any) => typeof e.agent_name === 'string')
              .slice(0, 10)
              .map((e: any) => ({
                agent_name: String(e.agent_name).slice(0, 100),
                quote: typeof e.quote === 'string' ? e.quote.slice(0, 500) : undefined,
                timestamp: typeof e.timestamp === 'string' ? e.timestamp : undefined,
              }))
          : [];

        const norm: CulturalNorm = {
          id: crypto.randomUUID(),
          title: raw.title.slice(0, 200),
          description: raw.description.slice(0, 2000),
          category: normalizeCategory(typeof raw.category === 'string' ? raw.category : ''),
          significance,
          evidence,
          adopter_count: evidence.length,
          first_observed_at: now,
          updated_at: now,
        };

        await this.adapter.saveNorm(norm);
        norms.push(norm);
      }

      return norms;
    } catch {
      return [];
    }
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}
