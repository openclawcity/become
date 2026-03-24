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

  // Backup original (only if not already patched by become)
  mkdirSync(join(homedir(), '.become', 'state'), { recursive: true });
  if (!clawConfig.models?.providers?.become) {
    writeFileSync(BACKUP_PATH, raw, 'utf-8');
  }

  // Store original model for restore (in become state, NOT in openclaw config)
  const originalModel = clawConfig.agents?.defaults?.model?.primary ?? '';
  const originalModelPath = join(homedir(), '.become', 'state', 'original_model.txt');
  writeFileSync(originalModelPath, originalModel, 'utf-8');

  // Extract the model ID (strip provider prefix if present)
  const modelId = originalModel.includes('/') ? originalModel.split('/').slice(1).join('/') : originalModel;

  // Add become as a provider with required models array
  if (!clawConfig.models) clawConfig.models = {};
  if (!clawConfig.models.providers) clawConfig.models.providers = {};

  // OpenClaw requires models as array of objects with at least { id }
  // See: https://docs.openclaw.ai/gateway/configuration-reference
  clawConfig.models.providers.become = {
    api: config.llm_provider === 'openai' ? 'openai-completions' : 'anthropic-messages',
    baseUrl: `http://127.0.0.1:${config.proxy_port}`,
    apiKey: config.llm_api_key,
    models: [
      { id: modelId, name: `${modelId} via become` },
    ],
  };

  // Patch primary model to use become provider
  if (originalModel) {
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
  if (!existsSync(OPENCLAW_CONFIG)) {
    throw new Error(`OpenClaw config not found at ${OPENCLAW_CONFIG}`);
  }

  // If we have a clean backup, use it
  if (existsSync(BACKUP_PATH)) {
    const backup = readFileSync(BACKUP_PATH, 'utf-8');
    const backupConfig = JSON.parse(backup);
    // Only restore if backup is clean (no become provider)
    if (!backupConfig.models?.providers?.become) {
      writeFileSync(OPENCLAW_CONFIG, backup, 'utf-8');
    } else {
      // Backup is corrupted; manually remove become from current config
      manualRestore();
    }
  } else {
    // No backup; manually remove become from current config
    manualRestore();
  }

  try {
    execSync('openclaw gateway restart', { stdio: 'pipe', timeout: 15000 });
  } catch {
    console.log('Warning: Could not restart OpenClaw gateway. Restart it manually: openclaw gateway restart');
  }
}

function manualRestore(): void {
  const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8');
  const config = JSON.parse(raw);

  // Restore original model from saved file
  const originalModelPath = join(homedir(), '.become', 'state', 'original_model.txt');
  if (existsSync(originalModelPath)) {
    const originalModel = readFileSync(originalModelPath, 'utf-8').trim();
    if (originalModel && config.agents?.defaults?.model) {
      config.agents.defaults.model.primary = originalModel;
    }
  }

  // Remove become provider
  if (config.models?.providers?.become) {
    delete config.models.providers.become;
  }

  // Clean up _originalModel from any provider (legacy bug)
  for (const provider of Object.values(config.models?.providers ?? {})) {
    if (provider && typeof provider === 'object' && '_originalModel' in provider) {
      delete (provider as Record<string, unknown>)._originalModel;
    }
  }

  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
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
