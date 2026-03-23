/**
 * LLM adapter interface — pluggable backend for skill evolution, norm detection, and scoring.
 */
export interface LLMAdapter {
  /** Generate a text completion */
  complete(prompt: string, opts?: LLMOptions): Promise<string>;

  /** Generate a structured JSON response */
  json<T = unknown>(prompt: string, opts?: LLMOptions): Promise<T>;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

// ── OpenAI-compatible adapter ───────────────────────────────────────────

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: OpenAIConfig) {
    if (!config.apiKey) throw new Error('OpenAI API key is required');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
    this.defaultModel = config.model ?? 'gpt-4o-mini';
  }

  async complete(prompt: string, opts?: LLMOptions): Promise<string> {
    const response = await this.request({
      model: opts?.model ?? this.defaultModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts?.maxTokens ?? 2000,
      temperature: opts?.temperature ?? 0.7,
    }, opts?.timeoutMs);
    return response.choices?.[0]?.message?.content ?? '';
  }

  async json<T = unknown>(prompt: string, opts?: LLMOptions): Promise<T> {
    const response = await this.request({
      model: opts?.model ?? this.defaultModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts?.maxTokens ?? 2000,
      temperature: opts?.temperature ?? 0.3,
      response_format: { type: 'json_object' },
    }, opts?.timeoutMs);
    const text = response.choices?.[0]?.message?.content ?? '{}';
    return JSON.parse(text) as T;
  }

  private async request(body: Record<string, unknown>, timeoutMs?: number): Promise<any> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  }
}

// ── Anthropic adapter ───────────────────────────────────────────────────

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
}

export class AnthropicAdapter implements LLMAdapter {
  private apiKey: string;
  private defaultModel: string;

  constructor(config: AnthropicConfig) {
    if (!config.apiKey) throw new Error('Anthropic API key is required');
    this.apiKey = config.apiKey;
    this.defaultModel = config.model ?? 'claude-sonnet-4-20250514';
  }

  async complete(prompt: string, opts?: LLMOptions): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts?.model ?? this.defaultModel,
        max_tokens: opts?.maxTokens ?? 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    return data.content?.[0]?.text ?? '';
  }

  async json<T = unknown>(prompt: string, opts?: LLMOptions): Promise<T> {
    const text = await this.complete(
      `${prompt}\n\nRespond with valid JSON only, no other text.`,
      { ...opts, temperature: opts?.temperature ?? 0.3 },
    );
    // Try parsing the whole text first, then extract JSON
    try {
      return JSON.parse(text.trim()) as T;
    } catch {
      // Extract first valid JSON object or array (non-greedy)
      const match = text.match(/\{[\s\S]*?\}(?=\s*$|\s*[^}\]])/);
      const arrMatch = text.match(/\[[\s\S]*?\](?=\s*$|\s*[^}\]])/);
      const candidate = match?.[0] ?? arrMatch?.[0];
      if (!candidate) throw new Error('No JSON found in response');
      return JSON.parse(candidate) as T;
    }
  }
}

// ── Ollama adapter (local models) ───────────────────────────────────────

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
}

export class OllamaAdapter implements LLMAdapter {
  private baseUrl: string;
  private defaultModel: string;

  constructor(config?: OllamaConfig) {
    this.baseUrl = (config?.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.defaultModel = config?.model ?? 'llama3.1';
  }

  async complete(prompt: string, opts?: LLMOptions): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts?.model ?? this.defaultModel,
        prompt,
        stream: false,
        options: {
          num_predict: opts?.maxTokens ?? 2000,
          temperature: opts?.temperature ?? 0.7,
        },
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`Ollama error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    return data.response ?? '';
  }

  async json<T = unknown>(prompt: string, opts?: LLMOptions): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts?.model ?? this.defaultModel,
        prompt: `${prompt}\n\nRespond with valid JSON only.`,
        stream: false,
        format: 'json',
        options: {
          num_predict: opts?.maxTokens ?? 2000,
          temperature: opts?.temperature ?? 0.3,
        },
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`Ollama error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    return JSON.parse(data.response ?? '{}') as T;
  }
}
