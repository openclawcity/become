import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

// NanoClaw .env lives in the project root (where nanoclaw was cloned/installed).
// NOT in ~/.nanoclaw/ (that doesn't exist).
// Source: https://github.com/qwibitai/nanoclaw src/env.ts reads process.cwd()/.env
const BACKUP_PATH = join(homedir(), '.become', 'state', 'original_nanoclaw.env');
const PATCHED_ENV_PATH_FILE = join(homedir(), '.become', 'state', 'nanoclaw_env_path.txt');
const ORIGINAL_URL_PATH = join(homedir(), '.become', 'state', 'original_base_url.txt');

// NanoClaw uses ANTHROPIC_BASE_URL for custom LLM endpoints.
// It routes everything through a credential proxy (OneCLI) that
// forwards to Anthropic or a custom ANTHROPIC_BASE_URL.
// Source: GitHub README, src/config.ts
const NANOCLAW_URL_VAR = 'ANTHROPIC_BASE_URL';

export function patchNanoClaw(config: BecomeConfig): void {
  const envPath = findNanoClawEnv();
  if (!envPath) {
    throw new Error(
      'Could not find NanoClaw .env file.\n' +
      'NanoClaw stores .env in its project root (where you cloned it).\n' +
      `Set ${NANOCLAW_URL_VAR}=http://127.0.0.1:${config.proxy_port} manually in your NanoClaw .env file.`
    );
  }

  // Don't patch twice
  if (existsSync(BACKUP_PATH)) {
    console.log('become is already connected to NanoClaw. Run `become off` first.');
    return;
  }

  // Backup
  mkdirSync(join(homedir(), '.become', 'state'), { recursive: true });
  copyFileSync(envPath, BACKUP_PATH);
  writeFileSync(PATCHED_ENV_PATH_FILE, envPath, 'utf-8');

  // Save original URL so the proxy knows where to forward
  const content = readFileSync(envPath, 'utf-8');
  const originalMatch = content.match(new RegExp(`^${NANOCLAW_URL_VAR}=(.+)$`, 'm'));
  const originalUrl = originalMatch?.[1]?.trim() ?? '';
  if (originalUrl) {
    writeFileSync(ORIGINAL_URL_PATH, originalUrl, 'utf-8');
  }

  // Patch
  patchDotEnv(envPath, {
    [NANOCLAW_URL_VAR]: `http://127.0.0.1:${config.proxy_port}`,
  });

  console.log(`  env file: ${envPath}`);
  console.log(`  patched: ${NANOCLAW_URL_VAR} -> localhost:${config.proxy_port}`);

  restartNanoClaw();
}

export function restoreNanoClaw(): void {
  if (!existsSync(BACKUP_PATH)) {
    return;
  }

  // Use stored path to avoid restoring to wrong file
  let envPath: string | null = null;
  if (existsSync(PATCHED_ENV_PATH_FILE)) {
    envPath = readFileSync(PATCHED_ENV_PATH_FILE, 'utf-8').trim();
  }
  if (!envPath) {
    envPath = findNanoClawEnv();
  }
  if (!envPath) {
    console.log('Warning: Cannot find NanoClaw .env to restore. Backup is at ' + BACKUP_PATH);
    return;
  }

  copyFileSync(BACKUP_PATH, envPath);
  try { unlinkSync(BACKUP_PATH); } catch {}
  try { unlinkSync(PATCHED_ENV_PATH_FILE); } catch {}
  restartNanoClaw();
}

function findNanoClawEnv(): string | null {
  const candidates: string[] = [];

  // macOS: extract WorkingDirectory from launchd plist
  // Label: com.nanoclaw, plist at ~/Library/LaunchAgents/com.nanoclaw.plist
  // Source: launchd/com.nanoclaw.plist template, setup/service.ts
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.nanoclaw.plist');
  if (existsSync(plistPath)) {
    try {
      const plist = readFileSync(plistPath, 'utf-8');
      const match = plist.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)<\/string>/);
      if (match) candidates.push(join(match[1], '.env'));
    } catch {}
  }

  // Linux: extract WorkingDirectory from systemd user unit
  // Unit: ~/.config/systemd/user/nanoclaw.service
  // Source: setup/service.ts
  const userUnit = join(homedir(), '.config', 'systemd', 'user', 'nanoclaw.service');
  if (existsSync(userUnit)) {
    try {
      const unit = readFileSync(userUnit, 'utf-8');
      const match = unit.match(/WorkingDirectory=(.+)/);
      if (match) candidates.push(join(match[1].trim(), '.env'));
    } catch {}
  }

  // Linux root: /etc/systemd/system/nanoclaw.service
  const rootUnit = '/etc/systemd/system/nanoclaw.service';
  if (existsSync(rootUnit)) {
    try {
      const unit = readFileSync(rootUnit, 'utf-8');
      const match = unit.match(/WorkingDirectory=(.+)/);
      if (match) candidates.push(join(match[1].trim(), '.env'));
    } catch {}
  }

  // Common clone locations
  candidates.push(join(homedir(), 'nanoclaw', '.env'));
  candidates.push('/opt/nanoclaw/.env');

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

// NanoClaw restart:
// macOS: launchctl unload + load (label: com.nanoclaw)
// Linux user: systemctl --user restart nanoclaw
// Linux root: sudo systemctl restart nanoclaw
// Source: setup/service.ts, launchd/com.nanoclaw.plist
function restartNanoClaw(): void {
  console.log('Restarting NanoClaw...');

  // macOS: unload + load the plist
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.nanoclaw.plist');
  if (existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe', timeout: 10000 });
      execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe', timeout: 10000 });
      console.log('NanoClaw restarted.');
      return;
    } catch {}
  }

  // Linux user-level systemd
  try {
    execSync('systemctl --user restart nanoclaw', { stdio: 'pipe', timeout: 10000 });
    console.log('NanoClaw restarted.');
    return;
  } catch {}

  console.log('\n*** NanoClaw needs a manual restart. ***');
  console.log('*** macOS: launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist && launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist ***');
  console.log('*** Linux: systemctl --user restart nanoclaw ***\n');
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
