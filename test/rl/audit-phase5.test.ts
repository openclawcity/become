import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trainLoRA } from '../../src/rl/train.js';
import { TrainScheduler } from '../../src/rl/scheduler.js';
import { MemoryStore } from '../../src/adapters/memory.js';

// ── Bug #1+2: Command injection / code injection in trainLoRA ─────────────

describe('trainLoRA input validation', () => {
  it('rejects baseModel with shell metacharacters', () => {
    const result = trainLoRA({
      baseModel: 'model; rm -rf /',
      dataset: '/tmp/data.jsonl',
      outputDir: '/tmp/out',
      backend: 'unsloth',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disallowed characters');
  });

  it('rejects dataset path with backticks', () => {
    const result = trainLoRA({
      baseModel: 'meta-llama/Llama-3.1-8B',
      dataset: '`malicious`',
      outputDir: '/tmp/out',
      backend: 'unsloth',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disallowed characters');
  });

  it('rejects outputDir with semicolons', () => {
    const result = trainLoRA({
      baseModel: 'meta-llama/Llama-3.1-8B',
      dataset: '/tmp/data.jsonl',
      outputDir: '/tmp/out; rm -rf /',
      backend: 'unsloth',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disallowed characters');
  });

  it('rejects invalid epochs', () => {
    const result = trainLoRA({
      baseModel: 'meta-llama/Llama-3.1-8B',
      dataset: '/tmp/data.jsonl',
      outputDir: '/tmp/out',
      backend: 'unsloth',
      epochs: 999,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Epochs');
  });

  it('rejects invalid rank', () => {
    const result = trainLoRA({
      baseModel: 'meta-llama/Llama-3.1-8B',
      dataset: '/tmp/data.jsonl',
      outputDir: '/tmp/out',
      backend: 'unsloth',
      rank: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('rank');
  });

  it('accepts valid model names with slashes and dots', () => {
    const result = trainLoRA({
      baseModel: 'meta-llama/Llama-3.1-8B',
      dataset: '/nonexistent/data.jsonl',
      outputDir: '/tmp/out',
      backend: 'unsloth',
    });
    // Should fail on dataset not found, not on validation
    expect(result.error).toContain('not found');
  });
});

// ── Bug #4: Scheduler re-entry guard ──────────────────────────────────────

describe('TrainScheduler re-entry guard', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not run concurrent checks', async () => {
    let checkCount = 0;
    const store = new MemoryStore();

    // Add enough samples to trigger ready
    for (let i = 0; i < 5; i++) {
      await store.saveConversationScore('agent-1', {
        quality: 1, confidence: 0.9, skill_signals: ['coding'],
      });
    }

    const scheduler = new TrainScheduler({
      adapter: store,
      agentId: 'agent-1',
      minSamples: 3,
      intervalMs: 10, // Very short interval
      onReady: async () => {
        checkCount++;
        // Simulate slow callback
        await new Promise((r) => setTimeout(r, 100));
      },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(50);
    scheduler.stop();

    // Should only have called onReady once despite short interval
    expect(checkCount).toBe(1);
  });
});

// ── Bug #5: Unused imports removed ────────────────────────────────────────

describe('Scheduler imports', () => {
  it('scheduler module loads without unused import errors', async () => {
    // This test verifies the module loads cleanly
    const mod = await import('../../src/rl/scheduler.js');
    expect(mod.TrainScheduler).toBeDefined();
  });
});
