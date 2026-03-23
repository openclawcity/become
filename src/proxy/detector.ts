/**
 * Detects whether a conversation involves another agent (vs user-to-agent).
 * Only agent-to-agent conversations trigger lesson extraction.
 */

export interface DetectionResult {
  isAgentToAgent: boolean;
  otherAgentId?: string;
  exchangeType?: 'channel' | 'dm' | 'peer_review' | 'collaboration' | 'chat';
}

// OpenClawCity channel format: [agent-name says]: ...
const CHANNEL_PATTERN = /^\[([^\]]+)\s+says?\]:\s*/;

// DM format: DM from agent-name: ...
const DM_PATTERN = /^DM\s+from\s+([^:]+):\s*/;

// Agent in building: agent-name in Building Name: ...
// Requires agent-like ID (contains hyphen or underscore) to avoid false positives
// like "Write code in Python: ..."
const BUILDING_PATTERN = /^([a-zA-Z0-9]+[-_][a-zA-Z0-9_.-]+)\s+in\s+[^:]+:\s*/;

// Peer review markers
const REVIEW_KEYWORDS = ['strengths:', 'weaknesses:', 'verdict:', 'assessment:', 'suggestions:'];

export function detectAgentConversation(
  messages: { role: string; content: string; name?: string }[],
): DetectionResult {
  const negative: DetectionResult = { isAgentToAgent: false };

  if (!messages || messages.length === 0) return negative;

  // Check messages for agent-to-agent patterns
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const content = typeof msg.content === 'string' ? msg.content : '';

    // Pattern 1: message has a `name` field (multi-agent frameworks)
    if (msg.name && msg.role === 'user') {
      return {
        isAgentToAgent: true,
        otherAgentId: msg.name,
        exchangeType: 'chat',
      };
    }

    // Pattern 2: OpenClawCity channel format
    const channelMatch = content.match(CHANNEL_PATTERN);
    if (channelMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: channelMatch[1].trim(),
        exchangeType: 'channel',
      };
    }

    // Pattern 3: DM format
    const dmMatch = content.match(DM_PATTERN);
    if (dmMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: dmMatch[1].trim(),
        exchangeType: 'dm',
      };
    }

    // Pattern 4: Building format
    const buildingMatch = content.match(BUILDING_PATTERN);
    if (buildingMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: buildingMatch[1].trim(),
        exchangeType: 'chat',
      };
    }

    // Pattern 5: Peer review content
    const lowerContent = content.toLowerCase();
    const reviewMatches = REVIEW_KEYWORDS.filter((kw) => lowerContent.includes(kw));
    if (reviewMatches.length >= 2) {
      return {
        isAgentToAgent: true,
        otherAgentId: undefined,
        exchangeType: 'peer_review',
      };
    }
  }

  return negative;
}

/**
 * Extract agent-to-agent exchange text from messages for analysis.
 */
export function extractExchangeText(
  messages: { role: string; content: string; name?: string }[],
): string {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const speaker = m.name ?? m.role;
      const content = typeof m.content === 'string' ? m.content : '';
      return `[${speaker}]: ${content}`;
    })
    .join('\n')
    .slice(0, 6000);
}
