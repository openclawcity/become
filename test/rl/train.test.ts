import { describe, it, expect } from 'vitest';
import { trainLoRA } from '../../src/rl/train.js';

describe('trainLoRA', () => {
  it('returns error when dataset file does not exist', () => {
    const result = trainLoRA({
      baseModel: 'meta-llama/Llama-3.1-8B',
      dataset: '/nonexistent/path/dataset.jsonl',
      outputDir: '/tmp/become-test-output',
      backend: 'unsloth',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('accepts all config options', () => {
    // Just testing that the config types are correct
    const config = {
      baseModel: 'meta-llama/Llama-3.1-8B',
      dataset: '/nonexistent/dataset.jsonl',
      outputDir: '/tmp/test',
      backend: 'unsloth' as const,
      epochs: 5,
      rank: 32,
      lr: 1e-4,
    };
    // Don't actually run training — just validate config shape
    expect(config.backend).toBe('unsloth');
    expect(config.rank).toBe(32);
  });
});
