import React, { useId } from 'react';
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

  // Resolve color — use hasOwnProperty to avoid prototype key collisions
  const strokeColor = Object.prototype.hasOwnProperty.call(STAGE_COLORS, color)
    ? STAGE_COLORS[color as DreyfusStage]
    : color;

  // Compute points
  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const scores = data.map((d) => d.score);
  let minScore = scores[0];
  let maxScore = scores[0];
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] < minScore) minScore = scores[i];
    if (scores[i] > maxScore) maxScore = scores[i];
  }
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

  const reactId = useId();
  const gradientId = `sparkline-grad-${reactId.replace(/:/g, '')}`;

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
