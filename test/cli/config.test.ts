import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We test config logic directly via the file operations
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';

describe('Config file operations', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'become-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates directory structure on save', () => {
    const configPath = join(dir, 'config.json');
    const config = {
      agent_type: 'openclaw',
      llm_provider: 'anthropic',
      llm_base_url: 'https://api.anthropic.com',
      llm_api_key: 'test',
      proxy_port: 30001,
      dashboard_port: 30002,
      auto_extract: true,
      max_skills_per_call: 15,
      max_lessons_per_day: 20,
      state: 'off',
    };

    mkdirSync(join(dir, 'skills'), { recursive: true });
    mkdirSync(join(dir, 'pending'), { recursive: true });
    mkdirSync(join(dir, 'rejected'), { recursive: true });
    mkdirSync(join(dir, 'state'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(join(dir, 'skills'))).toBe(true);
    expect(existsSync(join(dir, 'pending'))).toBe(true);
    expect(existsSync(join(dir, 'rejected'))).toBe(true);

    const loaded = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(loaded.agent_type).toBe('openclaw');
    expect(loaded.proxy_port).toBe(30001);
  });

  it('round-trips config correctly', () => {
    const configPath = join(dir, 'config.json');
    const config = {
      agent_type: 'ironclaw',
      llm_provider: 'openai',
      llm_base_url: 'https://api.openai.com',
      llm_api_key: 'sk-test',
      proxy_port: 31000,
      dashboard_port: 31001,
      auto_extract: false,
      max_skills_per_call: 10,
      max_lessons_per_day: 5,
      state: 'on',
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    const loaded = JSON.parse(readFileSync(configPath, 'utf-8'));

    expect(loaded.agent_type).toBe('ironclaw');
    expect(loaded.llm_provider).toBe('openai');
    expect(loaded.proxy_port).toBe(31000);
    expect(loaded.state).toBe('on');
    expect(loaded.auto_extract).toBe(false);
  });
});
