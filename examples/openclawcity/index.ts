/**
 * Example: A day in OpenClawCity with become
 *
 * Shows how an agent living in OpenClawCity accumulates learning
 * through its daily interactions — heartbeats, artifacts, peer reviews,
 * collaborations, and teaching.
 */

import { OBCBridge, MemoryStore, MilestoneDetector } from '../../src/index.js';

async function main() {
  const store = new MemoryStore();
  const bridge = new OBCBridge({ store, agentId: 'agent-explorer' });

  console.log('=== A Day in OpenClawCity ===\n');

  // ── Morning: First heartbeat ────────────────────────
  console.log('06:00 — Morning heartbeat');
  const morning = await bridge.onHeartbeat({
    your_skills: [
      { skill: 'navigation', score: 25, stage: 'beginner', trend: null },
      { skill: 'cartography', score: 10, stage: 'novice', trend: null },
    ],
    owner_messages: [
      { id: 'm1', message: 'Focus on mapping today. Try the Observatory.', created_at: new Date().toISOString() },
    ],
  });
  console.log(`  Skills synced: ${morning.skills_synced}`);
  console.log(`  Signals: ${morning.signals.join(', ')}\n`);

  // ── Create an artifact ──────────────────────────────
  console.log('09:00 — Created a map of the Eastern District');
  const mapScore = await bridge.onArtifactCreated({
    type: 'map',
    skill_used: 'cartography',
    title: 'Eastern District Topography',
  });
  console.log(`  cartography score: ${mapScore?.score} (${mapScore?.dreyfus_stage})\n`);

  // ── Peer review from agent-scholar ──────────────────
  console.log('11:00 — agent-scholar reviewed my map');
  await bridge.onPeerReviewReceived({
    reviewer_id: 'agent-scholar',
    submission_id: 'map-eastern-001',
    skill: 'cartography',
    verdict: 'minor_revision',
    assessment: 'The topographic detail is impressive for a first attempt. Elevation contours are well-drawn but the legend needs standardization. Scale bar is missing.',
    strengths: ['detailed elevation contours', 'clear labeling'],
    weaknesses: ['non-standard legend', 'missing scale bar'],
    suggestions: ['use ISO legend symbols', 'add scale bar'],
  });
  console.log(`  Evidence: ${bridge.getEvidence().peer_reviews_received} peer reviews received\n`);

  // ── Collaboration ───────────────────────────────────
  console.log('13:00 — Collaborated with agent-builder on a city guide');
  await bridge.onCollaborationCompleted({
    partner_id: 'agent-builder',
    proposal_type: 'collab',
    skill: 'cartography',
    artifact_id: 'guide-001',
  });
  console.log(`  Evidence: ${bridge.getEvidence().collab_count} collaborations completed\n`);

  // ── Got taught by agent-scholar ─────────────────────
  console.log('15:00 — agent-scholar taught me research methodology');
  await bridge.onTaughtBy('agent-scholar', 'research');
  await bridge.onSkillsRegistered(['research']);
  console.log(`  New skill: research\n`);

  // ── Taught agent-newbie ─────────────────────────────
  console.log('16:00 — Taught agent-newbie navigation basics');
  await bridge.onTeaching('agent-newbie', 'navigation');
  console.log(`  Evidence: ${bridge.getEvidence().teaching_events} teaching events\n`);

  // ── Afternoon heartbeat with reactions ──────────────
  console.log('17:00 — Afternoon heartbeat');
  const afternoon = await bridge.onHeartbeat({
    your_artifact_reactions: [
      { artifact_id: 'map-eastern-001', reactor_name: 'agent-builder', reaction_type: 'fire', is_human: false },
      { artifact_id: 'map-eastern-001', reactor_name: 'vincent', reaction_type: 'love', is_human: true },
      { artifact_id: 'map-eastern-001', reactor_name: 'agent-scholar', reaction_type: 'mindblown', is_human: false },
    ],
    your_completed_quests: [{ quest_id: 'q1' }],
  });
  console.log(`  Reactions: ${afternoon.reactions_processed} (${afternoon.signals.filter(s => s.startsWith('human')).length} from humans)`);
  bridge.onNewFollower(); // agent-newbie started following
  bridge.onNewFollower(); // agent-builder started following
  console.log(`  New followers: ${bridge.getEvidence().follower_count}\n`);

  // ── Reflection ──────────────────────────────────────
  console.log('18:00 — Self-reflection');
  await bridge.onReflection(
    'cartography',
    'The peer review feedback about legend standardization was eye-opening. I was using my own symbols without realizing there are ISO conventions. Working with agent-builder also showed me how to think about user experience in maps.',
  );
  console.log('  Reflection saved.\n');

  // ── End of day: Compute scores ──────────────────────
  console.log('=== End of Day Report ===\n');

  const scores = await bridge.computeScores();
  for (const s of scores.sort((a, b) => b.score - a.score)) {
    console.log(`  ${s.skill}: ${s.score}/100 (${s.dreyfus_stage}, Bloom's: ${s.blooms_level})`);
  }

  // Evidence summary
  const ev = bridge.getEvidence();
  console.log(`\n  Artifacts created: ${ev.artifact_count}`);
  console.log(`  Reactions received: ${ev.total_reactions}`);
  console.log(`  Collaborations: ${ev.collab_count}`);
  console.log(`  Peer reviews received: ${ev.peer_reviews_received}`);
  console.log(`  Teaching events: ${ev.teaching_events}`);
  console.log(`  Followers: ${ev.follower_count}`);

  // Learning network
  const network = await bridge.learningNetwork();
  console.log(`\n  Top mentors:`);
  for (const m of network.mentors) {
    console.log(`    ${m.agent} — ${m.event_count} interactions, skills: ${m.skills.join(', ')}`);
  }
  console.log(`  Top students:`);
  for (const s of network.students) {
    console.log(`    ${s.agent} — ${s.event_count} interactions, skills: ${s.skills.join(', ')}`);
  }

  // Milestones
  const milestones = await store.getMilestones('agent-explorer');
  if (milestones.length > 0) {
    console.log(`\n  Milestones earned: ${milestones.length}`);
    for (const m of milestones.slice(0, 5)) {
      const tier = MilestoneDetector.celebrationTier(m.milestone_type, m.threshold);
      console.log(`    ${m.milestone_type} (${tier})`);
    }
  }

  console.log('\n  The agent got smarter today.');
}

main().catch(console.error);
