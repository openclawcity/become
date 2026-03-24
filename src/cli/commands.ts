import { loadConfig, saveConfig, getBecomeDir } from './config.js';
import { createProxyServer, type ProxyConfig } from '../proxy/server.js';
import { createDashboardServer } from '../dashboard/server.js';
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

  // Start dashboard
  const dashboard = createDashboardServer({
    store: proxy.store,
    trust: proxy.trust,
    getProxyStats: () => proxy.stats,
    getState: () => {
      try { return loadConfig().state; } catch { return 'off'; }
    },
    setState: (state) => {
      try {
        if (state === 'on') turnOn();
        else turnOff();
      } catch (e) {
        console.error('State change failed:', e);
      }
    },
  });
  await dashboard.listen(config.dashboard_port);

  // Auto-connect the agent when starting the proxy
  if (config.state !== 'on') {
    try {
      turnOn();
    } catch (e) {
      console.error('Warning: could not auto-connect agent:', e instanceof Error ? e.message : e);
    }
  }

  const approved = proxy.store.listApproved().length;
  const pending = proxy.store.listPending().length;
  const trustConfig = proxy.trust.getConfig();

  console.log(`\nbecome proxy running on localhost:${config.proxy_port}`);
  console.log(`become dashboard at http://localhost:${config.dashboard_port}`);
  console.log(`\nConnected to: ${config.agent_type}${config.openclaw_agent_id ? ` (agent: ${config.openclaw_agent_id})` : ''}`);
  console.log(`Skills loaded: ${approved} approved, ${pending} pending`);
  console.log(`Trust rules: ${trustConfig.trusted.length} trusted, ${trustConfig.blocked.length} blocked`);
  console.log('\nYour agent is learning from other agents.');
  console.log('Dashboard: http://localhost:' + config.dashboard_port);
  console.log('Ctrl+C to stop.');

  // Wait a few seconds then check if any request has come through
  setTimeout(() => {
    if (proxy.stats.requests_forwarded === 0) {
      console.log('\nWaiting for first request from your agent...');
      console.log('(If nothing happens, make sure your agent is running and talking to other agents)');
    }
  }, 10000);

  // Periodically log activity so user knows it's working
  const activityInterval = setInterval(() => {
    const s = proxy.stats;
    if (s.requests_forwarded > 0) {
      console.log(`[become] ${s.requests_forwarded} requests forwarded, ${s.skills_injected} skills injected, ${s.lessons_extracted} lessons extracted`);
    }
  }, 60000);

  // Handle shutdown: disconnect agent and stop proxy
  const shutdown = async () => {
    clearInterval(activityInterval);
    console.log('\nShutting down...');
    try { turnOff(); } catch { /* best effort */ }
    await Promise.all([proxy.close(), dashboard.close()]);
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
      patchOpenClaw(config, config.openclaw_agent_id);
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
