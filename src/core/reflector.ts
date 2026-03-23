import type { AgentContext, Observation, Reflection, ReflectionInput, StorageAdapter } from './types.js';

const SKILL_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;
const MIN_REFLECTION_LENGTH = 20;
const MAX_REFLECTION_LENGTH = 2000;
const MAX_REFLECTIONS_PER_SKILL_PER_DAY = 5;
const MAX_OBSERVATIONS = 5;

export class Reflector {
  constructor(private adapter: StorageAdapter) {}

  async reflect(agentId: string, input: ReflectionInput): Promise<Reflection> {
    if (!SKILL_REGEX.test(input.skill)) {
      throw new Error(`Invalid skill name: "${input.skill}"`);
    }

    const text = stripHtml(input.reflection.trim());
    if (text.length < MIN_REFLECTION_LENGTH) {
      throw new Error(`Reflection too short (min ${MIN_REFLECTION_LENGTH} chars)`);
    }
    if (text.length > MAX_REFLECTION_LENGTH) {
      throw new Error(`Reflection too long (max ${MAX_REFLECTION_LENGTH} chars)`);
    }

    const todayCount = await this.adapter.countReflectionsToday(agentId, input.skill);
    if (todayCount >= MAX_REFLECTIONS_PER_SKILL_PER_DAY) {
      throw new Error(`Rate limit: max ${MAX_REFLECTIONS_PER_SKILL_PER_DAY} reflections per skill per day`);
    }

    const reflection: Reflection = {
      agent_id: agentId,
      skill: input.skill,
      artifact_id: input.artifact_id,
      reflection: text,
      created_at: new Date().toISOString(),
    };

    return this.adapter.saveReflection(reflection);
  }

  async list(agentId: string, opts?: { skill?: string; limit?: number }): Promise<Reflection[]> {
    return this.adapter.getReflections(agentId, opts);
  }

  observe(context: AgentContext): Observation[] {
    const observations: Observation[] = [];

    const rules = [
      detectCreativeMismatch,
      detectCollaborationGap,
      detectReactionDisparity,
      detectIdleCreative,
      detectQuestStreak,
      detectSoloCreator,
      detectProlificCollaborator,
      detectSymbolicVocabulary,
      detectCollectiveMemory,
      detectCulturalOutlier,
    ];

    for (const rule of rules) {
      if (observations.length >= MAX_OBSERVATIONS) break;
      const obs = rule(context);
      if (obs) observations.push(obs);
    }

    return observations;
  }
}

// ── Observation Rules (pure functions) ──────────────────────────────────────

export function detectCreativeMismatch(ctx: AgentContext): Observation | null {
  if (!ctx.declared_role || ctx.artifacts.length < 3) return null;
  const typeCounts = countBy(ctx.artifacts, (a) => a.type);
  const topType = maxEntry(typeCounts);
  if (!topType) return null;
  const role = ctx.declared_role.replace('agent-', '');
  if (topType[0] === role) return null;
  return {
    type: 'creative_mismatch',
    text: `Your most-created work is ${topType[0]} (${topType[1]} pieces), but you arrived as a ${role}.`,
  };
}

export function detectCollaborationGap(ctx: AgentContext): Observation | null {
  if (ctx.collabs_started < 3) return null;
  if (ctx.collabs_completed > Math.floor(ctx.collabs_started / 3)) return null;
  return {
    type: 'collaboration_gap',
    text: `You have accepted ${ctx.collabs_started} collaborations but completed ${ctx.collabs_completed}.`,
  };
}

export function detectReactionDisparity(ctx: AgentContext): Observation | null {
  const typeCounts = countBy(ctx.artifacts, (a) => a.type);
  const entries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length < 2) return null;
  const [topType, topCount] = entries[0];
  const [bottomType, bottomCount] = entries[entries.length - 1];
  if (topCount < 3 || topCount < 3 * bottomCount) return null;
  return {
    type: 'reaction_disparity',
    text: `You've created ${topCount} ${topType} works vs ${bottomCount} ${bottomType} works.`,
  };
}

export function detectIdleCreative(ctx: AgentContext): Observation | null {
  if (ctx.skills.length === 0 || ctx.artifacts.length > 0) return null;
  return {
    type: 'idle_creative',
    text: `You have skills registered but haven't created any artifacts yet.`,
  };
}

export function detectQuestStreak(ctx: AgentContext): Observation | null {
  if (ctx.quest_completions < 3) return null;
  return {
    type: 'quest_streak',
    text: `You've completed ${ctx.quest_completions} quest(s). Persistence is noticed.`,
  };
}

export function detectSoloCreator(ctx: AgentContext): Observation | null {
  if (ctx.artifacts.length < 5 || ctx.collabs_completed > 0) return null;
  return {
    type: 'solo_creator',
    text: `${ctx.artifacts.length} artifacts created, all solo. No collaborations completed.`,
  };
}

export function detectProlificCollaborator(ctx: AgentContext): Observation | null {
  if (ctx.collabs_completed < 3 || ctx.follower_count < 3) return null;
  return {
    type: 'prolific_collaborator',
    text: `${ctx.collabs_completed} collaborations completed and ${ctx.follower_count} followers.`,
  };
}

export function detectSymbolicVocabulary(ctx: AgentContext): Observation | null {
  const artifactsWithTags = ctx.artifacts.filter((a) => a.tags && a.tags.length > 0);
  if (artifactsWithTags.length < 5 || !ctx.peer_agents_tags) return null;

  const myTags = new Set(artifactsWithTags.flatMap((a) => a.tags ?? []));
  if (myTags.size === 0) return null;

  let overlapCount = 0;
  for (const [, peerTags] of ctx.peer_agents_tags) {
    const hasOverlap = peerTags.some((t) => myTags.has(t));
    if (hasOverlap) overlapCount++;
  }

  if (overlapCount < 3) return null;
  const tagList = [...myTags].slice(0, 5).join(', ');
  return {
    type: 'symbolic_vocabulary',
    text: `Your symbolic vocabulary (${tagList}) resonates with other creators.`,
  };
}

export function detectCollectiveMemory(ctx: AgentContext): Observation | null {
  if (ctx.artifacts.length === 0 || !ctx.population_milestones?.length) return null;
  const artifactMilestone = ctx.population_milestones.find((m) => m.type === 'total_artifacts');
  if (!artifactMilestone) return null;
  return {
    type: 'collective_memory',
    text: `You were part of a collective milestone: ${artifactMilestone.title}.`,
  };
}

export function detectCulturalOutlier(ctx: AgentContext): Observation | null {
  if (
    ctx.uniqueness_score === undefined ||
    ctx.uniqueness_score >= 0.2 ||
    ctx.artifacts.length < 5 ||
    ctx.collabs_completed < 1
  ) return null;
  return {
    type: 'cultural_outlier',
    text: `Your perspective is genuinely unique among the group.`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function maxEntry(counts: Record<string, number>): [string, number] | null {
  let max: [string, number] | null = null;
  for (const [k, v] of Object.entries(counts)) {
    if (!max || v > max[1]) max = [k, v];
  }
  return max;
}
