import type { SkillInput } from '../core/types.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * Parse a single Markdown skill file with YAML frontmatter.
 *
 * Expected format:
 * ---
 * name: skill_name
 * category: coding
 * ---
 * Skill content here...
 */
export function parseSkillFile(content: string): SkillInput | null {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    // No frontmatter — try to infer from content
    const trimmed = content.trim();
    if (trimmed.length < 5) return null;
    return { name: 'unnamed', content: trimmed };
  }

  const [, frontmatter, body] = frontmatterMatch;
  const meta: Record<string, string> = {};

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) meta[key] = value;
  }

  const name = meta.name ?? meta.title ?? 'unnamed';
  return {
    name: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, ''),
    category: meta.category ?? meta.type ?? 'general',
    content: body.trim() || undefined,
  };
}

/**
 * Import skills from a directory of Markdown files.
 * Recursively scans for .md files with YAML frontmatter.
 */
export function importSkillDirectory(dir: string): SkillInput[] {
  const skills: SkillInput[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`Cannot read directory: ${dir}`);
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Recurse into subdirectories
      skills.push(...importSkillDirectory(fullPath));
    } else if (extname(entry) === '.md') {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        const skill = parseSkillFile(content);
        if (skill && skill.name !== 'unnamed') {
          skills.push(skill);
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return skills;
}
