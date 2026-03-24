import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

// IronClaw .env is at ~/.ironclaw/.env (overridable via IRONCLAW_BASE_DIR)
// Source: https://github.com/nearai/ironclaw src/service.rs, .env.example
const IRONCLAW_ENV = join(process.env.IRONCLAW_BASE_DIR ?? join(homedir(), '.ironclaw'), '.env');
const BACKUP_PATH = join(homedir(), '.become', 'state', 'original_ironclaw.env');

export function patchIronClaw(config: BecomeConfig): void {
  if (!existsSync(IRONCLAW_ENV)) {
    throw new Error(`IronClaw .env not found at ${IRONCLAW_ENV}`);
  }

  // Don't patch twice
  if (existsSync(BACKUP_PATH)) {
    console.log('become is already connected to IronClaw. Run `become off` first.');
    return;
  }

  // Backup
  mkdirSync(join(homedir(), '.become', 'state'), { recursive: true });
  copyFileSync(IRONCLAW_ENV, BACKUP_PATH);

  // Read current .env to determine which var to patch
  // IronClaw uses LLM_BACKEND to select provider. Each provider has its own base URL var.
  // Source: src/config/llm.rs
  const content = readFileSync(IRONCLAW_ENV, 'utf-8');
  const backendMatch = content.match(/^LLM_BACKEND=(.+)$/m);
  const backend = backendMatch?.[1]?.trim().toLowerCase() ?? 'openai_compatible';

  const proxyUrl = `http://127.0.0.1:${config.proxy_port}`;
  const vars: Record<string, string> = {};

  // Patch the correct base URL var for the active backend
  switch (backend) {
    case 'anthropic':
      vars['ANTHROPIC_BASE_URL'] = proxyUrl;
      break;
    case 'ollama':
      vars['OLLAMA_BASE_URL'] = proxyUrl;
      break;
    case 'nearai':
    case 'near_ai':
    case 'near':
      vars['NEARAI_BASE_URL'] = proxyUrl;
      break;
    default:
      // openai, openai_compatible, openrouter, or any unknown value
      vars['LLM_BASE_URL'] = proxyUrl;
      break;
  }

  patchDotEnv(IRONCLAW_ENV, vars);

  console.log(`  backend: ${backend}`);
  console.log(`  patched: ${Object.keys(vars).join(', ')} -> localhost:${config.proxy_port}`);

  restartIronClaw();
}

export function restoreIronClaw(): void {
  if (!existsSync(BACKUP_PATH)) {
    return;
  }
  copyFileSync(BACKUP_PATH, IRONCLAW_ENV);
  try { unlinkSync(BACKUP_PATH); } catch {}
  restartIronClaw();
}

// IronClaw has no `restart` command. Must stop + start.
// CLI: ironclaw service {install,start,stop,status,uninstall}
// macOS label: com.ironclaw.daemon
// Linux unit: ironclaw.service (~/.config/systemd/user/)
// Source: src/cli/service.rs, src/service.rs
function restartIronClaw(): void {
  console.log('Restarting IronClaw...');

  // Try CLI stop + start first
  try {
    execSync('ironclaw service stop', { stdio: 'pipe', timeout: 10000 });
    execSync('ironclaw service start', { stdio: 'pipe', timeout: 10000 });
    console.log('IronClaw restarted.');
    return;
  } catch {}

  // Fallback: try launchctl (macOS)
  try {
    execSync('launchctl kickstart -k gui/$(id -u)/com.ironclaw.daemon', { stdio: 'pipe', timeout: 10000 });
    console.log('IronClaw restarted via launchctl.');
    return;
  } catch {}

  // Fallback: try systemd (Linux)
  try {
    execSync('systemctl --user restart ironclaw', { stdio: 'pipe', timeout: 10000 });
    console.log('IronClaw restarted via systemd.');
    return;
  } catch {}

  console.log('\n*** IronClaw needs a manual restart. ***');
  console.log('*** Run: ironclaw service stop && ironclaw service start ***\n');
}

function patchDotEnv(path: string, vars: Record<string, string>): void {
  let content = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trimEnd() + (content.length > 0 ? '\n' : '') + `${key}=${value}\n`;
    }
  }
  writeFileSync(path, content, 'utf-8');
}
