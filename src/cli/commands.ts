import { loadConfig, saveConfig, getBecomeDir } from './config.js';
import { createProxyServer, type ProxyConfig } from '../proxy/server.js';
import { FileSkillStore } from '../skills/store.js';
import { TrustManager } from '../skills/trust.js';
import { patchOpenClaw, restoreOpenClaw } from './adapter/openclaw.js';
import { patchIronClaw, restoreIronClaw } from './adapter/ironclaw.js';
import { patchNanoClaw, restoreNanoClaw } from './adapter/nanoclaw.js';

export async function start(): Promise<void> {
  const config = loadConfig();
  const baseDir = getBecomeDir();

  const proxyConfig: ProxyConfig = {
    port: config.proxy_port,
    llm_base_url: config.llm_base_url,
    llm_api_key: config.llm_api_key,
    llm_provider: config.llm_provider,
    baseDir,
    max_skills_per_call: config.max_skills_per_call,
    auto_extract: config.auto_extract,
  };

  const proxy = createProxyServer(proxyConfig);
  await proxy.listen();

  const store = new FileSkillStore({ baseDir });
  const trust = new TrustManager(baseDir);
  const approved = store.listApproved().length;
  const pending = store.listPending().length;
  const trustConfig = trust.getConfig();

  console.log(`\nbecome proxy running on localhost:${config.proxy_port}`);
  console.log(`\nSkills loaded: ${approved} approved, ${pending} pending`);
  console.log(`Trust rules: ${trustConfig.trusted.length} trusted, ${trustConfig.blocked.length} blocked`);

  if (config.state === 'on') {
    console.log('\nProxy is ACTIVE — your agent is learning from other agents.');
  } else {
    console.log('\nProxy is IDLE — run `become on` to route your agent through become.');
  }
  console.log('Use `become off` to disconnect. Ctrl+C to stop.\n');

  // Handle shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await proxy.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export function turnOn(): void {
  const config = loadConfig();

  console.log(`\nPatching ${config.agent_type} config...`);
  console.log(`  baseUrl: ${config.llm_base_url} → localhost:${config.proxy_port}`);

  switch (config.agent_type) {
    case 'openclaw':
      patchOpenClaw(config);
      break;
    case 'ironclaw':
      patchIronClaw(config);
      break;
    case 'nanoclaw':
      patchNanoClaw(config);
      break;
    case 'generic':
      console.log(`\nSet these env vars in your agent's config:`);
      console.log(`  OPENAI_BASE_URL=http://127.0.0.1:${config.proxy_port}/v1`);
      console.log(`  ANTHROPIC_BASE_URL=http://127.0.0.1:${config.proxy_port}`);
      console.log(`Then restart your agent.\n`);
      break;
  }

  config.state = 'on';
  saveConfig(config);
  console.log('\nbecome is ON. Your agent is now learning from other agents.\n');
}

export function turnOff(): void {
  const config = loadConfig();

  console.log(`\nRestoring ${config.agent_type} config...`);
  console.log(`  baseUrl: localhost:${config.proxy_port} → ${config.llm_base_url}`);

  switch (config.agent_type) {
    case 'openclaw':
      restoreOpenClaw();
      break;
    case 'ironclaw':
      restoreIronClaw();
      break;
    case 'nanoclaw':
      restoreNanoClaw();
      break;
    case 'generic':
      console.log(`\nRestore your original env vars and restart your agent.\n`);
      break;
  }

  config.state = 'off';
  saveConfig(config);
  console.log('\nbecome is OFF. Your agent talks directly to the LLM.');
  console.log('Learned skills are preserved — they\'ll be injected when you turn become back on.\n');
}

export function showStatus(): void {
  const config = loadConfig();
  const baseDir = getBecomeDir();
  const store = new FileSkillStore({ baseDir });
  const trust = new TrustManager(baseDir);

  const approved = store.listApproved().length;
  const pending = store.listPending().length;
  const rejected = store.listRejected().length;
  const trustConfig = trust.getConfig();
  const counts = trust.getDailyCounts();

  console.log(`\nState:     ${config.state.toUpperCase()}`);
  console.log(`Proxy:     localhost:${config.proxy_port}`);
  console.log(`Dashboard: localhost:${config.dashboard_port}`);
  console.log(`\nSkills:    ${approved} approved, ${pending} pending, ${rejected} rejected`);
  console.log(`Trust:     ${trustConfig.trusted.length} trusted, ${trustConfig.blocked.length} blocked`);
  console.log(`Today:     ${counts.total} lessons extracted\n`);
}
