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

  // Pre-compute deduplicated edges and per-node edge counts
  const { edgeCounts, dedupedEdges, nodeEdgeCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    const deduped: { key: string; edge: (typeof edges)[0]; count: number }[] = [];
    const seen = new Set<string>();
    const nodeCounts = new Map<string, number>();

    for (const e of edges) {
      const key = [e.from_agent, e.to_agent].sort().join('\u2194');
      counts.set(key, (counts.get(key) ?? 0) + 1);
      nodeCounts.set(e.from_agent, (nodeCounts.get(e.from_agent) ?? 0) + 1);
      nodeCounts.set(e.to_agent, (nodeCounts.get(e.to_agent) ?? 0) + 1);
    }

    for (const e of edges) {
      const key = [e.from_agent, e.to_agent].sort().join('\u2194');
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push({ key, edge: e, count: counts.get(key) ?? 1 });
      }
    }

    return { edgeCounts: counts, dedupedEdges: deduped, nodeEdgeCounts: nodeCounts };
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

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Learning network: ${nodes.length} agents, ${edges.length} connections`}
    >
      {/* Edges (pre-deduplicated) */}
      {dedupedEdges.map(({ key, edge, count }) => {
        const from = nodeMap.get(edge.from_agent);
        const to = nodeMap.get(edge.to_agent);
        if (!from || !to) return null;

        const strokeWidth = Math.min(4, 0.5 + count * 0.5);

        return (
          <line
            key={`edge-${key}`}
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

      {/* Nodes (edge counts pre-computed) */}
      {layout.map((node) => {
        const color = node.stage ? STAGE_COLORS[node.stage] : ACCENT;
        const edgeCount = nodeEdgeCounts.get(node.id) ?? 0;
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
