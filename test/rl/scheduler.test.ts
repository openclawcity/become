import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrainScheduler } from '../../src/rl/scheduler.js';
import { MemoryStore } from '../../src/adapters/memory.js';

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TrainScheduler', () => {
  it('starts in idle state', () => {
    const scheduler = new TrainScheduler({
      adapter: store,
      agentId: 'agent-1',
      minSamples: 5,
      onReady: () => {},
    });
    expect(scheduler.getStatus()).toBe('idle');
  });

  it('transitions to stopped on stop()', () => {
    const scheduler = new TrainScheduler({
      adapter: store,
      agentId: 'agent-1',
      minSamples: 5,
      onReady: () => {},
    });
    scheduler.start();
    scheduler.stop();
    expect(scheduler.getStatus()).toBe('stopped');
  });

  it('calls onReady when enough positive samples', async () => {
    let readyCalled = false;
    const scheduler = new TrainScheduler({
      adapter: store,
      agentId: 'agent-1',
      minSamples: 3,
      minConfidence: 0.7,
      intervalMs: 1000,
      onReady: () => { readyCalled = true; },
    });

    // Add enough high-confidence positive scores
    for (let i = 0; i < 5; i++) {
      await store.saveConversationScore('agent-1', {
        quality: 1,
        confidence: 0.9,
        skill_signals: ['coding'],
      });
    }

    scheduler.start();
    // Wait for the first check to complete
    await vi.advanceTimersByTimeAsync(100);

    expect(readyCalled).toBe(true);
    scheduler.stop();
  });

  it('does not call onReady with insufficient samples', async () => {
    let readyCalled = false;
    const scheduler = new TrainScheduler({
      adapter: store,
      agentId: 'agent-1',
      minSamples: 10,
      intervalMs: 1000,
      onReady: () => { readyCalled = true; },
    });

    // Only add 2 positive scores
    await store.saveConversationScore('agent-1', { quality: 1, confidence: 0.9, skill_signals: [] });
    await store.saveConversationScore('agent-1', { quality: 1, confidence: 0.9, skill_signals: [] });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(readyCalled).toBe(false);
    scheduler.stop();
  });

  it('does not count low-confidence scores', async () => {
    let readyCalled = false;
    const scheduler = new TrainScheduler({
      adapter: store,
      agentId: 'agent-1',
      minSamples: 3,
      minConfidence: 0.8,
      intervalMs: 1000,
      onReady: () => { readyCalled = true; },
    });

    // Add positive but low-confidence scores
    for (let i = 0; i < 10; i++) {
      await store.saveConversationScore('agent-1', {
        quality: 1,
        confidence: 0.5, // Below threshold
        skill_signals: [],
      });
    }

    scheduler.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(readyCalled).toBe(false);
    scheduler.stop();
  });
});
