import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

const BACKUP_PATH = join(homedir(), '.become', 'state', 'original_nanoclaw.env');

export function patchNanoClaw(config: BecomeConfig): void {
  const envPath = findNanoClawEnv();
  if (!envPath) {
    throw new Error('Could not find NanoClaw .env. Set ANTHROPIC_BASE_URL manually to http://127.0.0.1:' + config.proxy_port);
  }

  // Backup
  mkdirSync(join(homedir(), '.become', 'state'), { recursive: true });
  copyFileSync(envPath, BACKUP_PATH);

  // Patch
  patchDotEnv(envPath, {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${config.proxy_port}`,
  });

  // Restart
  restartNanoClaw();
}

export function restoreNanoClaw(): void {
  const envPath = findNanoClawEnv();
  if (!existsSync(BACKUP_PATH) || !envPath) {
    throw new Error('No backup found. Was become ever turned on?');
  }
  copyFileSync(BACKUP_PATH, envPath);
  restartNanoClaw();
}

function findNanoClawEnv(): string | null {
  // Check common locations
  const candidates = [
    join(homedir(), '.nanoclaw', '.env'),
    join(homedir(), '.config', 'nanoclaw', '.env'),
  ];

  // Check launchd plist for macOS
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'ai.nanoclaw.agent.plist');
  if (existsSync(plistPath)) {
    try {
      const plist = readFileSync(plistPath, 'utf-8');
      const match = plist.match(/<string>([^<]*\.env)<\/string>/);
      if (match) candidates.unshift(match[1]);
    } catch {}
  }

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function restartNanoClaw(): void {
  console.log('Restarting NanoClaw...');
  try {
    // Try launchctl first (macOS)
    execSync('launchctl kickstart -k gui/$(id -u)/ai.nanoclaw.agent', { stdio: 'pipe', timeout: 15000 });
    console.log('NanoClaw restarted.');
  } catch {
    try {
      // Try systemd (Linux)
      execSync('systemctl --user restart nanoclaw', { stdio: 'pipe', timeout: 15000 });
      console.log('NanoClaw restarted.');
    } catch {
      console.log('\n*** NanoClaw needs a manual restart. ***');
      console.log('*** macOS: launchctl kickstart -k gui/$(id -u)/ai.nanoclaw.agent ***');
      console.log('*** Linux: systemctl --user restart nanoclaw ***\n');
    }
  }
}

function patchDotEnv(path: string, vars: Record<string, string>): void {
  let content = readFileSync(path, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  writeFileSync(path, content, 'utf-8');
}
