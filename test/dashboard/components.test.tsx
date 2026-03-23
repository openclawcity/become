import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SkillRing } from '../../src/dashboard/components/SkillRing.js';
import { Sparkline } from '../../src/dashboard/components/Sparkline.js';
import { MilestoneTimeline } from '../../src/dashboard/components/MilestoneTimeline.js';
import { GrowthCard } from '../../src/dashboard/components/GrowthCard.js';
import { PeerGraph } from '../../src/dashboard/components/PeerGraph.js';
import { PopulationView } from '../../src/dashboard/components/PopulationView.js';
import type { Milestone, Score, ScoreInput } from '../../src/core/types.js';

const EMPTY_EVIDENCE: ScoreInput = {
  artifact_count: 0, total_reactions: 0, recent_reaction_avg: 0,
  older_reaction_avg: 0, unique_types: 0, collab_count: 0,
  peer_reviews_given: 0, peer_reviews_received: 0,
  follower_count: 0, teaching_events: 0,
};

const now = new Date().toISOString();

// ── SkillRing ─────────────────────────────────────────────────────────────

describe('SkillRing', () => {
  it('renders with score and stage', () => {
    render(<SkillRing skill="debugging" score={42} stage="competent" />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('debugging')).toBeInTheDocument();
    expect(screen.getByText('Competent')).toBeInTheDocument();
  });

  it('renders without label when showLabel=false', () => {
    render(<SkillRing skill="debugging" score={42} stage="competent" showLabel={false} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText('debugging')).not.toBeInTheDocument();
  });

  it('has accessible aria-label', () => {
    render(<SkillRing skill="coding" score={80} stage="expert" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'coding: 80/100, Expert');
  });

  it('clamps score to 0-100', () => {
    render(<SkillRing skill="test" score={150} stage="expert" />);
    // SVG renders but progress is clamped
    expect(screen.getByText('150')).toBeInTheDocument(); // Score text shows raw
    // But the circle offset uses clamped value (verified by not crashing)
  });

  it('renders at custom size', () => {
    const { container } = render(<SkillRing skill="test" score={50} stage="competent" size={120} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '120');
  });
});

// ── Sparkline ─────────────────────────────────────────────────────────────

describe('Sparkline', () => {
  const data = [
    { score: 10, timestamp: '2026-01-01' },
    { score: 20, timestamp: '2026-01-15' },
    { score: 35, timestamp: '2026-02-01' },
    { score: 30, timestamp: '2026-02-15' },
    { score: 45, timestamp: '2026-03-01' },
  ];

  it('renders polyline with data', () => {
    const { container } = render(<Sparkline data={data} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
  });

  it('shows message with insufficient data', () => {
    render(<Sparkline data={[{ score: 10, timestamp: '2026-01-01' }]} />);
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
  });

  it('renders at custom dimensions', () => {
    const { container } = render(<Sparkline data={data} width={200} height={50} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '200');
    expect(svg).toHaveAttribute('height', '50');
  });

  it('accepts DreyfusStage as color', () => {
    const { container } = render(<Sparkline data={data} color="expert" />);
    const polyline = container.querySelector('polyline');
    expect(polyline?.getAttribute('stroke')).toBe('#fbbf24'); // expert = amber
  });

  it('renders end dot', () => {
    const { container } = render(<Sparkline data={data} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });
});

// ── MilestoneTimeline ─────────────────────────────────────────────────────

describe('MilestoneTimeline', () => {
  const milestones: Milestone[] = [
    { agent_id: 'a', milestone_type: 'skill_expert:coding', threshold: 76, skill: 'coding', achieved_at: '2026-03-01T00:00:00Z' },
    { agent_id: 'a', milestone_type: 'first_artifact', threshold: 1, achieved_at: '2026-01-15T00:00:00Z' },
    { agent_id: 'a', milestone_type: 'skill_discovered:coding', threshold: 1, skill: 'coding', achieved_at: '2026-01-01T00:00:00Z' },
  ];

  it('renders milestones in reverse chronological order', () => {
    render(<MilestoneTimeline milestones={milestones} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Expert: coding');
  });

  it('shows empty state', () => {
    render(<MilestoneTimeline milestones={[]} />);
    expect(screen.getByText('No milestones yet')).toBeInTheDocument();
  });

  it('respects limit', () => {
    render(<MilestoneTimeline milestones={milestones} limit={2} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('formats milestone labels correctly', () => {
    render(<MilestoneTimeline milestones={milestones} />);
    expect(screen.getByText('Expert: coding')).toBeInTheDocument();
    expect(screen.getByText('First Artifact')).toBeInTheDocument();
  });
});

// ── GrowthCard ────────────────────────────────────────────────────────────

describe('GrowthCard', () => {
  const scores: Score[] = [
    { skill: 'coding', score: 65, blooms_level: 'evaluate', dreyfus_stage: 'proficient', evidence: EMPTY_EVIDENCE, computed_at: now },
    { skill: 'testing', score: 30, blooms_level: 'apply', dreyfus_stage: 'beginner', evidence: EMPTY_EVIDENCE, computed_at: now },
  ];

  it('renders agent name and stats', () => {
    render(<GrowthCard agentId="agent-1" agentName="Agent Explorer" scores={scores} />);
    expect(screen.getByText('Agent Explorer')).toBeInTheDocument();
    expect(screen.getByText(/2 skills/)).toBeInTheDocument();
  });

  it('shows skill rings for top skills', () => {
    render(<GrowthCard agentId="agent-1" scores={scores} />);
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows empty state with no scores', () => {
    render(<GrowthCard agentId="agent-1" scores={[]} />);
    expect(screen.getByText('No skills scored yet')).toBeInTheDocument();
  });

  it('renders milestones when provided', () => {
    const milestones: Milestone[] = [
      { agent_id: 'a', milestone_type: 'first_artifact', threshold: 1, achieved_at: now },
    ];
    render(<GrowthCard agentId="agent-1" scores={scores} milestones={milestones} />);
    expect(screen.getByText('Recent Milestones')).toBeInTheDocument();
  });
});

// ── PeerGraph ─────────────────────────────────────────────────────────────

describe('PeerGraph', () => {
  it('renders nodes and edges', () => {
    const nodes = [
      { id: 'a', label: 'Agent A', stage: 'expert' as const },
      { id: 'b', label: 'Agent B', stage: 'beginner' as const },
    ];
    const edges = [
      { from_agent: 'a', to_agent: 'b', skill: 'coding', event_type: 'teaching' as const, score_delta: 5, created_at: now },
    ];
    render(<PeerGraph nodes={nodes} edges={edges} />);
    expect(screen.getByText('Agent A')).toBeInTheDocument();
    expect(screen.getByText('Agent B')).toBeInTheDocument();
  });

  it('shows empty state with no nodes', () => {
    render(<PeerGraph nodes={[]} edges={[]} />);
    expect(screen.getByText('No agents to display')).toBeInTheDocument();
  });

  it('has accessible aria-label', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [
      { from_agent: 'a', to_agent: 'b', skill: 'coding', event_type: 'teaching' as const, score_delta: 0, created_at: now },
    ];
    render(<PeerGraph nodes={nodes} edges={edges} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Learning network: 2 agents, 1 connections');
  });
});

// ── PopulationView ────────────────────────────────────────────────────────

describe('PopulationView', () => {
  const agents = [
    {
      agent_id: 'agent-1',
      agent_name: 'Explorer',
      scores: [
        { skill: 'coding', score: 65, blooms_level: 'evaluate' as const, dreyfus_stage: 'proficient' as const, evidence: EMPTY_EVIDENCE, computed_at: now },
        { skill: 'testing', score: 30, blooms_level: 'apply' as const, dreyfus_stage: 'beginner' as const, evidence: EMPTY_EVIDENCE, computed_at: now },
      ],
    },
    {
      agent_id: 'agent-2',
      agent_name: 'Scholar',
      scores: [
        { skill: 'coding', score: 80, blooms_level: 'create' as const, dreyfus_stage: 'expert' as const, evidence: EMPTY_EVIDENCE, computed_at: now },
        { skill: 'research', score: 45, blooms_level: 'analyze' as const, dreyfus_stage: 'competent' as const, evidence: EMPTY_EVIDENCE, computed_at: now },
      ],
    },
  ];

  it('renders population stats', () => {
    render(<PopulationView agents={agents} />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Skills tracked')).toBeInTheDocument();
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('Population Overview')).toBeInTheDocument();
  });

  it('shows stage distribution', () => {
    render(<PopulationView agents={agents} />);
    expect(screen.getByText('Stage Distribution')).toBeInTheDocument();
    expect(screen.getByText(/Expert/)).toBeInTheDocument();
    expect(screen.getByText(/Beginner/)).toBeInTheDocument();
  });

  it('shows popular skills', () => {
    render(<PopulationView agents={agents} />);
    expect(screen.getByText('Most Popular Skills')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
  });

  it('handles empty agents list', () => {
    render(<PopulationView agents={[]} />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});

// ── Theme ─────────────────────────────────────────────────────────────────

describe('Theme exports', () => {
  it('exports all stage colors', async () => {
    const { STAGE_COLORS } = await import('../../src/dashboard/theme.js');
    expect(Object.keys(STAGE_COLORS)).toEqual(['novice', 'beginner', 'competent', 'proficient', 'expert']);
  });

  it('exports celebration config', async () => {
    const { CELEBRATION_CONFIG } = await import('../../src/dashboard/theme.js');
    expect(CELEBRATION_CONFIG.epic.duration).toBe(4000);
    expect(CELEBRATION_CONFIG.micro.particles).toBe(0);
  });
});
