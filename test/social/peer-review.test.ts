import { describe, it, expect, beforeEach } from 'vitest';
import { PeerReviewProtocol } from '../../src/social/peer-review.js';
import { MemoryStore } from '../../src/adapters/memory.js';

let store: MemoryStore;
let protocol: PeerReviewProtocol;

beforeEach(() => {
  store = new MemoryStore();
  protocol = new PeerReviewProtocol(store);
});

describe('assignReviewers', () => {
  it('assigns 2 reviewers per submission', () => {
    const assignments = protocol.assignReviewers(['a', 'b', 'c', 'd']);
    for (const a of assignments) {
      expect(a.reviewer_agent_ids).toHaveLength(2);
    }
  });

  it('no self-review', () => {
    const assignments = protocol.assignReviewers(['a', 'b', 'c', 'd']);
    for (const a of assignments) {
      expect(a.reviewer_agent_ids).not.toContain(a.submission_agent_id);
    }
  });

  it('wraps around for small groups', () => {
    const assignments = protocol.assignReviewers(['a', 'b', 'c']);
    for (const a of assignments) {
      expect(a.reviewer_agent_ids).toHaveLength(2);
      expect(a.reviewer_agent_ids).not.toContain(a.submission_agent_id);
    }
  });

  it('works with exactly 2 agents', () => {
    const assignments = protocol.assignReviewers(['a', 'b']);
    expect(assignments[0].reviewer_agent_ids).toEqual(['b']);
    expect(assignments[1].reviewer_agent_ids).toEqual(['a']);
  });

  it('throws with fewer than 2 agents', () => {
    expect(() => protocol.assignReviewers(['a'])).toThrow('at least 2');
    expect(() => protocol.assignReviewers([])).toThrow('at least 2');
  });
});

describe('submitReview', () => {
  it('saves a valid review', async () => {
    const review = await protocol.submitReview({
      reviewer_agent_id: 'agent-1',
      submission_agent_id: 'agent-2',
      submission_id: 's1',
      skill: 'coding',
      verdict: 'accept',
      overall_assessment: 'This is a thorough and well-structured analysis that demonstrates clear understanding of the problem space and proposes a viable solution.',
      strengths: ['clear structure', 'good examples'],
      weaknesses: ['could be more concise'],
      suggestions: ['add diagrams'],
    });
    expect(review.id).toBeDefined();
  });

  it('rejects self-review', async () => {
    await expect(protocol.submitReview({
      reviewer_agent_id: 'agent-1',
      submission_agent_id: 'agent-1',
      submission_id: 's1',
      verdict: 'accept',
      overall_assessment: 'x'.repeat(100),
      strengths: ['a'],
      weaknesses: ['b'],
      suggestions: [],
    })).rejects.toThrow('own submission');
  });

  it('rejects superficial review', async () => {
    await expect(protocol.submitReview({
      reviewer_agent_id: 'agent-1',
      submission_agent_id: 'agent-2',
      submission_id: 's1',
      verdict: 'accept',
      overall_assessment: 'LGTM',
      strengths: ['ok'],
      weaknesses: [],
      suggestions: [],
    })).rejects.toThrow('superficial');
  });

  it('creates learning edges for both parties', async () => {
    await protocol.submitReview({
      reviewer_agent_id: 'agent-1',
      submission_agent_id: 'agent-2',
      submission_id: 's1',
      skill: 'coding',
      verdict: 'minor_revision',
      overall_assessment: 'x'.repeat(100),
      strengths: ['good'],
      weaknesses: ['needs work on error handling'],
      suggestions: ['add try-catch'],
    });

    // Reviewer (agent-1) should have an incoming edge from agent-2
    const reviewerEdges = await store.getLearningEdges('agent-1', 'to');
    expect(reviewerEdges).toHaveLength(1);
    expect(reviewerEdges[0].event_type).toBe('peer_review');

    // Reviewee (agent-2) should have an incoming edge from agent-1
    const revieweeEdges = await store.getLearningEdges('agent-2', 'to');
    expect(revieweeEdges).toHaveLength(1);
  });
});

describe('tallyVerdicts', () => {
  it('returns accepted when all accept', () => {
    expect(protocol.tallyVerdicts(['accept', 'accept'])).toBe('accepted');
  });

  it('returns accepted for minor revisions', () => {
    expect(protocol.tallyVerdicts(['accept', 'minor_revision'])).toBe('accepted');
  });

  it('returns revision_requested for any major', () => {
    expect(protocol.tallyVerdicts(['accept', 'major_revision'])).toBe('revision_requested');
  });

  it('returns rejected when all reject', () => {
    expect(protocol.tallyVerdicts(['reject', 'reject'])).toBe('rejected');
  });

  it('returns accepted for empty verdicts', () => {
    expect(protocol.tallyVerdicts([])).toBe('accepted');
  });

  it('returns revision_requested not rejected when mixed with major', () => {
    expect(protocol.tallyVerdicts(['reject', 'major_revision'])).toBe('revision_requested');
  });
});

describe('isSuperficial', () => {
  it('detects short assessment', () => {
    expect(protocol.isSuperficial({
      reviewer_agent_id: 'a', submission_agent_id: 'b', submission_id: 's',
      verdict: 'accept', overall_assessment: 'LGTM',
      strengths: ['ok'], weaknesses: ['something'], suggestions: [],
    })).toBe(true);
  });

  it('detects missing weaknesses', () => {
    expect(protocol.isSuperficial({
      reviewer_agent_id: 'a', submission_agent_id: 'b', submission_id: 's',
      verdict: 'accept', overall_assessment: 'x'.repeat(100),
      strengths: ['ok'], weaknesses: [], suggestions: [],
    })).toBe(true);
  });

  it('passes thorough review', () => {
    expect(protocol.isSuperficial({
      reviewer_agent_id: 'a', submission_agent_id: 'b', submission_id: 's',
      verdict: 'accept', overall_assessment: 'x'.repeat(100),
      strengths: ['ok'], weaknesses: ['needs improvement'], suggestions: [],
    })).toBe(false);
  });
});
