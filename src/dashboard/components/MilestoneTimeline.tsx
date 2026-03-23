import React from 'react';
import type { CelebrationTier, Milestone } from '../../core/types.js';
import { MilestoneDetector } from '../../core/milestones.js';
import { STAGE_COLORS, GOLD } from '../theme.js';

export interface MilestoneTimelineProps {
  milestones: Milestone[];
  limit?: number;
  className?: string;
}

function formatMilestoneLabel(type: string): string {
  // "skill_expert:debugging" → "Expert: debugging"
  // "first_artifact" → "First Artifact"
  if (type.includes(':')) {
    const [prefix, skill] = type.split(':');
    const stage = prefix.replace('skill_', '');
    return `${stage.charAt(0).toUpperCase() + stage.slice(1)}: ${skill}`;
  }
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function tierColor(tier: CelebrationTier): string {
  switch (tier) {
    case 'epic': return GOLD;
    case 'large': return STAGE_COLORS.proficient;
    case 'medium': return STAGE_COLORS.competent;
    case 'small': return STAGE_COLORS.beginner;
    default: return 'rgba(255,255,255,0.3)';
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function MilestoneTimeline({
  milestones,
  limit = 10,
  className,
}: MilestoneTimelineProps) {
  const sorted = [...milestones]
    .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))
    .slice(0, limit);

  if (sorted.length === 0) {
    return (
      <div className={className} style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'system-ui, sans-serif', padding: 16 }}>
        No milestones yet
      </div>
    );
  }

  return (
    <div className={className} style={{ position: 'relative', paddingLeft: 20 }} role="list" aria-label="Milestone timeline">
      {/* Vertical line */}
      <div
        style={{
          position: 'absolute',
          left: 7,
          top: 4,
          bottom: 4,
          width: 2,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 1,
        }}
      />
      {sorted.map((m, i) => {
        const tier = MilestoneDetector.celebrationTier(m.milestone_type, m.threshold);
        const color = tierColor(tier);
        return (
          <div
            key={`${m.milestone_type}-${m.achieved_at}-${i}`}
            role="listitem"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 12,
              position: 'relative',
            }}
          >
            {/* Dot */}
            <div
              style={{
                position: 'absolute',
                left: -16,
                top: 4,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: color,
                border: `2px solid ${color}`,
                boxShadow: tier === 'epic' ? `0 0 8px ${color}` : undefined,
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {formatMilestoneLabel(m.milestone_type)}
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 11,
                  fontFamily: 'system-ui, sans-serif',
                  marginTop: 2,
                }}
              >
                {formatDate(m.achieved_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
