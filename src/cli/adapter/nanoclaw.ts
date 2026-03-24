import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

const BACKUP_PATH = join(homedir(), '.become', 'state', 'original_nanoclaw.env');
const PATCHED_ENV_PATH_FILE = join(homedir(), '.become', 'state', 'nanoclaw_env_path.txt');

export function patchNanoClaw(config: BecomeConfig): void {
  const envPath = findNanoClawEnv();
  if (!envPath) {
    throw new Error('Could not find NanoClaw .env. Set ANTHROPIC_BASE_URL manually to http://127.0.0.1:' + config.proxy_port);
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

  // Patch
  patchDotEnv(envPath, {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${config.proxy_port}`,
  });

  // Restart
  restartNanoClaw();
}

export function restoreNanoClaw(): void {
  if (!existsSync(BACKUP_PATH)) {
    return;
  }

  // Use stored path (not re-discovered) to avoid restoring to wrong file
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

  // Check launchd plist for macOS: extract WorkingDirectory
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.nanoclaw.plist');
  if (existsSync(plistPath)) {
    try {
      const plist = readFileSync(plistPath, 'utf-8');
      const match = plist.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)<\/string>/);
      if (match) candidates.push(join(match[1], '.env'));
    } catch {}
  }

  // Check systemd unit for Linux: extract WorkingDirectory
  const unitPath = join(homedir(), '.config', 'systemd', 'user', 'nanoclaw.service');
  if (existsSync(unitPath)) {
    try {
      const unit = readFileSync(unitPath, 'utf-8');
      const match = unit.match(/WorkingDirectory=(.+)/);
      if (match) candidates.push(join(match[1].trim(), '.env'));
    } catch {}
  }

  // Common install locations
  candidates.push(join(homedir(), 'nanoclaw', '.env'));
  candidates.push('/opt/nanoclaw/.env');

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function restartNanoClaw(): void {
  console.log('Restarting NanoClaw...');
  try {
    execSync('launchctl kickstart -k gui/$(id -u)/com.nanoclaw', { stdio: 'pipe', timeout: 15000 });
    console.log('NanoClaw restarted.');
  } catch {
    try {
      execSync('systemctl --user restart nanoclaw', { stdio: 'pipe', timeout: 15000 });
      console.log('NanoClaw restarted.');
    } catch {
      console.log('\n*** NanoClaw needs a manual restart. ***');
      console.log('*** macOS: launchctl kickstart -k gui/$(id -u)/com.nanoclaw ***');
      console.log('*** Linux: systemctl --user restart nanoclaw ***\n');
    }
  }
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
