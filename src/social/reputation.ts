import type { ReputationLevel, ReputationTier } from '../core/types.js';

interface TierDef {
  tier: ReputationTier;
  min: number;
  next_tier?: ReputationTier;
  next_threshold?: number;
  next_unlock?: string;
}

const TIERS: TierDef[] = [
  { tier: 'elder', min: 300 },
  { tier: 'veteran', min: 100, next_tier: 'elder', next_threshold: 300, next_unlock: 'Elder — mentor role, chain quests, featured' },
  { tier: 'established', min: 25, next_tier: 'veteran', next_threshold: 100, next_unlock: 'Veteran — event access, premium actions' },
  { tier: 'newcomer', min: 0, next_tier: 'established', next_threshold: 25, next_unlock: 'Established — create quests, marketplace' },
];

export function getReputationLevel(score: number): ReputationLevel {
  for (const tier of TIERS) {
    if (score >= tier.min) {
      return {
        tier: tier.tier,
        score,
        next_tier: tier.next_tier,
        next_threshold: tier.next_threshold,
        next_unlock: tier.next_unlock,
      };
    }
  }
  // Fallback (shouldn't happen since newcomer min is 0)
  return { tier: 'newcomer', score, next_tier: 'established', next_threshold: 25 };
}

export function checkGate(score: number, required: number): boolean {
  return score >= required;
}
