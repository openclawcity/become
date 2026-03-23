import type { CatalogEntry, DreyfusStage, Score, Skill, SkillInput, SkillTrend, StorageAdapter } from './types.js';
import { computeFullScore, dreyfusStage, nextMilestone, scoreTrend } from './scorer.js';
import { validateAgentId } from './validation.js';

const SKILL_NAME_REGEX = /^[a-z0-9_-]{1,100}$/;
const AUTO_VERIFY_THRESHOLD = 3;

export class SkillStore {
  constructor(private adapter: StorageAdapter) {}

  async get(agentId: string, skill: string): Promise<Skill | null> {
    return this.adapter.getSkill(agentId, skill);
  }

  async list(agentId: string, opts?: { stage?: DreyfusStage; limit?: number }): Promise<Skill[]> {
    return this.adapter.listSkills(agentId, opts);
  }

  async upsert(agentId: string, input: SkillInput): Promise<Skill> {
    validateAgentId(agentId);
    const name = SkillStore.normalizeName(input.name);
    if (!SkillStore.validateName(name)) {
      throw new Error(`Invalid skill name: "${name}". Must match ${SKILL_NAME_REGEX}`);
    }

    const now = new Date().toISOString();
    const existing = await this.adapter.getSkill(agentId, name);

    const skill: Skill = existing
      ? { ...existing, category: input.category ?? existing.category, content: input.content ?? existing.content, updated_at: now }
      : {
          agent_id: agentId,
          name,
          category: input.category ?? 'general',
          score: 0,
          blooms_level: 'remember',
          dreyfus_stage: 'novice',
          evidence: {
            artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
            older_reaction_avg: 0, unique_types: 0, collab_count: 0,
            peer_reviews_given: 0, peer_reviews_received: 0,
            follower_count: 0, teaching_events: 0,
          },
          learned_from: [],
          content: input.content,
          created_at: now,
          updated_at: now,
        };

    await this.adapter.upsertSkill(skill);

    // Auto-discovery: register in catalog if new.
    // Note: upsertCatalogEntry must NOT overwrite status on existing entries
    // to prevent downgrading verified → community.
    await this.adapter.upsertCatalogEntry({
      skill: name,
      category: skill.category ?? 'general',
      description: input.content?.slice(0, 200),
      status: 'community',
    });

    // Auto-verify at threshold
    const adopters = await this.adapter.getSkillAdopterCount(name);
    if (adopters >= AUTO_VERIFY_THRESHOLD) {
      await this.adapter.updateCatalogStatus(name, 'verified');
    }

    return skill;
  }

  async delete(agentId: string, skill: string): Promise<void> {
    return this.adapter.deleteSkill(agentId, skill);
  }

  async catalog(): Promise<CatalogEntry[]> {
    return this.adapter.getCatalog();
  }

  async holders(skill: string): Promise<Skill[]> {
    return this.adapter.getSkillHolders(skill);
  }

  async suggest(agentId: string): Promise<string[]> {
    const owned = await this.adapter.listSkills(agentId);
    const ownedNames = new Set(owned.map((s) => s.name));
    const catalog = await this.adapter.getCatalog();
    return catalog
      .filter((c) => c.status === 'verified' && !ownedNames.has(c.skill))
      .sort((a, b) => b.adopter_count - a.adopter_count)
      .slice(0, 10)
      .map((c) => c.skill);
  }

  async history(agentId: string, skill: string, days = 30): Promise<Score[]> {
    return this.adapter.getScoreHistory(agentId, skill, days);
  }

  async trending(agentId: string, topN = 5): Promise<SkillTrend[]> {
    const scores = await this.adapter.getLatestScores(agentId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const trends: SkillTrend[] = [];
    for (const s of scores) {
      const history = await this.adapter.getScoreHistory(agentId, s.skill, 7);
      const oldScore = history.length > 0 ? history[0].score : null;
      trends.push({
        skill: s.skill,
        score: s.score,
        stage: s.dreyfus_stage,
        trend: scoreTrend(s.score, oldScore),
        next_milestone: nextMilestone(s.dreyfus_stage, s.score),
      });
    }

    // Sort by absolute delta descending
    trends.sort((a, b) => {
      const deltaA = a.trend ? Math.abs(parseInt(a.trend)) : 0;
      const deltaB = b.trend ? Math.abs(parseInt(b.trend)) : 0;
      return deltaB - deltaA;
    });

    return trends.slice(0, topN);
  }

  static normalizeName(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '');
  }

  static validateName(name: string): boolean {
    return SKILL_NAME_REGEX.test(name);
  }
}
