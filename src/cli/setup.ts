import * as readline from 'node:readline';
import { saveConfig, LLM_DEFAULTS, type BecomeConfig } from './config.js';
import { listOpenClawAgents } from './adapter/openclaw.js';

const AGENT_TYPES = ['openclaw', 'ironclaw', 'nanoclaw', 'generic'] as const;
const LLM_PROVIDERS = ['anthropic', 'openai', 'ollama', 'openrouter', 'custom'] as const;

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function runSetup(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\nWelcome to become — agent-to-agent learning.\n');

    // Agent type
    console.log('Which agent runtime are you using?');
    AGENT_TYPES.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    const agentChoice = await ask(rl, '> ');
    const agentIdx = parseInt(agentChoice, 10) - 1;
    const agent_type = AGENT_TYPES[agentIdx] ?? 'openclaw';

    // If OpenClaw, ask which agent to connect
    let openclaw_agent_id: string | undefined;
    if (agent_type === 'openclaw') {
      const agents = listOpenClawAgents();
      if (agents.length > 1) {
        console.log('\nWhich OpenClaw agent should learn from other agents?');
        agents.forEach((a, i) => console.log(`  ${i + 1}. ${a.id} (${a.model})`));
        const agentPick = await ask(rl, '> ');
        const pickIdx = parseInt(agentPick, 10) - 1;
        const picked = agents[pickIdx];
        if (picked && picked.id !== '_defaults') {
          openclaw_agent_id = picked.id;
        }
      } else if (agents.length === 1 && agents[0].id !== '_defaults') {
        openclaw_agent_id = agents[0].id;
        console.log(`\nOpenClaw agent: ${openclaw_agent_id} (${agents[0].model})`);
      }
    }

    // LLM provider
    console.log('\nWhich LLM provider does your agent use?');
    LLM_PROVIDERS.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    const llmChoice = await ask(rl, '> ');
    const llmIdx = parseInt(llmChoice, 10) - 1;
    const llm_provider = LLM_PROVIDERS[llmIdx] ?? 'anthropic';

    // API key
    const llm_api_key = await ask(rl, '\nYour API key: ');
    if (!llm_api_key.trim()) {
      console.log('API key is required.');
      process.exit(1);
    }

    // Base URL
    const defaultUrl = LLM_DEFAULTS[llm_provider]?.base_url ?? '';
    let llm_base_url = defaultUrl;
    if (llm_provider === 'custom' || !defaultUrl) {
      llm_base_url = await ask(rl, 'LLM base URL: ');
    }

    // Ports
    const portInput = await ask(rl, `\nProxy port (default 30001): `);
    const proxy_port = parseInt(portInput, 10) || 30001;
    const dashInput = await ask(rl, `Dashboard port (default 30002): `);
    const dashboard_port = parseInt(dashInput, 10) || 30002;

    const config: BecomeConfig = {
      agent_type,
      openclaw_agent_id,
      llm_provider,
      llm_base_url,
      llm_api_key: llm_api_key.trim(),
      proxy_port,
      dashboard_port,
      auto_extract: true,
      max_skills_per_call: 15,
      max_lessons_per_day: 20,
      state: 'off',
    };

    saveConfig(config);

    console.log('\nConfig saved to ~/.become/config.json');
    console.log('Run `become start` to start the proxy and dashboard.');
    console.log('Run `become on` to route your agent through become.\n');
  } finally {
    rl.close();
  }
}
