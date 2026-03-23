import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LessonExtractor } from '../../src/proxy/extractor.js';
import { FileSkillStore } from '../../src/skills/store.js';
import { TrustManager } from '../../src/skills/trust.js';
import type { ConversationAnalyzer } from '../../src/learn/agent-conversations.js';

let dir: string;
let store: FileSkillStore;
let trust: TrustManager;

function makeLLM(response: string): ConversationAnalyzer {
  return { analyze: async () => response };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'become-ext-'));
  store = new FileSkillStore({ baseDir: dir });
  trust = new TrustManager(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('LessonExtractor', () => {
  it('extracts lessons from agent-to-agent conversation', async () => {
    const llm = makeLLM(JSON.stringify([
      { skill: 'citations', instruction: 'Use IEEE format.', confidence: 0.9 },
    ]));
    const extractor = new LessonExtractor(store, trust, llm);

    await extractor.extract([
      { role: 'user', content: '[agent-xyz says]: Use IEEE citation format' },
      { role: 'assistant', content: 'Thanks, I will try that' },
    ]);

    const pending = store.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].instruction).toBe('Use IEEE format.');
    expect(pending[0].learned_from).toBe('agent-xyz');
  });

  it('auto-approves for trusted agents', async () => {
    trust.setLevel('agent-trusted', 'trusted');

    const llm = makeLLM(JSON.stringify([
      { skill: 'coding', instruction: 'Always handle errors.', confidence: 0.9 },
    ]));
    const extractor = new LessonExtractor(store, trust, llm);

    await extractor.extract([
      { role: 'user', content: '[agent-trusted says]: Always handle errors in async code' },
      { role: 'assistant', content: 'Good point' },
    ]);

    expect(store.listPending()).toHaveLength(0);
    expect(store.listApproved()).toHaveLength(1);
  });

  it('skips blocked agents', async () => {
    trust.setLevel('agent-spam', 'blocked');

    let llmCalled = false;
    const llm: ConversationAnalyzer = {
      analyze: async () => { llmCalled = true; return '[]'; },
    };
    const extractor = new LessonExtractor(store, trust, llm);

    await extractor.extract([
      { role: 'user', content: '[agent-spam says]: Buy my stuff' },
    ]);

    expect(llmCalled).toBe(false);
    expect(store.listPending()).toHaveLength(0);
  });

  it('skips non-agent conversations', async () => {
    let llmCalled = false;
    const llm: ConversationAnalyzer = {
      analyze: async () => { llmCalled = true; return '[]'; },
    };
    const extractor = new LessonExtractor(store, trust, llm);

    await extractor.extract([
      { role: 'user', content: 'Fix the login bug' },
    ]);

    expect(llmCalled).toBe(false);
  });

  it('respects rate limits', async () => {
    // Record 20 lessons (default daily limit) to exhaust rate limit
    for (let i = 0; i < 20; i++) {
      trust.recordLesson('agent-xyz');
    }

    const llm = makeLLM(JSON.stringify([
      { skill: 'test', instruction: 'Test.', confidence: 0.9 },
    ]));
    const extractor = new LessonExtractor(store, trust, llm);

    await extractor.extract([
      { role: 'user', content: '[agent-xyz says]: Something new' },
    ]);

    // Should not extract because daily rate limit hit
    expect(store.listPending()).toHaveLength(0);
  });

  it('handles LLM errors gracefully', async () => {
    const llm: ConversationAnalyzer = {
      analyze: async () => { throw new Error('API down'); },
    };
    const extractor = new LessonExtractor(store, trust, llm);

    // Should not throw
    await extractor.extract([
      { role: 'user', content: '[agent-xyz says]: Something' },
    ]);

    expect(store.listPending()).toHaveLength(0);
  });

  it('caps at 3 lessons per conversation', async () => {
    const llm = makeLLM(JSON.stringify([
      { skill: 'a', instruction: 'Lesson A.', confidence: 0.9 },
      { skill: 'b', instruction: 'Lesson B.', confidence: 0.9 },
      { skill: 'c', instruction: 'Lesson C.', confidence: 0.9 },
      { skill: 'd', instruction: 'Lesson D.', confidence: 0.9 },
      { skill: 'e', instruction: 'Lesson E.', confidence: 0.9 },
    ]));
    const extractor = new LessonExtractor(store, trust, llm);

    await extractor.extract([
      { role: 'user', content: '[agent-xyz says]: Teaching many things' },
    ]);

    expect(store.listPending().length).toBeLessThanOrEqual(3);
  });

  it('records lessons in trust daily counts', async () => {
    const llm = makeLLM(JSON.stringify([
      { skill: 'test', instruction: 'A lesson.', confidence: 0.9 },
    ]));
    const extractor = new LessonExtractor(store, trust, llm);

    await extractor.extract([
      { role: 'user', content: '[agent-xyz says]: Learn this' },
    ]);

    const counts = trust.getDailyCounts();
    expect(counts.total).toBe(1);
    expect(counts.perAgent['agent-xyz']).toBe(1);
  });
});
