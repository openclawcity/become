import React, { useMemo } from 'react';
import type { LearningEdge } from '../../core/types.js';
import { ACCENT, STAGE_COLORS } from '../theme.js';

export interface PeerGraphNode {
  id: string;
  label?: string;
  stage?: keyof typeof STAGE_COLORS;
}

export interface PeerGraphProps {
  nodes: PeerGraphNode[];
  edges: LearningEdge[];
  width?: number;
  height?: number;
  className?: string;
}

interface LayoutNode extends PeerGraphNode {
  x: number;
  y: number;
}

export function PeerGraph({
  nodes,
  edges,
  width = 400,
  height = 300,
  className,
}: PeerGraphProps) {
  // Layout nodes in a circle
  const layout = useMemo((): LayoutNode[] => {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 40;

    return nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      return {
        ...node,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
  }, [nodes, width, height]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const n of layout) map.set(n.id, n);
    return map;
  }, [layout]);

  // Aggregate edges for line thickness
  const edgeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      const key = [e.from_agent, e.to_agent].sort().join('↔');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [edges]);

  if (nodes.length === 0) {
    return (
      <svg width={width} height={height} className={className}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={13}>
          No agents to display
        </text>
      </svg>
    );
  }

  // Deduplicated edges for rendering
  const renderedEdges = new Set<string>();

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Learning network: ${nodes.length} agents, ${edges.length} connections`}
    >
      {/* Edges */}
      {edges.map((e, i) => {
        const key = [e.from_agent, e.to_agent].sort().join('↔');
        if (renderedEdges.has(key)) return null;
        renderedEdges.add(key);

        const from = nodeMap.get(e.from_agent);
        const to = nodeMap.get(e.to_agent);
        if (!from || !to) return null;

        const count = edgeCounts.get(key) ?? 1;
        const strokeWidth = Math.min(4, 0.5 + count * 0.5);

        return (
          <line
            key={`edge-${key}-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={ACCENT}
            strokeWidth={strokeWidth}
            strokeOpacity={0.3 + Math.min(0.4, count * 0.1)}
          />
        );
      })}

      {/* Nodes */}
      {layout.map((node) => {
        const color = node.stage ? STAGE_COLORS[node.stage] : ACCENT;
        const edgeCount = edges.filter(
          (e) => e.from_agent === node.id || e.to_agent === node.id,
        ).length;
        const radius = Math.min(20, 8 + edgeCount * 1.5);

        return (
          <g key={node.id}>
            {/* Glow */}
            <circle cx={node.x} cy={node.y} r={radius + 4} fill={color} opacity={0.1} />
            {/* Node */}
            <circle cx={node.x} cy={node.y} r={radius} fill={color} opacity={0.8} />
            {/* Label */}
            <text
              x={node.x}
              y={node.y + radius + 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              fontSize={10}
              fontFamily="system-ui, sans-serif"
            >
              {node.label ?? node.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
