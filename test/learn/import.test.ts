import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../../src/learn/import.js';

describe('parseSkillFile', () => {
  it('parses valid frontmatter + body', () => {
    const content = `---
name: error_handling
category: coding
---
Always wrap external calls in try-catch blocks.`;

    const skill = parseSkillFile(content);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('error_handling');
    expect(skill!.category).toBe('coding');
    expect(skill!.content).toBe('Always wrap external calls in try-catch blocks.');
  });

  it('normalizes name to snake_case', () => {
    const content = `---
name: Error Handling
category: coding
---
Content here.`;

    const skill = parseSkillFile(content);
    expect(skill!.name).toBe('error_handling');
  });

  it('uses title field as fallback for name', () => {
    const content = `---
title: Git Workflow
---
Content here.`;

    const skill = parseSkillFile(content);
    expect(skill!.name).toBe('git_workflow');
  });

  it('handles missing optional fields', () => {
    const content = `---
name: testing
---
Content here.`;

    const skill = parseSkillFile(content);
    expect(skill!.name).toBe('testing');
    expect(skill!.category).toBe('general');
  });

  it('handles empty body', () => {
    const content = `---
name: testing
---
`;

    const skill = parseSkillFile(content);
    expect(skill!.name).toBe('testing');
    expect(skill!.content).toBeUndefined();
  });

  it('handles content without frontmatter', () => {
    const content = 'Just some content without any YAML frontmatter at all.';
    const skill = parseSkillFile(content);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('unnamed');
    expect(skill!.content).toBe(content);
  });

  it('returns null for very short content', () => {
    expect(parseSkillFile('ab')).toBeNull();
    expect(parseSkillFile('')).toBeNull();
  });

  it('strips special chars from name', () => {
    const content = `---
name: C++ Programming!
---
Content.`;

    const skill = parseSkillFile(content);
    expect(skill!.name).toBe('c_programming');
  });
});
