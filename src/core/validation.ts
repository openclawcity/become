const MAX_AGENT_ID_LENGTH = 200;
const AGENT_ID_REGEX = /^[a-zA-Z0-9_.:@/-]+$/;

export function validateAgentId(agentId: string): void {
  if (!agentId || typeof agentId !== 'string') {
    throw new Error('agentId is required and must be a non-empty string');
  }
  if (agentId.length > MAX_AGENT_ID_LENGTH) {
    throw new Error(`agentId too long (max ${MAX_AGENT_ID_LENGTH} chars)`);
  }
  if (!AGENT_ID_REGEX.test(agentId)) {
    throw new Error('agentId contains invalid characters (allowed: alphanumeric, _ . : @ / -)');
  }
}
