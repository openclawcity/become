#!/usr/bin/env node

import { runSetup } from './setup.js';
import { start, turnOn, turnOff, showStatus } from './commands.js';

const command = process.argv[2];

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
    default:
      console.log(`
become — agent-to-agent learning

Usage:
  become setup     Set up become (interactive wizard)
  become start     Start the proxy server
  become on        Route your agent through become
  become off       Disconnect — agent talks directly to LLM
  become status    Show current status
`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
