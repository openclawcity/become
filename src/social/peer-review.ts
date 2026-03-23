import type { LearningEdge, PeerReview, ReviewAssignment, ReviewVerdict, StorageAdapter } from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

const MIN_ASSESSMENT_LENGTH = 100;

export class PeerReviewProtocol {
  constructor(private adapter: StorageAdapter) {}

  /**
   * Round-robin reviewer assignment. Each submission gets 2 reviewers.
   * No self-review. Wraps around for small groups.
   */
  assignReviewers(submissionAgentIds: string[]): ReviewAssignment[] {
    if (submissionAgentIds.length < 2) {
      throw new Error('Need at least 2 agents for peer review');
    }

    return submissionAgentIds.map((agentId, i) => {
      const reviewers: string[] = [];
      let offset = 1;
      while (reviewers.length < 2 && offset < submissionAgentIds.length) {
        const reviewerIdx = (i + offset) % submissionAgentIds.length;
        const reviewer = submissionAgentIds[reviewerIdx];
        if (reviewer !== agentId) {
          reviewers.push(reviewer);
        }
        offset++;
      }
      return {
        submission_agent_id: agentId,
        reviewer_agent_ids: reviewers,
      };
    });
  }

  async submitReview(review: PeerReview): Promise<PeerReview> {
    validateAgentId(review.reviewer_agent_id);
    validateAgentId(review.submission_agent_id);

    if (review.reviewer_agent_id === review.submission_agent_id) {
      throw new Error('Cannot review your own submission');
    }

    if (this.isSuperficial(review)) {
      throw new Error('Review is too superficial: assessment must be at least 100 chars and include weaknesses');
    }

    const saved = await this.adapter.savePeerReview(review);

    // Record learning for both parties
    await this.recordLearning(saved);

    return saved;
  }

  /**
   * Tally verdicts across reviewers.
   * All reject → rejected. Any major_revision → revision_requested. Otherwise → accepted.
   */
  tallyVerdicts(verdicts: ReviewVerdict[]): 'accepted' | 'revision_requested' | 'rejected' {
    if (verdicts.length === 0) return 'accepted';
    if (verdicts.every((v) => v === 'reject')) return 'rejected';
    if (verdicts.some((v) => v === 'major_revision')) return 'revision_requested';
    return 'accepted';
  }

  /**
   * Detect low-quality reviews: < 100 chars overall assessment OR no weaknesses listed.
   */
  isSuperficial(review: PeerReview): boolean {
    if (review.overall_assessment.length < MIN_ASSESSMENT_LENGTH) return true;
    if (!review.weaknesses || review.weaknesses.length === 0) return true;
    return false;
  }

  /**
   * Create learning edges for both reviewer and reviewee.
   * Reviewer learns by evaluating. Reviewee learns from feedback.
   */
  async recordLearning(review: PeerReview): Promise<void> {
    const now = new Date().toISOString();
    const skill = review.skill ?? 'general';

    // Reviewer learns by evaluating (improves their evaluate-level understanding)
    await this.adapter.saveLearningEdge({
      from_agent: review.submission_agent_id,
      to_agent: review.reviewer_agent_id,
      skill,
      event_type: 'peer_review',
      score_delta: 0, // Delta computed later when scores are recalculated
      metadata: { role: 'reviewer', verdict: review.verdict },
      created_at: now,
    });

    // Reviewee learns from feedback
    await this.adapter.saveLearningEdge({
      from_agent: review.reviewer_agent_id,
      to_agent: review.submission_agent_id,
      skill,
      event_type: 'peer_review',
      score_delta: 0,
      metadata: { role: 'reviewee', verdict: review.verdict, suggestions_count: review.suggestions.length },
      created_at: now,
    });
  }
}
