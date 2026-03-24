import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface BecomeConfig {
  agent_type: 'openclaw' | 'ironclaw' | 'nanoclaw' | 'generic';
  openclaw_agent_id?: string;
  llm_provider: 'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'custom';
  llm_base_url: string;
  llm_api_key: string;
  proxy_port: number;
  dashboard_port: number;
  auto_extract: boolean;
  max_skills_per_call: number;
  max_lessons_per_day: number;
  state: 'on' | 'off';
}

const DEFAULT_CONFIG: BecomeConfig = {
  agent_type: 'openclaw',
  llm_provider: 'anthropic',
  llm_base_url: 'https://api.anthropic.com',
  llm_api_key: '',
  proxy_port: 30001,
  dashboard_port: 30002,
  auto_extract: true,
  max_skills_per_call: 15,
  max_lessons_per_day: 20,
  state: 'off',
};

export function getBecomeDir(): string {
  return join(homedir(), '.become');
}

export function getConfigPath(): string {
  return join(getBecomeDir(), 'config.json');
}

export function loadConfig(): BecomeConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    throw new Error('become is not set up. Run `become setup` first.');
  }
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    throw new Error('Invalid config. Run `become setup` to reconfigure.');
  }
}

export function saveConfig(config: BecomeConfig): void {
  const dir = getBecomeDir();
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  mkdirSync(join(dir, 'pending'), { recursive: true });
  mkdirSync(join(dir, 'rejected'), { recursive: true });
  mkdirSync(join(dir, 'state'), { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}

export const LLM_DEFAULTS: Record<string, { base_url: string }> = {
  anthropic: { base_url: 'https://api.anthropic.com' },
  openai: { base_url: 'https://api.openai.com' },
  ollama: { base_url: 'http://localhost:11434' },
  openrouter: { base_url: 'https://openrouter.ai/api' },
};
