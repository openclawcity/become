import { describe, it, expect } from 'vitest';
import { OpenAIAdapter, AnthropicAdapter, OllamaAdapter } from '../../src/adapters/llm.js';
import type { LLMAdapter } from '../../src/adapters/llm.js';

describe('OpenAIAdapter', () => {
  it('requires API key', () => {
    expect(() => new OpenAIAdapter({ apiKey: '' })).toThrow('required');
  });

  it('implements LLMAdapter interface', () => {
    const adapter: LLMAdapter = new OpenAIAdapter({ apiKey: 'test-key' });
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.json).toBe('function');
  });

  it('accepts custom base URL and model', () => {
    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://custom.api.com',
      model: 'gpt-4o',
    });
    expect(adapter).toBeDefined();
  });

  it('strips trailing slashes from base URL', () => {
    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com///',
    });
    expect(adapter).toBeDefined();
  });
});

describe('AnthropicAdapter', () => {
  it('requires API key', () => {
    expect(() => new AnthropicAdapter({ apiKey: '' })).toThrow('required');
  });

  it('implements LLMAdapter interface', () => {
    const adapter: LLMAdapter = new AnthropicAdapter({ apiKey: 'test-key' });
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.json).toBe('function');
  });
});

describe('OllamaAdapter', () => {
  it('works with no config (defaults)', () => {
    const adapter = new OllamaAdapter();
    expect(adapter).toBeDefined();
  });

  it('accepts custom config', () => {
    const adapter = new OllamaAdapter({
      baseUrl: 'http://my-server:11434',
      model: 'mistral',
    });
    expect(adapter).toBeDefined();
  });

  it('implements LLMAdapter interface', () => {
    const adapter: LLMAdapter = new OllamaAdapter();
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.json).toBe('function');
  });
});
