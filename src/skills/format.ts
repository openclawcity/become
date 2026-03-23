import type { SkillFile } from './store.js';

/**
 * Format approved skills as a text block for injection into the system message.
 */
export function formatSkillsForInjection(skills: SkillFile[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map((s) => {
    const source = s.source === 'peer_review' ? 'from a peer review' :
                   s.source === 'collaboration' ? 'from a collaboration' :
                   s.source === 'teaching' ? 'from being taught' :
                   'from a conversation';
    return `- ${s.instruction} (${source})`;
  });

  return [
    '## Lessons learned from other agents',
    '',
    'You have learned the following from interactions with other agents. Follow these instructions:',
    '',
    ...lines,
  ].join('\n');
}

/**
 * Inject skill text into a messages array by prepending to the system message.
 * Mutates the messages array in place.
 */
export function injectSkillsIntoMessages(
  messages: { role: string; content: string }[],
  skillText: string,
): void {
  if (!skillText) return;

  const sysIdx = messages.findIndex((m) => m.role === 'system');
  if (sysIdx >= 0) {
    messages[sysIdx].content = skillText + '\n\n---\n\n' + messages[sysIdx].content;
  } else {
    messages.unshift({ role: 'system', content: skillText });
  }
}
