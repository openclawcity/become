import type { CelebrationTier, DreyfusStage } from '../core/types.js';

export const STAGE_COLORS: Record<DreyfusStage, string> = {
  novice: '#64748b',
  beginner: '#22d3ee',
  competent: '#34d399',
  proficient: '#a78bfa',
  expert: '#fbbf24',
};

export const STAGE_LABELS: Record<DreyfusStage, string> = {
  novice: 'Novice',
  beginner: 'Beginner',
  competent: 'Competent',
  proficient: 'Proficient',
  expert: 'Expert',
};

export const BACKGROUND = {
  panel: 'rgba(10, 12, 20, 0.94)',
  card: 'rgba(255, 255, 255, 0.03)',
  hover: 'rgba(255, 255, 255, 0.06)',
};

export const BORDER = {
  subtle: 'rgba(0, 212, 255, 0.15)',
  accent: 'rgba(0, 212, 255, 0.3)',
};

export const ACCENT = '#00d4ff';
export const GOLD = 'rgba(255, 215, 0, 0.8)';

export const CELEBRATION_CONFIG: Record<CelebrationTier, { particles: number; spread: number; duration: number }> = {
  micro: { particles: 0, spread: 0, duration: 0 },
  small: { particles: 20, spread: 50, duration: 1000 },
  medium: { particles: 60, spread: 70, duration: 1500 },
  large: { particles: 80, spread: 90, duration: 2000 },
  epic: { particles: 120, spread: 120, duration: 4000 },
};
