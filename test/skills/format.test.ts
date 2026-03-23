import { describe, it, expect } from 'vitest';
import { formatSkillsForInjection, injectSkillsIntoMessages } from '../../src/skills/format.js';
import type { SkillFile } from '../../src/skills/store.js';

const skill = (overrides: Partial<SkillFile> = {}): SkillFile => ({
  id: 'test',
  name: 'test_skill',
  instruction: 'Use active voice.',
  learned_from: 'agent-1',
  source: 'conversation',
  confidence: 0.9,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe('formatSkillsForInjection', () => {
  it('returns empty string for no skills', () => {
    expect(formatSkillsForInjection([])).toBe('');
  });

  it('formats skills as markdown list', () => {
    const result = formatSkillsForInjection([
      skill({ instruction: 'Use IEEE citations.', source: 'peer_review' }),
      skill({ instruction: 'Use bar charts.', source: 'collaboration' }),
    ]);

    expect(result).toContain('## Lessons learned from other agents');
    expect(result).toContain('- Use IEEE citations. (from a peer review)');
    expect(result).toContain('- Use bar charts. (from a collaboration)');
  });

  it('maps source types to labels', () => {
    expect(formatSkillsForInjection([skill({ source: 'teaching' })])).toContain('from being taught');
    expect(formatSkillsForInjection([skill({ source: 'conversation' })])).toContain('from a conversation');
    expect(formatSkillsForInjection([skill({ source: 'peer_review' })])).toContain('from a peer review');
  });
});

describe('injectSkillsIntoMessages', () => {
  it('prepends to existing system message', () => {
    const messages = [
      { role: 'system', content: 'You are an agent.' },
      { role: 'user', content: 'Hello' },
    ];
    injectSkillsIntoMessages(messages, 'SKILLS HERE');
    expect(messages[0].content).toMatch(/^SKILLS HERE\n\n---\n\nYou are an agent\.$/);
  });

  it('creates system message if absent', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
    ];
    injectSkillsIntoMessages(messages, 'SKILLS HERE');
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('SKILLS HERE');
    expect(messages[1].content).toBe('Hello');
  });

  it('does nothing with empty skill text', () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    injectSkillsIntoMessages(messages, '');
    expect(messages).toHaveLength(1);
  });
});
