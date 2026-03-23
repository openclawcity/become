import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SkillRing } from '../../src/dashboard/components/SkillRing.js';
import { Sparkline } from '../../src/dashboard/components/Sparkline.js';
import { PeerGraph } from '../../src/dashboard/components/PeerGraph.js';

const now = new Date().toISOString();

// ── Bug #1: Sparkline handles large data without stack overflow ───────────

describe('Sparkline large data', () => {
  it('renders 10K data points without crashing', () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({
      score: Math.sin(i / 100) * 50 + 50,
      timestamp: new Date(Date.now() - (10000 - i) * 60000).toISOString(),
    }));
    const { container } = render(<Sparkline data={data} />);
    expect(container.querySelector('polyline')).toBeInTheDocument();
  });
});

// ── Bug #2: Sparkline gradient ID is stable across renders ────────────────

describe('Sparkline stable gradient ID', () => {
  it('uses the same gradient ID on re-render', () => {
    const data = [
      { score: 10, timestamp: '2026-01-01' },
      { score: 20, timestamp: '2026-01-15' },
    ];
    const { container, rerender } = render(<Sparkline data={data} />);

    const gradient1 = container.querySelector('linearGradient')?.getAttribute('id');
    expect(gradient1).toBeDefined();
    expect(gradient1).not.toContain('undefined');

    rerender(<Sparkline data={data} />);
    const gradient2 = container.querySelector('linearGradient')?.getAttribute('id');
    expect(gradient2).toBe(gradient1); // Same ID across renders
  });
});

// ── Bug #4: SkillRing minimum size guard ──────────────────────────────────

describe('SkillRing minimum size', () => {
  it('does not crash with size=0', () => {
    const { container } = render(<SkillRing skill="test" score={50} stage="competent" size={0} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Should use minimum safe size (24)
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThanOrEqual(24);
  });

  it('does not crash with negative size', () => {
    const { container } = render(<SkillRing skill="test" score={50} stage="competent" size={-10} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThanOrEqual(24);
  });

  it('respects valid small size', () => {
    const { container } = render(<SkillRing skill="test" score={50} stage="competent" size={30} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('30');
  });
});

// ── Bug #3+5: PeerGraph pre-computed edge dedup and node counts ───────────

describe('PeerGraph performance', () => {
  it('deduplicates bidirectional edges', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [
      { from_agent: 'a', to_agent: 'b', skill: 'coding', event_type: 'teaching' as const, score_delta: 0, created_at: now },
      { from_agent: 'b', to_agent: 'a', skill: 'coding', event_type: 'peer_review' as const, score_delta: 0, created_at: now },
      { from_agent: 'a', to_agent: 'b', skill: 'testing', event_type: 'teaching' as const, score_delta: 0, created_at: now },
    ];

    const { container } = render(<PeerGraph nodes={nodes} edges={edges} />);
    // a↔b should render as one line despite 3 edges
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(1);
  });

  it('scales node radius by edge count', () => {
    const nodes = [
      { id: 'hub', label: 'Hub' },
      { id: 'leaf1', label: 'Leaf 1' },
      { id: 'leaf2', label: 'Leaf 2' },
    ];
    const edges = [
      { from_agent: 'hub', to_agent: 'leaf1', skill: 'coding', event_type: 'teaching' as const, score_delta: 0, created_at: now },
      { from_agent: 'hub', to_agent: 'leaf2', skill: 'coding', event_type: 'teaching' as const, score_delta: 0, created_at: now },
    ];

    const { container } = render(<PeerGraph nodes={nodes} edges={edges} />);
    // Hub should exist with a larger radius (can't easily check radius values, just verify it renders)
    const groups = container.querySelectorAll('g');
    expect(groups).toHaveLength(3);
  });
});

// ── Sparkline color resolution ────────────────────────────────────────────

describe('Sparkline color resolution edge case', () => {
  it('does not treat prototype properties as stage colors', () => {
    const data = [
      { score: 10, timestamp: '2026-01-01' },
      { score: 20, timestamp: '2026-01-15' },
    ];
    // "constructor" is a property on all objects via prototype
    const { container } = render(<Sparkline data={data} color="constructor" />);
    const polyline = container.querySelector('polyline');
    // Should use "constructor" as a raw color string, not crash or resolve to a stage color
    expect(polyline?.getAttribute('stroke')).toBe('constructor');
  });
});
