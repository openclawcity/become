import { Become, MemoryStore, computeFullScore, MilestoneDetector } from '../../src/index.js';

async function main() {
  // 1. Initialize with in-memory store
  const become = new Become({ store: new MemoryStore() });

  // 2. Register skills for two agents
  await become.skills.upsert('agent-explorer', { name: 'navigation', category: 'spatial' });
  await become.skills.upsert('agent-explorer', { name: 'cartography', category: 'creative' });
  await become.skills.upsert('agent-scholar', { name: 'research', category: 'academic' });
  await become.skills.upsert('agent-scholar', { name: 'navigation', category: 'spatial' });

  console.log('Skills registered.');

  // 3. Score agent-explorer's navigation skill
  const explorerNav = computeFullScore('navigation', {
    artifact_count: 8,
    total_reactions: 20,
    recent_reaction_avg: 4,
    older_reaction_avg: 2,
    unique_types: 3,
    collab_count: 2,
    peer_reviews_given: 1,
    peer_reviews_received: 2,
    follower_count: 5,
    teaching_events: 1,
  });

  console.log(`\nagent-explorer / navigation:`);
  console.log(`  Score: ${explorerNav.score}`);
  console.log(`  Stage: ${explorerNav.dreyfus_stage}`);
  console.log(`  Bloom's: ${explorerNav.blooms_level}`);

  // 4. Score agent-scholar's research skill
  const scholarResearch = computeFullScore('research', {
    artifact_count: 12,
    total_reactions: 35,
    recent_reaction_avg: 5,
    older_reaction_avg: 2,
    unique_types: 4,
    collab_count: 3,
    peer_reviews_given: 5,
    peer_reviews_received: 4,
    follower_count: 8,
    teaching_events: 2,
  });

  console.log(`\nagent-scholar / research:`);
  console.log(`  Score: ${scholarResearch.score}`);
  console.log(`  Stage: ${scholarResearch.dreyfus_stage}`);
  console.log(`  Bloom's: ${scholarResearch.blooms_level}`);

  // 5. Write reflections
  await become.reflector.reflect('agent-explorer', {
    skill: 'navigation',
    reflection: 'I have learned that mapping terrain before moving through it saves time and reduces backtracking significantly.',
  });

  await become.reflector.reflect('agent-scholar', {
    skill: 'research',
    reflection: 'Peer reviewing others sharpened my own analytical skills more than I expected.',
  });

  console.log('\nReflections recorded.');

  // 6. Check milestones
  const explorerMilestones = await become.milestones.check('agent-explorer', [explorerNav]);
  const scholarMilestones = await become.milestones.check('agent-scholar', [scholarResearch]);

  console.log(`\nagent-explorer milestones: ${explorerMilestones.length}`);
  for (const m of explorerMilestones) {
    const tier = MilestoneDetector.celebrationTier(m.milestone_type, m.threshold);
    console.log(`  ${m.milestone_type} (${tier})`);
  }

  console.log(`\nagent-scholar milestones: ${scholarMilestones.length}`);
  for (const m of scholarMilestones) {
    const tier = MilestoneDetector.celebrationTier(m.milestone_type, m.threshold);
    console.log(`  ${m.milestone_type} (${tier})`);
  }

  // 7. Observe patterns
  const observations = become.reflector.observe({
    agent_id: 'agent-explorer',
    declared_role: 'agent-explorer',
    artifacts: Array(8).fill({ type: 'map' }),
    collabs_started: 3,
    collabs_completed: 2,
    skills: ['navigation', 'cartography'],
    quest_completions: 4,
    follower_count: 5,
  });

  console.log(`\nagent-explorer observations: ${observations.length}`);
  for (const o of observations) {
    console.log(`  [${o.type}] ${o.text}`);
  }

  // 8. Suggest new skills
  // Need 3 adopters for auto-verify
  await become.skills.upsert('agent-a', { name: 'music_composition' });
  await become.skills.upsert('agent-b', { name: 'music_composition' });
  await become.skills.upsert('agent-c', { name: 'music_composition' });

  const suggestions = await become.skills.suggest('agent-explorer');
  console.log(`\nSuggested skills for agent-explorer: ${suggestions.join(', ')}`);
}

main().catch(console.error);
