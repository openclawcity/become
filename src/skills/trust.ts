import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type TrustLevel = 'trusted' | 'pending' | 'blocked';

export interface TrustConfig {
  trusted: string[];
  blocked: string[];
  default: TrustLevel;
}

export interface RateLimits {
  max_lessons_per_day: number;
  max_lessons_per_agent: number;
  max_skills_per_call: number;
}

const DEFAULT_TRUST: TrustConfig = {
  trusted: [],
  blocked: [],
  default: 'pending',
};

const DEFAULT_RATE_LIMITS: RateLimits = {
  max_lessons_per_day: 20,
  max_lessons_per_agent: 10,
  max_skills_per_call: 15,
};

export class TrustManager {
  private trustPath: string;
  private statsPath: string;
  private config: TrustConfig;
  private dailyCounts: { date: string; total: number; perAgent: Record<string, number> };

  constructor(baseDir: string) {
    this.trustPath = join(baseDir, 'trust.json');
    this.statsPath = join(baseDir, 'state', 'daily_counts.json');
    mkdirSync(join(baseDir, 'state'), { recursive: true });
    this.config = this.loadTrust();
    this.dailyCounts = this.loadDailyCounts();
  }

  getLevel(agentId: string): TrustLevel {
    if (this.config.trusted.includes(agentId)) return 'trusted';
    if (this.config.blocked.includes(agentId)) return 'blocked';
    return this.config.default;
  }

  setLevel(agentId: string, level: TrustLevel): void {
    // Remove from all lists first
    this.config.trusted = this.config.trusted.filter((a) => a !== agentId);
    this.config.blocked = this.config.blocked.filter((a) => a !== agentId);

    if (level === 'trusted') this.config.trusted.push(agentId);
    if (level === 'blocked') this.config.blocked.push(agentId);

    this.saveTrust();
  }

  setDefault(level: TrustLevel): void {
    this.config.default = level;
    this.saveTrust();
  }

  getConfig(): TrustConfig {
    return { ...this.config };
  }

  // ── Rate Limiting ───────────────────────────────────────────────────────

  canLearn(agentId: string, limits: RateLimits = DEFAULT_RATE_LIMITS): boolean {
    this.refreshDailyCountsIfNewDay();

    if (this.dailyCounts.total >= limits.max_lessons_per_day) return false;
    const agentCount = this.dailyCounts.perAgent[agentId] ?? 0;
    if (agentCount >= limits.max_lessons_per_agent) return false;

    return true;
  }

  recordLesson(agentId: string): void {
    this.refreshDailyCountsIfNewDay();
    this.dailyCounts.total++;
    this.dailyCounts.perAgent[agentId] = (this.dailyCounts.perAgent[agentId] ?? 0) + 1;
    this.saveDailyCounts();
  }

  getDailyCounts(): { total: number; perAgent: Record<string, number> } {
    this.refreshDailyCountsIfNewDay();
    return { total: this.dailyCounts.total, perAgent: { ...this.dailyCounts.perAgent } };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private loadTrust(): TrustConfig {
    if (!existsSync(this.trustPath)) return { ...DEFAULT_TRUST, trusted: [], blocked: [] };
    try {
      const raw = JSON.parse(readFileSync(this.trustPath, 'utf-8'));
      // Validate shape — arrays must be arrays, default must be valid
      return {
        trusted: Array.isArray(raw.trusted) ? raw.trusted.filter((a: unknown) => typeof a === 'string') : [],
        blocked: Array.isArray(raw.blocked) ? raw.blocked.filter((a: unknown) => typeof a === 'string') : [],
        default: ['trusted', 'pending', 'blocked'].includes(raw.default) ? raw.default : 'pending',
      };
    } catch {
      return { ...DEFAULT_TRUST, trusted: [], blocked: [] };
    }
  }

  private saveTrust(): void {
    mkdirSync(dirname(this.trustPath), { recursive: true });
    writeFileSync(this.trustPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  private loadDailyCounts(): { date: string; total: number; perAgent: Record<string, number> } {
    const today = new Date().toISOString().slice(0, 10);
    if (!existsSync(this.statsPath)) return { date: today, total: 0, perAgent: {} };
    try {
      const data = JSON.parse(readFileSync(this.statsPath, 'utf-8'));
      if (data.date !== today) return { date: today, total: 0, perAgent: {} };
      return data;
    } catch {
      return { date: today, total: 0, perAgent: {} };
    }
  }

  private saveDailyCounts(): void {
    writeFileSync(this.statsPath, JSON.stringify(this.dailyCounts, null, 2), 'utf-8');
  }

  private refreshDailyCountsIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyCounts.date !== today) {
      this.dailyCounts = { date: today, total: 0, perAgent: {} };
    }
  }
}
