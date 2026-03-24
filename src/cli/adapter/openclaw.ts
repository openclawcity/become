import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

const OPENCLAW_CONFIG = join(homedir(), '.openclaw', 'openclaw.json');
const BACKUP_PATH = join(homedir(), '.become', 'state', 'original_openclaw.json');
const ORIGINAL_MODEL_PATH = join(homedir(), '.become', 'state', 'original_model.txt');
const PATCHED_AGENT_PATH = join(homedir(), '.become', 'state', 'patched_agent.txt');

interface OpenClawAgent {
  id: string;
  model?: string;
  workspace?: string;
  agentDir?: string;
  [key: string]: unknown;
}

/**
 * Read openclaw.json, list available agents, and patch the selected one
 * to route through the become proxy.
 *
 * OpenClaw provider schema (docs.openclaw.ai/gateway/configuration-reference):
 *   models.providers.<id> = { api, baseUrl, apiKey, models: [{ id, name? }] }
 */
export function patchOpenClaw(config: BecomeConfig, agentId?: string): void {
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

  // Determine which agent to patch
  const agents: OpenClawAgent[] = clawConfig.agents?.list ?? [];
  let originalModel: string;
  let patchedAgentId: string;

  if (agents.length > 0 && agentId) {
    // Patch a specific agent from agents.list
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found in agents.list. Available: ${agents.map((a) => a.id).join(', ')}`);
    }
    originalModel = agent.model ?? clawConfig.agents?.defaults?.model?.primary ?? '';
    patchedAgentId = agentId;

    // Store original model, then patch this agent's model
    writeFileSync(ORIGINAL_MODEL_PATH, originalModel, 'utf-8');
    writeFileSync(PATCHED_AGENT_PATH, patchedAgentId, 'utf-8');

    const modelId = stripProvider(originalModel);
    agent.model = `become/${modelId}`;
  } else {
    // No agents.list or no specific agent requested: patch defaults
    originalModel = clawConfig.agents?.defaults?.model?.primary ?? '';
    patchedAgentId = '_defaults';

    writeFileSync(ORIGINAL_MODEL_PATH, originalModel, 'utf-8');
    writeFileSync(PATCHED_AGENT_PATH, patchedAgentId, 'utf-8');

    const modelId = stripProvider(originalModel);
    if (!clawConfig.agents) clawConfig.agents = {};
    if (!clawConfig.agents.defaults) clawConfig.agents.defaults = {};
    if (!clawConfig.agents.defaults.model) clawConfig.agents.defaults.model = {};
    clawConfig.agents.defaults.model.primary = `become/${modelId}`;
  }

  // Add become as a provider
  // Schema: https://docs.openclaw.ai/gateway/configuration-reference
  const modelId = stripProvider(originalModel);
  if (!clawConfig.models) clawConfig.models = {};
  if (!clawConfig.models.providers) clawConfig.models.providers = {};

  clawConfig.models.providers.become = {
    api: config.llm_provider === 'openai' || config.llm_provider === 'openrouter'
      ? 'openai-completions' : 'anthropic-messages',
    baseUrl: `http://127.0.0.1:${config.proxy_port}`,
    apiKey: config.llm_api_key,
    models: [
      { id: modelId, name: `${modelId} via become` },
    ],
  };

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
    if (!backupConfig.models?.providers?.become) {
      writeFileSync(OPENCLAW_CONFIG, backup, 'utf-8');
      restartGateway();
      return;
    }
  }

  // Backup is missing or corrupted; manually restore
  const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8');
  const config = JSON.parse(raw);

  // Read which agent was patched and what the original model was
  const patchedAgentId = readStateFile(PATCHED_AGENT_PATH);
  const originalModel = readStateFile(ORIGINAL_MODEL_PATH);

  if (originalModel) {
    const agents: OpenClawAgent[] = config.agents?.list ?? [];

    if (patchedAgentId && patchedAgentId !== '_defaults') {
      // Restore specific agent
      const agent = agents.find((a) => a.id === patchedAgentId);
      if (agent) {
        agent.model = originalModel;
      }
    } else {
      // Restore defaults
      if (config.agents?.defaults?.model) {
        config.agents.defaults.model.primary = originalModel;
      }
    }
  }

  // Remove become provider
  if (config.models?.providers?.become) {
    delete config.models.providers.become;
  }

  // Clean up _originalModel from any provider (legacy bug from v1.0.1)
  for (const provider of Object.values(config.models?.providers ?? {})) {
    if (provider && typeof provider === 'object' && '_originalModel' in provider) {
      delete (provider as Record<string, unknown>)._originalModel;
    }
  }

  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
  restartGateway();
}

/**
 * List available agents from openclaw.json.
 * Returns agents from agents.list, or a single "default" entry if no list exists.
 */
export function listOpenClawAgents(): { id: string; model: string }[] {
  if (!existsSync(OPENCLAW_CONFIG)) return [];

  try {
    const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8'));
    const agents: OpenClawAgent[] = config.agents?.list ?? [];
    const defaultModel = config.agents?.defaults?.model?.primary ?? 'unknown';

    if (agents.length === 0) {
      return [{ id: '_defaults', model: defaultModel }];
    }

    return agents.map((a) => ({
      id: a.id,
      model: a.model ?? defaultModel,
    }));
  } catch {
    return [];
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

// ── Helpers ──────────────────────────────────────────────

function stripProvider(model: string): string {
  return model.includes('/') ? model.split('/').slice(1).join('/') : model;
}

function readStateFile(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  } catch {
    return '';
  }
}

function restartGateway(): void {
  try {
    execSync('openclaw gateway restart', { stdio: 'pipe', timeout: 15000 });
  } catch {
    console.log('Warning: Could not restart OpenClaw gateway. Restart it manually: openclaw gateway restart');
  }
}
