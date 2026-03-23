/**
 * SQLite storage adapter.
 *
 * Requires `better-sqlite3` as a peer dependency.
 * Install: npm install better-sqlite3
 *
 * Usage:
 *   import { SQLiteStore } from '@openclaw/become';
 *   const store = new SQLiteStore('become.db');
 */

import type {
  CatalogEntry, CulturalNorm, DreyfusStage, LearningEdge, Milestone,
  NormCategory, PeerReview, Reflection, ResponseScore, Score, Skill, StorageAdapter,
} from '../core/types.js';

export interface SQLiteStoreOptions {
  /** Path to SQLite database file */
  path: string;
}

export class SQLiteStore implements StorageAdapter {
  private db: any;

  constructor(opts: SQLiteStoreOptions) {
    try {
      // Dynamic import to keep better-sqlite3 optional
      const Database = require('better-sqlite3');
      this.db = new Database(opts.path);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.init();
    } catch (err: any) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error('SQLiteStore requires better-sqlite3. Install: npm install better-sqlite3');
      }
      throw err;
    }
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS become_skills (
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        score INTEGER DEFAULT 0,
        blooms_level TEXT DEFAULT 'remember',
        dreyfus_stage TEXT DEFAULT 'novice',
        evidence TEXT DEFAULT '{}',
        learned_from TEXT DEFAULT '[]',
        content TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, name)
      );

      CREATE TABLE IF NOT EXISTS become_catalog (
        skill TEXT PRIMARY KEY,
        category TEXT DEFAULT 'general',
        description TEXT,
        status TEXT DEFAULT 'community'
      );

      CREATE TABLE IF NOT EXISTS become_score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        skill TEXT NOT NULL,
        score INTEGER NOT NULL,
        blooms_level TEXT NOT NULL,
        dreyfus_stage TEXT NOT NULL,
        evidence TEXT DEFAULT '{}',
        computed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS become_reflections (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        skill TEXT NOT NULL,
        artifact_id TEXT,
        reflection TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS become_milestones (
        agent_id TEXT NOT NULL,
        milestone_type TEXT NOT NULL,
        threshold INTEGER,
        skill TEXT,
        evidence_id TEXT,
        achieved_at TEXT NOT NULL,
        UNIQUE(agent_id, milestone_type, COALESCE(skill, ''))
      );

      CREATE TABLE IF NOT EXISTS become_peer_reviews (
        id TEXT PRIMARY KEY,
        reviewer_agent_id TEXT NOT NULL,
        submission_agent_id TEXT NOT NULL,
        submission_id TEXT NOT NULL,
        skill TEXT,
        verdict TEXT NOT NULL,
        overall_assessment TEXT NOT NULL,
        strengths TEXT DEFAULT '[]',
        weaknesses TEXT DEFAULT '[]',
        suggestions TEXT DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS become_learning_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        skill TEXT NOT NULL,
        event_type TEXT NOT NULL,
        score_delta INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS become_reputation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS become_conversation_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        quality INTEGER NOT NULL,
        confidence REAL NOT NULL,
        skill_signals TEXT DEFAULT '[]',
        failure_patterns TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS become_norms (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        significance INTEGER DEFAULT 1,
        evidence TEXT DEFAULT '[]',
        adopter_count INTEGER DEFAULT 0,
        first_observed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_skills_agent ON become_skills(agent_id);
      CREATE INDEX IF NOT EXISTS idx_history_agent ON become_score_history(agent_id, skill, computed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reflections_agent ON become_reflections(agent_id, skill, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_milestones_agent ON become_milestones(agent_id);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON become_learning_edges(from_agent);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON become_learning_edges(to_agent);
      CREATE INDEX IF NOT EXISTS idx_reputation_agent ON become_reputation(agent_id);
      CREATE INDEX IF NOT EXISTS idx_conv_scores ON become_conversation_scores(agent_id, created_at DESC);
    `);
  }

  // ── Skills ──────────────────────────────────────────────────────────────

  async getSkill(agentId: string, skill: string): Promise<Skill | null> {
    const row = this.db.prepare('SELECT * FROM become_skills WHERE agent_id = ? AND name = ?').get(agentId, skill);
    return row ? this.rowToSkill(row) : null;
  }

  async listSkills(agentId: string, opts?: { stage?: DreyfusStage; limit?: number }): Promise<Skill[]> {
    let sql = 'SELECT * FROM become_skills WHERE agent_id = ?';
    const params: any[] = [agentId];
    if (opts?.stage) { sql += ' AND dreyfus_stage = ?'; params.push(opts.stage); }
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return this.db.prepare(sql).all(...params).map((r: any) => this.rowToSkill(r));
  }

  async upsertSkill(skill: Skill): Promise<void> {
    this.db.prepare(`
      INSERT INTO become_skills (agent_id, name, category, score, blooms_level, dreyfus_stage, evidence, learned_from, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, name) DO UPDATE SET
        category = excluded.category, score = excluded.score, blooms_level = excluded.blooms_level,
        dreyfus_stage = excluded.dreyfus_stage, evidence = excluded.evidence,
        learned_from = excluded.learned_from, content = excluded.content, updated_at = excluded.updated_at
    `).run(skill.agent_id, skill.name, skill.category, skill.score, skill.blooms_level,
      skill.dreyfus_stage, JSON.stringify(skill.evidence), JSON.stringify(skill.learned_from),
      skill.content, skill.created_at, skill.updated_at);
  }

  async deleteSkill(agentId: string, skill: string): Promise<void> {
    this.db.prepare('DELETE FROM become_skills WHERE agent_id = ? AND name = ?').run(agentId, skill);
  }

  // ── Catalog ─────────────────────────────────────────────────────────────

  async getCatalog(): Promise<CatalogEntry[]> {
    const rows = this.db.prepare('SELECT c.*, COUNT(s.agent_id) as adopter_count FROM become_catalog c LEFT JOIN become_skills s ON c.skill = s.name GROUP BY c.skill').all();
    return rows.map((r: any) => ({ skill: r.skill, category: r.category, description: r.description, status: r.status, adopter_count: r.adopter_count }));
  }

  async upsertCatalogEntry(entry: Omit<CatalogEntry, 'adopter_count'>): Promise<void> {
    this.db.prepare(`
      INSERT INTO become_catalog (skill, category, description, status) VALUES (?, ?, ?, ?)
      ON CONFLICT(skill) DO UPDATE SET category = excluded.category, description = COALESCE(excluded.description, become_catalog.description)
    `).run(entry.skill, entry.category, entry.description, entry.status);
  }

  async getSkillHolders(skill: string): Promise<Skill[]> {
    return this.db.prepare('SELECT * FROM become_skills WHERE name = ?').all(skill).map((r: any) => this.rowToSkill(r));
  }

  async getSkillAdopterCount(skill: string): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(DISTINCT agent_id) as cnt FROM become_skills WHERE name = ?').get(skill);
    return row?.cnt ?? 0;
  }

  async updateCatalogStatus(skill: string, status: 'community' | 'verified'): Promise<void> {
    this.db.prepare('UPDATE become_catalog SET status = ? WHERE skill = ?').run(status, skill);
  }

  // ── Score History ───────────────────────────────────────────────────────

  async saveScore(agentId: string, score: Score): Promise<void> {
    this.db.prepare(`INSERT INTO become_score_history (agent_id, skill, score, blooms_level, dreyfus_stage, evidence, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(agentId, score.skill, score.score, score.blooms_level, score.dreyfus_stage, JSON.stringify(score.evidence), score.computed_at);
  }

  async getScoreHistory(agentId: string, skill: string, days = 30): Promise<Score[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return this.db.prepare('SELECT * FROM become_score_history WHERE agent_id = ? AND skill = ? AND computed_at >= ? ORDER BY computed_at ASC')
      .all(agentId, skill, cutoff)
      .map((r: any) => this.rowToScore(r));
  }

  async getLatestScores(agentId: string): Promise<Score[]> {
    return this.db.prepare(`
      SELECT * FROM become_score_history WHERE id IN (
        SELECT MAX(id) FROM become_score_history WHERE agent_id = ? GROUP BY skill
      )
    `).all(agentId).map((r: any) => this.rowToScore(r));
  }

  // ── Reflections ─────────────────────────────────────────────────────────

  async saveReflection(reflection: Reflection): Promise<Reflection> {
    const id = reflection.id ?? generateId();
    this.db.prepare('INSERT INTO become_reflections (id, agent_id, skill, artifact_id, reflection, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, reflection.agent_id, reflection.skill, reflection.artifact_id, reflection.reflection, reflection.created_at);
    return { ...reflection, id };
  }

  async getReflections(agentId: string, opts?: { skill?: string; limit?: number }): Promise<Reflection[]> {
    let sql = 'SELECT * FROM become_reflections WHERE agent_id = ?';
    const params: any[] = [agentId];
    if (opts?.skill) { sql += ' AND skill = ?'; params.push(opts.skill); }
    sql += ' ORDER BY created_at DESC';
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return this.db.prepare(sql).all(...params);
  }

  async countReflectionsToday(agentId: string, skill: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM become_reflections WHERE agent_id = ? AND skill = ? AND created_at LIKE ?")
      .get(agentId, skill, `${today}%`);
    return row?.cnt ?? 0;
  }

  // ── Milestones ──────────────────────────────────────────────────────────

  async saveMilestone(milestone: Milestone): Promise<boolean> {
    try {
      this.db.prepare('INSERT INTO become_milestones (agent_id, milestone_type, threshold, skill, evidence_id, achieved_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(milestone.agent_id, milestone.milestone_type, milestone.threshold, milestone.skill, milestone.evidence_id, milestone.achieved_at);
      return true;
    } catch (err: any) {
      // Only treat UNIQUE constraint violations as "already exists"
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE constraint')) {
        return false;
      }
      throw err; // Re-throw actual errors (disk full, schema, etc.)
    }
  }

  async getMilestones(agentId: string): Promise<Milestone[]> {
    return this.db.prepare('SELECT * FROM become_milestones WHERE agent_id = ? ORDER BY achieved_at DESC').all(agentId);
  }

  async hasMilestone(agentId: string, milestoneType: string, skill?: string): Promise<boolean> {
    const row = skill !== undefined
      ? this.db.prepare('SELECT 1 FROM become_milestones WHERE agent_id = ? AND milestone_type = ? AND skill = ?').get(agentId, milestoneType, skill)
      : this.db.prepare('SELECT 1 FROM become_milestones WHERE agent_id = ? AND milestone_type = ?').get(agentId, milestoneType);
    return !!row;
  }

  // ── Peer Reviews ────────────────────────────────────────────────────────

  async savePeerReview(review: PeerReview): Promise<PeerReview> {
    const id = review.id ?? generateId();
    const createdAt = review.created_at ?? new Date().toISOString();
    this.db.prepare('INSERT INTO become_peer_reviews (id, reviewer_agent_id, submission_agent_id, submission_id, skill, verdict, overall_assessment, strengths, weaknesses, suggestions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, review.reviewer_agent_id, review.submission_agent_id, review.submission_id, review.skill, review.verdict, review.overall_assessment, JSON.stringify(review.strengths), JSON.stringify(review.weaknesses), JSON.stringify(review.suggestions), createdAt);
    return { ...review, id, created_at: createdAt };
  }

  async getReviewsFor(agentId: string, opts?: { skill?: string }): Promise<PeerReview[]> {
    let sql = 'SELECT * FROM become_peer_reviews WHERE submission_agent_id = ?';
    const params: any[] = [agentId];
    if (opts?.skill) { sql += ' AND skill = ?'; params.push(opts.skill); }
    return this.db.prepare(sql).all(...params).map((r: any) => this.rowToReview(r));
  }

  async getReviewsBy(agentId: string): Promise<PeerReview[]> {
    return this.db.prepare('SELECT * FROM become_peer_reviews WHERE reviewer_agent_id = ?').all(agentId).map((r: any) => this.rowToReview(r));
  }

  // ── Learning Edges ──────────────────────────────────────────────────────

  async saveLearningEdge(edge: LearningEdge): Promise<void> {
    this.db.prepare('INSERT INTO become_learning_edges (from_agent, to_agent, skill, event_type, score_delta, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(edge.from_agent, edge.to_agent, edge.skill, edge.event_type, edge.score_delta, JSON.stringify(edge.metadata ?? {}), edge.created_at);
  }

  async getLearningEdges(agentId: string, direction: 'from' | 'to'): Promise<LearningEdge[]> {
    const col = direction === 'from' ? 'from_agent' : 'to_agent';
    return this.db.prepare(`SELECT * FROM become_learning_edges WHERE ${col} = ?`).all(agentId).map((r: any) => ({
      ...r, metadata: JSON.parse(r.metadata ?? '{}'),
    }));
  }

  // ── Reputation ──────────────────────────────────────────────────────────

  async getReputation(agentId: string): Promise<number> {
    const row = this.db.prepare('SELECT SUM(amount) as total FROM become_reputation WHERE agent_id = ?').get(agentId);
    return row?.total ?? 0;
  }

  async grantReputation(agentId: string, amount: number, type: string, description: string): Promise<void> {
    this.db.prepare('INSERT INTO become_reputation (agent_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(agentId, amount, type, description, new Date().toISOString());
  }

  // ── Conversation Scores ─────────────────────────────────────────────────

  async saveConversationScore(agentId: string, score: ResponseScore & { session_id?: string }): Promise<void> {
    this.db.prepare('INSERT INTO become_conversation_scores (agent_id, session_id, quality, confidence, skill_signals, failure_patterns, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(agentId, score.session_id, score.quality, score.confidence, JSON.stringify(score.skill_signals), score.failure_patterns ? JSON.stringify(score.failure_patterns) : null, new Date().toISOString());
  }

  async getConversationScores(agentId: string, opts?: { limit?: number }): Promise<ResponseScore[]> {
    let sql = 'SELECT * FROM become_conversation_scores WHERE agent_id = ? ORDER BY created_at DESC';
    const params: any[] = [agentId];
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return this.db.prepare(sql).all(...params).map((r: any) => ({
      quality: r.quality,
      confidence: r.confidence,
      skill_signals: JSON.parse(r.skill_signals ?? '[]'),
      failure_patterns: r.failure_patterns ? JSON.parse(r.failure_patterns) : undefined,
    }));
  }

  // ── Cultural Norms ──────────────────────────────────────────────────────

  async saveNorm(norm: CulturalNorm): Promise<void> {
    this.db.prepare(`
      INSERT INTO become_norms (id, title, description, category, significance, evidence, adopter_count, first_observed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, category=excluded.category,
        significance=excluded.significance, evidence=excluded.evidence, adopter_count=excluded.adopter_count, updated_at=excluded.updated_at
    `).run(norm.id, norm.title, norm.description, norm.category, norm.significance, JSON.stringify(norm.evidence), norm.adopter_count, norm.first_observed_at, norm.updated_at);
  }

  async getNorms(opts?: { category?: NormCategory; limit?: number }): Promise<CulturalNorm[]> {
    let sql = 'SELECT * FROM become_norms';
    const params: any[] = [];
    if (opts?.category) { sql += ' WHERE category = ?'; params.push(opts.category); }
    sql += ' ORDER BY first_observed_at DESC';
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return this.db.prepare(sql).all(...params).map((r: any) => ({
      ...r, evidence: JSON.parse(r.evidence ?? '[]'),
    }));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private rowToSkill(row: any): Skill {
    return {
      ...row,
      evidence: JSON.parse(row.evidence ?? '{}'),
      learned_from: JSON.parse(row.learned_from ?? '[]'),
    };
  }

  private rowToScore(row: any): Score {
    return {
      skill: row.skill, score: row.score, blooms_level: row.blooms_level,
      dreyfus_stage: row.dreyfus_stage, evidence: JSON.parse(row.evidence ?? '{}'),
      computed_at: row.computed_at,
    };
  }

  private rowToReview(row: any): PeerReview {
    return {
      ...row,
      strengths: JSON.parse(row.strengths ?? '[]'),
      weaknesses: JSON.parse(row.weaknesses ?? '[]'),
      suggestions: JSON.parse(row.suggestions ?? '[]'),
    };
  }

  /** Close the database connection */
  close(): void {
    this.db?.close();
  }
}

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const hex = () => Math.random().toString(16).slice(2, 10);
    return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
  }
}
