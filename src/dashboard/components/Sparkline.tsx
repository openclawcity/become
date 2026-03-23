import React from 'react';
import type { DreyfusStage } from '../../core/types.js';
import { STAGE_COLORS } from '../theme.js';

export interface SparklinePoint {
  score: number;
  timestamp: string;
}

export interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  color?: DreyfusStage | string;
  showDots?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  width = 300,
  height = 40,
  color = '#22d3ee',
  showDots = false,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className={className} role="img" aria-label="Insufficient data">
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.3)" fontSize={10}>
          Not enough data
        </text>
      </svg>
    );
  }

  // Resolve color
  const strokeColor = color in STAGE_COLORS
    ? STAGE_COLORS[color as DreyfusStage]
    : color;

  // Compute points
  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const scores = data.map((d) => d.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 1;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((d.score - minScore) / range) * chartHeight;
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Gradient fill under the line
  const fillPoints = [
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${height - padding}`,
    `${points[0].x},${height - padding}`,
  ].join(' ');

  const gradientId = `sparkline-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Trend: ${scores[0]} to ${scores[scores.length - 1]}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon points={fillPoints} fill={`url(#${gradientId})`} />
      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots */}
      {showDots &&
        points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2}
            fill={strokeColor}
          />
        ))}
      {/* End dot (always shown) */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2.5}
        fill={strokeColor}
      />
    </svg>
  );
}
