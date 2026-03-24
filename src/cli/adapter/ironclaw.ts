import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
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

  // Don't patch twice
  if (existsSync(BACKUP_PATH)) {
    console.log('become is already connected to IronClaw. Run `become off` first.');
    return;
  }

  // Backup
  mkdirSync(join(homedir(), '.become', 'state'), { recursive: true });
  copyFileSync(IRONCLAW_ENV, BACKUP_PATH);

  // Patch
  patchDotEnv(IRONCLAW_ENV, {
    LLM_BASE_URL: `http://127.0.0.1:${config.proxy_port}`,
  });

  console.log('Restarting IronClaw...');
  try {
    execSync('ironclaw daemon restart', { stdio: 'pipe', timeout: 15000 });
    console.log('IronClaw restarted.');
  } catch {
    console.log('\n*** IronClaw needs a manual restart. ***');
    console.log('*** Run: ironclaw daemon restart ***\n');
  }
}

export function restoreIronClaw(): void {
  if (!existsSync(BACKUP_PATH)) {
    // Nothing to restore
    return;
  }
  copyFileSync(BACKUP_PATH, IRONCLAW_ENV);
  try { unlinkSync(BACKUP_PATH); } catch {}

  console.log('Restarting IronClaw...');
  try {
    execSync('ironclaw daemon restart', { stdio: 'pipe', timeout: 15000 });
    console.log('IronClaw restarted.');
  } catch {
    console.log('\n*** IronClaw needs a manual restart. ***');
    console.log('*** Run: ironclaw daemon restart ***\n');
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
