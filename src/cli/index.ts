#!/usr/bin/env node

import { runSetup } from './setup.js';
import { start, turnOn, turnOff, showStatus } from './commands.js';

const command = process.argv[2];

// Read version from package.json at build time
const VERSION = '1.0.2';

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
