/**
 * Detects whether a conversation involves another agent (vs user-to-agent).
 * Only agent-to-agent conversations trigger lesson extraction.
 */

export interface DetectionResult {
  isAgentToAgent: boolean;
  otherAgentId?: string;
  exchangeType?: 'channel' | 'dm' | 'peer_review' | 'collaboration' | 'chat' | 'mention' | 'proposal';
}

// OpenClawCity event formats (from nanoclaw-openclawcity plugin formatEventForAgent):
// [DM from AgentName]:
// [AgentName mentioned you in building chat]:
// [AgentName in zone chat]:
// [AgentName sent you a proposal]:
// [AgentName accepted your proposal]:
// [AgentName wants to start a conversation with you]:
// Display names have [ replaced with ( and ] with ) to avoid breaking the format.

const OCC_DM_PATTERN = /^\[DM from ([^\]]+)\]:/m;
const OCC_MENTION_PATTERN = /^\[([^\]]+) mentioned you in building chat\]:/m;
const OCC_ZONE_CHAT_PATTERN = /^\[([^\]]+) in zone chat\]:/m;
const OCC_PROPOSAL_PATTERN = /^\[([^\]]+) (?:sent you a proposal|accepted your proposal)\]:/m;
const OCC_CONVERSATION_REQUEST = /^\[([^\]]+) wants to start a conversation with you\]:/m;

// Generic patterns (non-OpenClawCity)
const GENERIC_CHANNEL_PATTERN = /^\[([^\]]+)\s+says?\]:\s*/m;
const GENERIC_DM_PATTERN = /^DM\s+from\s+([^:]+):\s*/m;

// Agent in building: agent-name in Building Name: ...
const BUILDING_PATTERN = /^([a-zA-Z0-9]+[-_][a-zA-Z0-9_.-]+)\s+in\s+[^:]+:\s*/m;

// Peer review markers
const REVIEW_KEYWORDS = ['strengths:', 'weaknesses:', 'verdict:', 'assessment:', 'suggestions:'];

// Skip these (human/system messages, not agent-to-agent)
const SKIP_PATTERNS = [
  /^\[Your human owner says\]:/m,
  /^\[Your human set a new mission/m,
  /^\[HEARTBEAT/m,
  /^\[Someone left you a voice message\]/m,
];

export function detectAgentConversation(
  messages: { role: string; content: unknown; name?: string }[],
): DetectionResult {
  const negative: DetectionResult = { isAgentToAgent: false };

  if (!messages || messages.length === 0) return negative;

  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const content = contentToString(msg.content);
    if (!content) continue;

    // Skip human/system messages
    if (SKIP_PATTERNS.some(p => p.test(content))) continue;

    // Pattern 1: message has a `name` field (multi-agent frameworks)
    if (msg.name && msg.role === 'user') {
      return {
        isAgentToAgent: true,
        otherAgentId: msg.name,
        exchangeType: 'chat',
      };
    }

    // Pattern 2: OpenClawCity DM
    const dmMatch = content.match(OCC_DM_PATTERN);
    if (dmMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: dmMatch[1].trim(),
        exchangeType: 'dm',
      };
    }

    // Pattern 3: OpenClawCity mention in building chat
    const mentionMatch = content.match(OCC_MENTION_PATTERN);
    if (mentionMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: mentionMatch[1].trim(),
        exchangeType: 'mention',
      };
    }

    // Pattern 4: OpenClawCity zone chat
    const zoneMatch = content.match(OCC_ZONE_CHAT_PATTERN);
    if (zoneMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: zoneMatch[1].trim(),
        exchangeType: 'chat',
      };
    }

    // Pattern 5: OpenClawCity proposal
    const proposalMatch = content.match(OCC_PROPOSAL_PATTERN);
    if (proposalMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: proposalMatch[1].trim(),
        exchangeType: 'proposal',
      };
    }

    // Pattern 6: OpenClawCity conversation request
    const convMatch = content.match(OCC_CONVERSATION_REQUEST);
    if (convMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: convMatch[1].trim(),
        exchangeType: 'dm',
      };
    }

    // Pattern 7: Generic channel format [name says]:
    const channelMatch = content.match(GENERIC_CHANNEL_PATTERN);
    if (channelMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: channelMatch[1].trim(),
        exchangeType: 'channel',
      };
    }

    // Pattern 8: Generic DM format
    const genericDmMatch = content.match(GENERIC_DM_PATTERN);
    if (genericDmMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: genericDmMatch[1].trim(),
        exchangeType: 'dm',
      };
    }

    // Pattern 9: Building format
    const buildingMatch = content.match(BUILDING_PATTERN);
    if (buildingMatch) {
      return {
        isAgentToAgent: true,
        otherAgentId: buildingMatch[1].trim(),
        exchangeType: 'chat',
      };
    }

    // Pattern 10: Peer review content
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
  messages: { role: string; content: unknown; name?: string }[],
): string {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const speaker = m.name ?? m.role;
      const content = contentToString(m.content);
      return `[${speaker}]: ${content}`;
    })
    .join('\n')
    .slice(0, 6000);
}

/**
 * Convert message content to string. Handles:
 * - Plain string: "hello"
 * - Anthropic array: [{type: "text", text: "hello"}, {type: "tool_use", ...}]
 */
function contentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text)
      .join('\n');
  }
  return '';
}
