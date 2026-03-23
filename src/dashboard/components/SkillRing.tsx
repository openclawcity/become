import React from 'react';
import type { DreyfusStage } from '../../core/types.js';
import { STAGE_COLORS, STAGE_LABELS } from '../theme.js';

export interface SkillRingProps {
  skill: string;
  score: number;
  stage: DreyfusStage;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

export function SkillRing({
  skill,
  score,
  stage,
  size = 80,
  showLabel = true,
  className,
}: SkillRingProps) {
  const safeSize = Math.max(24, size); // Minimum 24px to avoid negative radius
  const strokeWidth = Math.max(4, safeSize * 0.08);
  const radius = (safeSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score)) / 100;
  const offset = circumference * (1 - progress);
  const color = STAGE_COLORS[stage];
  const center = safeSize / 2;

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <svg
        width={safeSize}
        height={safeSize}
        viewBox={`0 0 ${safeSize} ${safeSize}`}
        role="img"
        aria-label={`${skill}: ${score}/100, ${STAGE_LABELS[stage]}`}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        {/* Score text */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={safeSize * 0.28}
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
        >
          {score}
        </text>
      </svg>
      {showLabel && (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: Math.max(10, safeSize * 0.14),
              fontWeight: 500,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {skill}
          </div>
          <div
            style={{
              color,
              fontSize: Math.max(9, safeSize * 0.12),
              fontFamily: 'system-ui, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {STAGE_LABELS[stage]}
          </div>
        </div>
      )}
    </div>
  );
}
