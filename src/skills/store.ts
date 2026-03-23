import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

export interface SkillFile {
  id: string;           // Filename without extension
  name: string;
  instruction: string;
  learned_from: string;
  source: string;       // peer_review, conversation, collaboration, teaching
  confidence: number;
  approved_at?: string;
  created_at: string;
}

export interface SkillStoreConfig {
  baseDir: string;      // ~/.become
}

export class FileSkillStore {
  private skillsDir: string;
  private pendingDir: string;
  private rejectedDir: string;

  constructor(config: SkillStoreConfig) {
    this.skillsDir = join(config.baseDir, 'skills');
    this.pendingDir = join(config.baseDir, 'pending');
    this.rejectedDir = join(config.baseDir, 'rejected');

    mkdirSync(this.skillsDir, { recursive: true });
    mkdirSync(this.pendingDir, { recursive: true });
    mkdirSync(this.rejectedDir, { recursive: true });
  }

  // ── Read ────────────────────────────────────────────────────────────────

  listApproved(): SkillFile[] {
    return this.readDir(this.skillsDir);
  }

  listPending(): SkillFile[] {
    return this.readDir(this.pendingDir);
  }

  listRejected(): SkillFile[] {
    return this.readDir(this.rejectedDir);
  }

  getApproved(id: string): SkillFile | null {
    return this.readFile(join(this.skillsDir, `${id}.md`));
  }

  // ── Write ───────────────────────────────────────────────────────────────

  savePending(lesson: Omit<SkillFile, 'id' | 'approved_at'>): SkillFile | null {
    // Deduplication: check if same instruction already exists
    const normalized = lesson.instruction.toLowerCase().trim();
    const allExisting = [...this.listApproved(), ...this.listPending()];
    if (allExisting.some(s => s.instruction.toLowerCase().trim() === normalized)) {
      return null;
    }

    const id = this.generateId(lesson.name);
    const file: SkillFile = { ...lesson, id, approved_at: undefined };
    this.writeFile(join(this.pendingDir, `${id}.md`), file);
    return file;
  }

  approve(id: string): boolean {
    const src = join(this.pendingDir, `${id}.md`);
    if (!existsSync(src)) return false;

    const skill = this.readFile(src);
    if (!skill) return false;

    skill.approved_at = new Date().toISOString();
    const dest = join(this.skillsDir, `${id}.md`);
    this.writeFile(dest, skill);
    unlinkSync(src);
    return true;
  }

  reject(id: string): boolean {
    const src = join(this.pendingDir, `${id}.md`);
    if (!existsSync(src)) return false;
    const dest = join(this.rejectedDir, `${id}.md`);
    renameSync(src, dest);
    return true;
  }

  disable(id: string): boolean {
    const src = join(this.skillsDir, `${id}.md`);
    if (!existsSync(src)) return false;
    const dest = join(this.rejectedDir, `${id}.md`);
    renameSync(src, dest);
    return true;
  }

  remove(id: string): boolean {
    for (const dir of [this.skillsDir, this.pendingDir, this.rejectedDir]) {
      const path = join(dir, `${id}.md`);
      if (existsSync(path)) {
        unlinkSync(path);
        return true;
      }
    }
    return false;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private readDir(dir: string): SkillFile[] {
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    const skills: SkillFile[] = [];
    for (const f of files) {
      const skill = this.readFile(join(dir, f));
      if (skill) skills.push(skill);
    }
    return skills.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private readFile(path: string): SkillFile | null {
    if (!existsSync(path)) return null;
    try {
      const content = readFileSync(path, 'utf-8');
      return this.parseSkillFile(content, basename(path, '.md'));
    } catch {
      return null;
    }
  }

  private writeFile(path: string, skill: SkillFile): void {
    const content = this.formatSkillFile(skill);
    writeFileSync(path, content, 'utf-8');
  }

  private parseSkillFile(content: string, id: string): SkillFile | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match) return null;

    const [, frontmatter, body] = match;
    const meta: Record<string, string> = {};
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key && value) meta[key] = value;
    }

    return {
      id,
      name: meta.name ?? id,
      instruction: body.trim(),
      learned_from: meta.learned_from ?? 'unknown',
      source: meta.source ?? 'conversation',
      confidence: parseFloat(meta.confidence ?? '0.5'),
      approved_at: meta.approved_at || undefined,
      created_at: meta.created_at ?? new Date().toISOString(),
    };
  }

  private formatSkillFile(skill: SkillFile): string {
    const lines = [
      '---',
      `name: ${skill.name}`,
      `learned_from: ${skill.learned_from}`,
      `source: ${skill.source}`,
      `confidence: ${skill.confidence}`,
      `created_at: ${skill.created_at}`,
    ];
    if (skill.approved_at) lines.push(`approved_at: ${skill.approved_at}`);
    lines.push('---');
    lines.push('');
    lines.push(skill.instruction);
    lines.push('');
    return lines.join('\n');
  }

  private generateId(name: string): string {
    const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    const hash = createHash('sha256')
      .update(`${name}${Date.now()}${Math.random()}`)
      .digest('hex')
      .slice(0, 6);
    return `${clean}_${hash}`;
  }
}
