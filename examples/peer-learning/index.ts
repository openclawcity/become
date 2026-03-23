import {
  Become, MemoryStore, computeFullScore,
  PeerReviewProtocol, TeachingProtocol, LearningGraph,
  MilestoneDetector, getReputationLevel,
} from '../../src/index.js';

async function main() {
  const store = new MemoryStore();
  const become = new Become({ store });
  const reviews = new PeerReviewProtocol(store);
  const teaching = new TeachingProtocol(store);
  const graph = new LearningGraph(store);

  // ── 1. Two agents register skills ──────────────────────────────
  await become.skills.upsert('agent-scholar', { name: 'research', category: 'academic' });
  await become.skills.upsert('agent-scholar', { name: 'writing', category: 'creative' });
  await become.skills.upsert('agent-explorer', { name: 'research', category: 'academic' });
  await become.skills.upsert('agent-explorer', { name: 'navigation', category: 'spatial' });

  console.log('Skills registered for both agents.\n');

  // ── 2. Score their work ────────────────────────────────────────
  const scholarScore = computeFullScore('research', {
    artifact_count: 10, total_reactions: 25,
    recent_reaction_avg: 4, older_reaction_avg: 2,
    unique_types: 3, collab_count: 2,
    peer_reviews_given: 3, peer_reviews_received: 2,
    follower_count: 5, teaching_events: 1,
  });

  const explorerScore = computeFullScore('research', {
    artifact_count: 4, total_reactions: 8,
    recent_reaction_avg: 3, older_reaction_avg: 2,
    unique_types: 2, collab_count: 1,
    peer_reviews_given: 0, peer_reviews_received: 1,
    follower_count: 2, teaching_events: 0,
  });

  console.log(`agent-scholar / research: score=${scholarScore.score} stage=${scholarScore.dreyfus_stage}`);
  console.log(`agent-explorer / research: score=${explorerScore.score} stage=${explorerScore.dreyfus_stage}\n`);

  // ── 3. Peer review: scholar reviews explorer's work ────────────
  const assignments = reviews.assignReviewers(['agent-scholar', 'agent-explorer']);
  console.log('Review assignments:');
  for (const a of assignments) {
    console.log(`  ${a.submission_agent_id} reviewed by: ${a.reviewer_agent_ids.join(', ')}`);
  }

  await reviews.submitReview({
    reviewer_agent_id: 'agent-scholar',
    submission_agent_id: 'agent-explorer',
    submission_id: 'explorer-paper-1',
    skill: 'research',
    verdict: 'minor_revision',
    overall_assessment: 'The research methodology is sound but the literature review needs expansion. The experimental design shows promise but lacks control variables that would strengthen the conclusions significantly.',
    strengths: ['clear hypothesis', 'good data collection'],
    weaknesses: ['incomplete literature review', 'missing control variables'],
    suggestions: ['add 3 more references', 'include a control group'],
  });

  await reviews.submitReview({
    reviewer_agent_id: 'agent-explorer',
    submission_agent_id: 'agent-scholar',
    submission_id: 'scholar-paper-1',
    skill: 'research',
    verdict: 'accept',
    overall_assessment: 'Excellent research with thorough methodology and well-supported conclusions. The analysis is rigorous and the presentation is clear. Minor formatting issues but nothing that affects the substance of the work.',
    strengths: ['rigorous analysis', 'clear presentation', 'well-supported conclusions'],
    weaknesses: ['minor formatting issues in tables'],
    suggestions: ['fix table alignment'],
  });

  console.log('\nPeer reviews submitted.\n');

  // ── 4. Tally verdicts ──────────────────────────────────────────
  const scholarVerdict = reviews.tallyVerdicts(['accept']);
  const explorerVerdict = reviews.tallyVerdicts(['minor_revision']);
  console.log(`Verdict for agent-scholar: ${scholarVerdict}`);
  console.log(`Verdict for agent-explorer: ${explorerVerdict}\n`);

  // ── 5. Teaching: scholar teaches explorer ───────────────────────
  await teaching.teach('agent-scholar', 'agent-explorer', 'research', {
    description: 'How to structure a literature review',
  });
  console.log('agent-scholar taught agent-explorer about research.\n');

  // ── 6. Learning graph ──────────────────────────────────────────
  const explorerMentors = await graph.topMentors('agent-explorer');
  console.log('agent-explorer top mentors:');
  for (const m of explorerMentors) {
    console.log(`  ${m.agent} — ${m.event_count} events, skills: ${m.skills.join(', ')}`);
  }

  const scholarStudents = await graph.topStudents('agent-scholar');
  console.log('\nagent-scholar top students:');
  for (const s of scholarStudents) {
    console.log(`  ${s.agent} — ${s.event_count} events, skills: ${s.skills.join(', ')}`);
  }

  // ── 7. Check milestones ────────────────────────────────────────
  const scholarMilestones = await become.milestones.check('agent-scholar', [scholarScore]);
  const explorerMilestones = await become.milestones.check('agent-explorer', [explorerScore]);

  console.log(`\nagent-scholar milestones: ${scholarMilestones.length}`);
  for (const m of scholarMilestones) {
    console.log(`  ${m.milestone_type} (${MilestoneDetector.celebrationTier(m.milestone_type)})`);
  }

  console.log(`\nagent-explorer milestones: ${explorerMilestones.length}`);
  for (const m of explorerMilestones) {
    console.log(`  ${m.milestone_type} (${MilestoneDetector.celebrationTier(m.milestone_type)})`);
  }

  // ── 8. Reputation ──────────────────────────────────────────────
  await store.grantReputation('agent-scholar', 30, 'research', 'completed research');
  await store.grantReputation('agent-explorer', 10, 'quest', 'completed quest');

  const scholarRep = getReputationLevel(await store.getReputation('agent-scholar'));
  const explorerRep = getReputationLevel(await store.getReputation('agent-explorer'));

  console.log(`\nagent-scholar reputation: ${scholarRep.score} (${scholarRep.tier})`);
  console.log(`agent-explorer reputation: ${explorerRep.score} (${explorerRep.tier})`);
}

main().catch(console.error);
