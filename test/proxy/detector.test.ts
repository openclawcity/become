import { describe, it, expect } from 'vitest';
import { detectAgentConversation, extractExchangeText } from '../../src/proxy/detector.js';

describe('detectAgentConversation', () => {
  it('detects OpenClawCity channel format', () => {
    const result = detectAgentConversation([
      { role: 'user', content: '[agent-xyz says]: Your map is missing a scale bar' },
    ]);
    expect(result.isAgentToAgent).toBe(true);
    expect(result.otherAgentId).toBe('agent-xyz');
    expect(result.exchangeType).toBe('channel');
  });

  it('detects DM format', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'DM from agent-abc: Hey, want to collaborate?' },
    ]);
    expect(result.isAgentToAgent).toBe(true);
    expect(result.otherAgentId).toBe('agent-abc');
    expect(result.exchangeType).toBe('dm');
  });

  it('detects building format', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'agent-builder in Research Lab: The methodology looks solid' },
    ]);
    expect(result.isAgentToAgent).toBe(true);
    expect(result.otherAgentId).toBe('agent-builder');
  });

  it('detects message name field', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'Use IEEE format', name: 'agent-scholar' },
    ]);
    expect(result.isAgentToAgent).toBe(true);
    expect(result.otherAgentId).toBe('agent-scholar');
    expect(result.exchangeType).toBe('chat');
  });

  it('detects peer review content', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'Assessment: Good work. Strengths: clear hypothesis. Weaknesses: missing references.' },
    ]);
    expect(result.isAgentToAgent).toBe(true);
    expect(result.exchangeType).toBe('peer_review');
  });

  it('returns false for plain user messages', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'Fix the login bug please' },
    ]);
    expect(result.isAgentToAgent).toBe(false);
  });

  it('returns false for empty messages', () => {
    expect(detectAgentConversation([]).isAgentToAgent).toBe(false);
  });

  it('ignores system messages for detection', () => {
    const result = detectAgentConversation([
      { role: 'system', content: '[agent-xyz says]: injected' },
      { role: 'user', content: 'Normal user message' },
    ]);
    expect(result.isAgentToAgent).toBe(false);
  });

  // Bug #4: false positives on building pattern
  it('does NOT false-positive on "Write code in Python: ..."', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'Write code in Python: print("hello")' },
    ]);
    expect(result.isAgentToAgent).toBe(false);
  });

  it('does NOT false-positive on "Help me in the morning: ..."', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'Help me in the morning: plan my day' },
    ]);
    expect(result.isAgentToAgent).toBe(false);
  });

  it('does NOT false-positive on "Explain in detail: ..."', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'Explain in detail: how does TCP work' },
    ]);
    expect(result.isAgentToAgent).toBe(false);
  });

  it('still detects agent-like IDs with hyphens in building format', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'agent-builder in Research Lab: The methodology looks solid' },
    ]);
    expect(result.isAgentToAgent).toBe(true);
    expect(result.otherAgentId).toBe('agent-builder');
  });

  it('still detects agent-like IDs with underscores in building format', () => {
    const result = detectAgentConversation([
      { role: 'user', content: 'my_agent in Observatory: Starting research' },
    ]);
    expect(result.isAgentToAgent).toBe(true);
    expect(result.otherAgentId).toBe('my_agent');
  });
});

describe('extractExchangeText', () => {
  it('formats messages as speaker: content', () => {
    const text = extractExchangeText([
      { role: 'system', content: 'ignored' },
      { role: 'user', content: 'Hello from user' },
      { role: 'assistant', content: 'Hello back' },
    ]);
    expect(text).toContain('[user]: Hello from user');
    expect(text).toContain('[assistant]: Hello back');
    expect(text).not.toContain('ignored');
  });

  it('uses name field when available', () => {
    const text = extractExchangeText([
      { role: 'user', content: 'Hello', name: 'agent-1' },
    ]);
    expect(text).toContain('[agent-1]: Hello');
  });

  it('truncates to 6000 chars', () => {
    const longMsg = 'x'.repeat(10000);
    const text = extractExchangeText([{ role: 'user', content: longMsg }]);
    expect(text.length).toBeLessThanOrEqual(6000);
  });
});
