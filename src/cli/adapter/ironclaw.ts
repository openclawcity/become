import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { BecomeConfig } from '../config.js';

const IRONCLAW_ENV = join(homedir(), '.ironclaw', '.env');
const BACKUP_PATH = join(homedir(), '.become', 'state', 'original_ironclaw.env');

export function patchIronClaw(config: BecomeConfig): void {
  if (!existsSync(IRONCLAW_ENV)) {
    throw new Error(`IronClaw .env not found at ${IRONCLAW_ENV}`);
  }

  // Backup
  mkdirSync(join(homedir(), '.become', 'state'), { recursive: true });
  copyFileSync(IRONCLAW_ENV, BACKUP_PATH);

  // Patch
  patchDotEnv(IRONCLAW_ENV, {
    LLM_BASE_URL: `http://127.0.0.1:${config.proxy_port}/v1`,
  });

  console.log('Restarting IronClaw...');
  try {
    execSync('ironclaw service restart', { stdio: 'pipe', timeout: 15000 });
    console.log('IronClaw restarted.');
  } catch {
    console.log('\n*** IronClaw needs a manual restart. ***');
    console.log('*** Run: ironclaw service restart ***\n');
  }
}

export function restoreIronClaw(): void {
  if (!existsSync(BACKUP_PATH)) {
    throw new Error('No backup found. Was become ever turned on?');
  }
  copyFileSync(BACKUP_PATH, IRONCLAW_ENV);
  console.log('Restarting IronClaw...');
  try {
    execSync('ironclaw service restart', { stdio: 'pipe', timeout: 15000 });
    console.log('IronClaw restarted.');
  } catch {
    console.log('\n*** IronClaw needs a manual restart. ***');
    console.log('*** Run: ironclaw service restart ***\n');
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
