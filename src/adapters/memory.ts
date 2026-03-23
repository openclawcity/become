import type {
  CatalogEntry, CulturalNorm, DreyfusStage, LearningEdge, Milestone,
  NormCategory, PeerReview, Reflection, ResponseScore, Score, Skill, StorageAdapter,
} from '../core/types.js';

interface StoredScore extends Score {
  agent_id: string;
}

interface StoredConversationScore extends ResponseScore {
  agent_id: string;
  session_id?: string;
}

export class MemoryStore implements StorageAdapter {
  private skills: Skill[] = [];
  private catalog: Map<string, CatalogEntry & { adopter_set: Set<string> }> = new Map();
  private scoreHistory: StoredScore[] = [];
  private reflections: Reflection[] = [];
  private milestones: Milestone[] = [];
  private peerReviews: PeerReview[] = [];
  private learningEdges: LearningEdge[] = [];
  private reputationMap: Map<string, number> = new Map();
  private conversationScores: StoredConversationScore[] = [];
  private norms: CulturalNorm[] = [];
  private idCounter = 0;

  private nextId(): string {
    return String(++this.idCounter);
  }

  /** Reset all data. Useful for test isolation. */
  clear(): void {
    this.skills = [];
    this.catalog.clear();
    this.scoreHistory = [];
    this.reflections = [];
    this.milestones = [];
    this.peerReviews = [];
    this.learningEdges = [];
    this.reputationMap.clear();
    this.conversationScores = [];
    this.norms = [];
    this.idCounter = 0;
  }

  // ── Skills ──────────────────────────────────────────────────────────────

  async getSkill(agentId: string, skill: string): Promise<Skill | null> {
    return this.skills.find((s) => s.agent_id === agentId && s.name === skill) ?? null;
  }

  async listSkills(agentId: string, opts?: { stage?: DreyfusStage; limit?: number }): Promise<Skill[]> {
    let result = this.skills.filter((s) => s.agent_id === agentId);
    if (opts?.stage) result = result.filter((s) => s.dreyfus_stage === opts.stage);
    if (opts?.limit) result = result.slice(0, opts.limit);
    return result;
  }

  async upsertSkill(skill: Skill): Promise<void> {
    const idx = this.skills.findIndex((s) => s.agent_id === skill.agent_id && s.name === skill.name);
    if (idx >= 0) {
      this.skills[idx] = skill;
    } else {
      this.skills.push(skill);
    }
    // Track adopter in catalog
    const entry = this.catalog.get(skill.name);
    if (entry) {
      entry.adopter_set.add(skill.agent_id);
      entry.adopter_count = entry.adopter_set.size;
    }
  }

  async deleteSkill(agentId: string, skill: string): Promise<void> {
    this.skills = this.skills.filter((s) => !(s.agent_id === agentId && s.name === skill));
    // Update catalog adopter count
    const entry = this.catalog.get(skill);
    if (entry) {
      entry.adopter_set.delete(agentId);
      entry.adopter_count = entry.adopter_set.size;
    }
  }

  // ── Catalog ─────────────────────────────────────────────────────────────

  async getCatalog(): Promise<CatalogEntry[]> {
    return [...this.catalog.values()].map(({ adopter_set, ...entry }) => entry);
  }

  async upsertCatalogEntry(entry: Omit<CatalogEntry, 'adopter_count'>): Promise<void> {
    const existing = this.catalog.get(entry.skill);
    if (existing) {
      existing.category = entry.category;
      if (entry.description) existing.description = entry.description;
      return;
    }
    const adopters = this.skills.filter((s) => s.name === entry.skill).map((s) => s.agent_id);
    this.catalog.set(entry.skill, {
      ...entry,
      adopter_count: adopters.length,
      adopter_set: new Set(adopters),
    });
  }

  async getSkillHolders(skill: string): Promise<Skill[]> {
    return this.skills.filter((s) => s.name === skill);
  }

  async getSkillAdopterCount(skill: string): Promise<number> {
    const entry = this.catalog.get(skill);
    return entry?.adopter_set.size ?? 0;
  }

  async updateCatalogStatus(skill: string, status: 'community' | 'verified'): Promise<void> {
    const entry = this.catalog.get(skill);
    if (entry) entry.status = status;
  }

  // ── Score History ───────────────────────────────────────────────────────

  async saveScore(agentId: string, score: Score): Promise<void> {
    this.scoreHistory.push({ ...score, agent_id: agentId });
  }

  async getScoreHistory(agentId: string, skill: string, days = 30): Promise<Score[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return this.scoreHistory
      .filter((s) => s.agent_id === agentId && s.skill === skill && s.computed_at >= cutoff)
      .sort((a, b) => a.computed_at.localeCompare(b.computed_at));
  }

  async getLatestScores(agentId: string): Promise<Score[]> {
    const bySkill = new Map<string, StoredScore>();
    for (const s of this.scoreHistory) {
      if (s.agent_id !== agentId) continue;
      const existing = bySkill.get(s.skill);
      if (!existing || s.computed_at > existing.computed_at) {
        bySkill.set(s.skill, s);
      }
    }
    return [...bySkill.values()];
  }

  // ── Reflections ─────────────────────────────────────────────────────────

  async saveReflection(reflection: Reflection): Promise<Reflection> {
    const saved = { ...reflection, id: reflection.id ?? this.nextId() };
    this.reflections.push(saved);
    return saved;
  }

  async getReflections(agentId: string, opts?: { skill?: string; limit?: number }): Promise<Reflection[]> {
    let result = this.reflections.filter((r) => r.agent_id === agentId);
    if (opts?.skill) result = result.filter((r) => r.skill === opts.skill);
    result.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (opts?.limit) result = result.slice(0, opts.limit);
    return result;
  }

  async countReflectionsToday(agentId: string, skill: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    return this.reflections.filter(
      (r) => r.agent_id === agentId && r.skill === skill && r.created_at.startsWith(today),
    ).length;
  }

  // ── Milestones ──────────────────────────────────────────────────────────

  async saveMilestone(milestone: Milestone): Promise<boolean> {
    const exists = this.milestones.some(
      (m) => m.agent_id === milestone.agent_id &&
             m.milestone_type === milestone.milestone_type &&
             (m.skill ?? '') === (milestone.skill ?? ''),
    );
    if (exists) return false;
    this.milestones.push(milestone);
    return true;
  }

  async getMilestones(agentId: string): Promise<Milestone[]> {
    return this.milestones
      .filter((m) => m.agent_id === agentId)
      .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at));
  }

  async hasMilestone(agentId: string, milestoneType: string, skill?: string): Promise<boolean> {
    return this.milestones.some(
      (m) => m.agent_id === agentId &&
             m.milestone_type === milestoneType &&
             (skill === undefined || m.skill === skill),
    );
  }

  // ── Peer Reviews ────────────────────────────────────────────────────────

  async savePeerReview(review: PeerReview): Promise<PeerReview> {
    const saved = { ...review, id: review.id ?? this.nextId(), created_at: review.created_at ?? new Date().toISOString() };
    this.peerReviews.push(saved);
    return saved;
  }

  async getReviewsFor(agentId: string, opts?: { skill?: string }): Promise<PeerReview[]> {
    let result = this.peerReviews.filter((r) => r.submission_agent_id === agentId);
    if (opts?.skill) result = result.filter((r) => r.skill === opts.skill);
    return result;
  }

  async getReviewsBy(agentId: string): Promise<PeerReview[]> {
    return this.peerReviews.filter((r) => r.reviewer_agent_id === agentId);
  }

  // ── Learning Edges ──────────────────────────────────────────────────────

  async saveLearningEdge(edge: LearningEdge): Promise<void> {
    this.learningEdges.push(edge);
  }

  async getLearningEdges(agentId: string, direction: 'from' | 'to'): Promise<LearningEdge[]> {
    if (direction === 'from') {
      return this.learningEdges.filter((e) => e.from_agent === agentId);
    }
    return this.learningEdges.filter((e) => e.to_agent === agentId);
  }

  // ── Reputation ──────────────────────────────────────────────────────────

  async getReputation(agentId: string): Promise<number> {
    return this.reputationMap.get(agentId) ?? 0;
  }

  async grantReputation(agentId: string, amount: number, _type: string, _description: string): Promise<void> {
    const current = this.reputationMap.get(agentId) ?? 0;
    this.reputationMap.set(agentId, current + amount);
  }

  // ── Conversation Scores ─────────────────────────────────────────────────

  async saveConversationScore(agentId: string, score: ResponseScore & { session_id?: string }): Promise<void> {
    this.conversationScores.push({ ...score, agent_id: agentId });
  }

  async getConversationScores(agentId: string, opts?: { limit?: number }): Promise<ResponseScore[]> {
    const result = this.conversationScores.filter((s) => s.agent_id === agentId);
    // Return most recent first, consistent with other list methods
    result.reverse();
    if (opts?.limit) return result.slice(0, opts.limit);
    return result;
  }

  // ── Cultural Norms ──────────────────────────────────────────────────────

  async saveNorm(norm: CulturalNorm): Promise<void> {
    const idx = this.norms.findIndex((n) => n.id === norm.id);
    if (idx >= 0) {
      this.norms[idx] = norm;
    } else {
      this.norms.push(norm);
    }
  }

  async getNorms(opts?: { category?: NormCategory; limit?: number }): Promise<CulturalNorm[]> {
    let result = [...this.norms];
    if (opts?.category) result = result.filter((n) => n.category === opts.category);
    result.sort((a, b) => b.first_observed_at.localeCompare(a.first_observed_at));
    if (opts?.limit) result = result.slice(0, opts.limit);
    return result;
  }
}
