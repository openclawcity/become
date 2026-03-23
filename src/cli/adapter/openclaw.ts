import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

const OPENCLAW_CONFIG = join(homedir(), '.openclaw', 'openclaw.json');
const BACKUP_PATH = join(homedir(), '.become', 'state', 'original_openclaw.json');

export function patchOpenClaw(config: BecomeConfig): void {
  if (!existsSync(OPENCLAW_CONFIG)) {
    throw new Error(`OpenClaw config not found at ${OPENCLAW_CONFIG}`);
  }

  const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8');
  const clawConfig = JSON.parse(raw);

  // Backup original
  mkdirSync(join(homedir(), '.become', 'state'), { recursive: true });
  writeFileSync(BACKUP_PATH, raw, 'utf-8');

  // Add become as a provider
  if (!clawConfig.models) clawConfig.models = {};
  if (!clawConfig.models.providers) clawConfig.models.providers = {};

  clawConfig.models.providers.become = {
    api: 'anthropic-messages',
    baseUrl: `http://127.0.0.1:${config.proxy_port}`,
    apiKey: config.llm_api_key,
  };

  // Patch primary model to use become provider
  if (clawConfig.agents?.defaults?.model?.primary) {
    const original = clawConfig.agents.defaults.model.primary;
    // Store original model ID for restore
    clawConfig.models.providers.become._originalModel = original;
    // Replace provider prefix with "become"
    const modelId = original.includes('/') ? original.split('/').slice(1).join('/') : original;
    clawConfig.agents.defaults.model.primary = `become/${modelId}`;
  }

  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(clawConfig, null, 2), 'utf-8');

  // Restart gateway
  try {
    execSync('openclaw gateway restart', { stdio: 'pipe', timeout: 15000 });
  } catch {
    console.log('Warning: Could not restart OpenClaw gateway. Restart it manually: openclaw gateway restart');
  }
}

export function restoreOpenClaw(): void {
  if (!existsSync(BACKUP_PATH)) {
    throw new Error('No backup found. Was become ever turned on?');
  }

  const backup = readFileSync(BACKUP_PATH, 'utf-8');
  writeFileSync(OPENCLAW_CONFIG, backup, 'utf-8');

  try {
    execSync('openclaw gateway restart', { stdio: 'pipe', timeout: 15000 });
  } catch {
    console.log('Warning: Could not restart OpenClaw gateway. Restart it manually: openclaw gateway restart');
  }
}

export function isOpenClawPatched(): boolean {
  if (!existsSync(OPENCLAW_CONFIG)) return false;
  try {
    const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8'));
    return !!config.models?.providers?.become;
  } catch {
    return false;
  }
}
