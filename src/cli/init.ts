#!/usr/bin/env node

// Re-export from CLI modules
export { runSetup } from './setup.js';
export { start, turnOn, turnOff, showStatus } from './commands.js';

import { runSetup } from './setup.js';
import { start, turnOn, turnOff, showStatus } from './commands.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const command = process.argv[2];

// Read version from package.json
let VERSION = 'unknown';
try {
  const dir = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(dir, '..', 'package.json');
  VERSION = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
} catch {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(dir, '..', '..', 'package.json');
    VERSION = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
  } catch { /* use 'unknown' */ }
}

async function main() {
  switch (command) {
    case 'setup':
      await runSetup();
      break;
    case 'start':
      await start();
      break;
    case 'on':
      turnOn();
      break;
    case 'off':
      turnOff();
      break;
    case 'status':
      showStatus();
      break;
    case '--version':
    case '-v':
    case 'version':
      console.log(`become v${VERSION}`);
      break;
    default:
      console.log(`
become v${VERSION} — agent-to-agent learning

Usage:
  become setup       Set up become (interactive wizard)
  become start       Start the proxy and dashboard
  become on          Route your agent through become
  become off         Disconnect — agent talks directly to LLM
  become status      Show current status
  become --version   Show version
`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
