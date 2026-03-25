import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

const OPENCLAW_CONFIG = join(homedir(), '.openclaw', 'openclaw.json');
const STATE_DIR = join(homedir(), '.become', 'state');
const BACKUP_PATH = join(STATE_DIR, 'original_openclaw.json');
const ORIGINAL_URL_PATH = join(STATE_DIR, 'original_base_url.txt');
const PATCHED_PROVIDER_PATH = join(STATE_DIR, 'patched_provider.txt');

/**
 * Patch OpenClaw to route through become.
 *
 * Strategy: find the provider that serves the agent's model (e.g. "openrouter")
 * and swap its baseUrl to point at the become proxy. Don't add providers,
 * don't rename models, don't touch model IDs. Just swap the URL.
 *
 * Docs: https://docs.openclaw.ai/gateway/configuration-reference
 */
export function patchOpenClaw(config: BecomeConfig): void {
  if (!existsSync(OPENCLAW_CONFIG)) {
    throw new Error(`OpenClaw config not found at ${OPENCLAW_CONFIG}`);
  }

  const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8');
  const clawConfig = parseConfig(raw);
  mkdirSync(STATE_DIR, { recursive: true });

  // Find which provider the primary model uses
  const primaryModel = clawConfig.agents?.defaults?.model?.primary ?? '';
  if (!primaryModel) {
    throw new Error('No default model configured in openclaw.json (agents.defaults.model.primary)');
  }

  // Model format is "provider/model-path", e.g. "openrouter/xiaomi/mimo-v2-pro"
  const providerName = primaryModel.split('/')[0];
  if (!providerName) {
    throw new Error(`Cannot determine provider from model: ${primaryModel}`);
  }

  // Check if already patched
  if (existsSync(ORIGINAL_URL_PATH)) {
    const existingUrl = readFileSync(ORIGINAL_URL_PATH, 'utf-8').trim();
    if (existingUrl) {
      console.log('become is already connected. Run `become off` first to disconnect.');
      return;
    }
  }

  // Find the provider in models.json (per-agent) or openclaw.json (global)
  const modelsJsonPath = getModelsJsonPath(clawConfig);
  let modelsConfig: any = null;
  let modelsSource: 'models.json' | 'openclaw.json' = 'openclaw.json';

  if (modelsJsonPath && existsSync(modelsJsonPath)) {
    modelsConfig = JSON.parse(readFileSync(modelsJsonPath, 'utf-8'));
    modelsSource = 'models.json';
  }

  // Try models.json first (per-agent), then openclaw.json global providers
  let provider: any = null;
  let providerLocation: any = null;

  if (modelsConfig?.providers?.[providerName]) {
    provider = modelsConfig.providers[providerName];
    providerLocation = modelsConfig.providers;
  } else if (clawConfig.models?.providers?.[providerName]) {
    provider = clawConfig.models.providers[providerName];
    providerLocation = clawConfig.models.providers;
    modelsSource = 'openclaw.json';
  }

  if (!provider) {
    throw new Error(
      `Provider "${providerName}" not found in models.json or openclaw.json. ` +
      `Your model is "${primaryModel}" which needs a "${providerName}" provider.`
    );
  }

  const originalUrl = provider.baseUrl;
  if (!originalUrl) {
    throw new Error(`Provider "${providerName}" has no baseUrl`);
  }

  // Backup
  writeFileSync(BACKUP_PATH, raw, 'utf-8');
  writeFileSync(ORIGINAL_URL_PATH, originalUrl, 'utf-8');
  writeFileSync(PATCHED_PROVIDER_PATH, `${providerName}:${modelsSource}`, 'utf-8');

  // Swap the baseUrl to the proxy
  // Don't append /v1. The proxy accepts whatever path OpenClaw sends
  // and forwards it to the original upstream URL with the same path.
  provider.baseUrl = `http://127.0.0.1:${config.proxy_port}`;

  // Write back
  if (modelsSource === 'models.json' && modelsJsonPath) {
    writeFileSync(modelsJsonPath, JSON.stringify(modelsConfig, null, 2), 'utf-8');
  } else {
    writeFileSync(OPENCLAW_CONFIG, JSON.stringify(clawConfig, null, 2), 'utf-8');
  }

  console.log(`  provider: ${providerName}`);
  console.log(`  baseUrl: ${originalUrl} -> localhost:${config.proxy_port}`);

  // Restart gateway
  restartGateway();
}

export function restoreOpenClaw(): void {
  const originalUrl = readSafe(ORIGINAL_URL_PATH);
  const patchInfo = readSafe(PATCHED_PROVIDER_PATH);

  if (!originalUrl || !patchInfo) {
    // Nothing to restore, clean up state files
    cleanState();
    return;
  }

  const [providerName, source] = patchInfo.split(':');

  if (source === 'models.json') {
    // Restore in models.json
    const clawConfig = parseConfig(readFileSync(OPENCLAW_CONFIG, 'utf-8'));
    const modelsJsonPath = getModelsJsonPath(clawConfig);
    if (modelsJsonPath && existsSync(modelsJsonPath)) {
      const modelsConfig = JSON.parse(readFileSync(modelsJsonPath, 'utf-8'));
      if (modelsConfig.providers?.[providerName]) {
        modelsConfig.providers[providerName].baseUrl = originalUrl;
        writeFileSync(modelsJsonPath, JSON.stringify(modelsConfig, null, 2), 'utf-8');
      }
    }
  } else {
    // Restore in openclaw.json
    if (existsSync(OPENCLAW_CONFIG)) {
      const clawConfig = parseConfig(readFileSync(OPENCLAW_CONFIG, 'utf-8'));
      if (clawConfig.models?.providers?.[providerName]) {
        clawConfig.models.providers[providerName].baseUrl = originalUrl;
        writeFileSync(OPENCLAW_CONFIG, JSON.stringify(clawConfig, null, 2), 'utf-8');
      }
    }
  }

  // Clean up legacy mess from old become versions (v1.0.1-v1.0.14)
  // that added a "become" provider and changed model IDs
  cleanLegacy();

  cleanState();
  restartGateway();
}

/**
 * Remove artifacts from old become versions that added a "become" provider
 * and changed model IDs to "become/...". This runs on every restore.
 */
function cleanLegacy(): void {
  // Clean openclaw.json
  if (existsSync(OPENCLAW_CONFIG)) {
    try {
      const config = parseConfig(readFileSync(OPENCLAW_CONFIG, 'utf-8'));
      let changed = false;

      // Remove become provider
      if (config.models?.providers?.become) {
        delete config.models.providers.become;
        changed = true;
      }

      // Fix model ID if it starts with become/
      const primary = config.agents?.defaults?.model?.primary ?? '';
      if (primary.startsWith('become/')) {
        config.agents.defaults.model.primary = 'openrouter/' + primary.slice('become/'.length);
        changed = true;
      }

      // Remove _originalModel from any provider
      for (const prov of Object.values(config.models?.providers ?? {})) {
        if (prov && typeof prov === 'object' && '_originalModel' in prov) {
          delete (prov as Record<string, unknown>)._originalModel;
          changed = true;
        }
      }

      if (changed) writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
    } catch {}
  }

  // Clean models.json
  try {
    const clawConfig = parseConfig(readFileSync(OPENCLAW_CONFIG, 'utf-8'));
    const modelsJsonPath = getModelsJsonPath(clawConfig);
    if (modelsJsonPath && existsSync(modelsJsonPath)) {
      const models = JSON.parse(readFileSync(modelsJsonPath, 'utf-8'));
      let changed = false;

      if (models.providers?.become) {
        delete models.providers.become;
        changed = true;
      }

      if (changed) writeFileSync(modelsJsonPath, JSON.stringify(models, null, 2), 'utf-8');
    }
  } catch {}
}

export function listOpenClawAgents(): { id: string; model: string }[] {
  if (!existsSync(OPENCLAW_CONFIG)) return [];
  try {
    const config = parseConfig(readFileSync(OPENCLAW_CONFIG, 'utf-8'));
    const agents: any[] = config.agents?.list ?? [];
    const defaultModel = config.agents?.defaults?.model?.primary ?? 'unknown';

    if (agents.length === 0) {
      return [{ id: '_defaults', model: defaultModel }];
    }
    return agents.map((a: any) => ({
      id: a.id,
      model: a.model ?? defaultModel,
    }));
  } catch {
    return [];
  }
}

export function isOpenClawPatched(): boolean {
  return existsSync(ORIGINAL_URL_PATH) && readSafe(ORIGINAL_URL_PATH) !== '';
}

// -- Helpers --

function getModelsJsonPath(clawConfig: any): string | null {
  // Per-agent models.json path
  const agentList = clawConfig.agents?.list ?? [];
  const defaultAgent = agentList.find((a: any) => a.default) ?? agentList[0];

  if (defaultAgent?.agentDir) {
    return join(defaultAgent.agentDir.replace('~', homedir()), 'models.json');
  }

  // Default location
  const mainPath = join(homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json');
  if (existsSync(mainPath)) return mainPath;

  return null;
}

function parseConfig(raw: string): any {
  const stripped = raw
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(stripped);
}

function readSafe(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  } catch {
    return '';
  }
}

function cleanState(): void {
  for (const f of [ORIGINAL_URL_PATH, PATCHED_PROVIDER_PATH]) {
    try { writeFileSync(f, '', 'utf-8'); } catch {}
  }
}

function restartGateway(): void {
  console.log('Restarting OpenClaw gateway...');
  try {
    execSync('openclaw gateway restart', { stdio: 'pipe', timeout: 15000 });
    console.log('OpenClaw gateway restarted.');
  } catch {
    console.log('\n*** OpenClaw gateway needs a manual restart. ***');
    console.log('*** Run: openclaw gateway restart ***\n');
  }
}
