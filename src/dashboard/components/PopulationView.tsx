import React from 'react';
import type { DreyfusStage, Score } from '../../core/types.js';
import { BACKGROUND, BORDER, STAGE_COLORS, STAGE_LABELS } from '../theme.js';

export interface PopulationAgent {
  agent_id: string;
  agent_name?: string;
  scores: Score[];
}

export interface PopulationViewProps {
  agents: PopulationAgent[];
  className?: string;
}

export function PopulationView({ agents, className }: PopulationViewProps) {
  // Compute population stats
  const allScores = agents.flatMap((a) => a.scores);
  const avgScore = allScores.length > 0
    ? Math.round(allScores.reduce((s, sc) => s + sc.score, 0) / allScores.length)
    : 0;

  // Stage distribution
  const stageDist: Record<DreyfusStage, number> = {
    novice: 0, beginner: 0, competent: 0, proficient: 0, expert: 0,
  };
  for (const s of allScores) {
    stageDist[s.dreyfus_stage]++;
  }

  const totalSkills = allScores.length;

  // Skill popularity
  const skillCounts = new Map<string, number>();
  for (const s of allScores) {
    skillCounts.set(s.skill, (skillCounts.get(s.skill) ?? 0) + 1);
  }
  const topSkills = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div
      className={className}
      style={{
        background: BACKGROUND.panel,
        border: `1px solid ${BORDER.subtle}`,
        borderRadius: 12,
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
        color: 'white',
        maxWidth: 500,
        backdropFilter: 'blur(20px) saturate(1.5)',
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
        Population Overview
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <Stat label="Agents" value={agents.length} />
        <Stat label="Skills tracked" value={totalSkills} />
        <Stat label="Avg score" value={avgScore} />
      </div>

      {/* Stage distribution bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
          Stage Distribution
        </div>
        {totalSkills > 0 ? (
          <>
            <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden' }}>
              {(Object.entries(stageDist) as [DreyfusStage, number][])
                .filter(([, count]) => count > 0)
                .map(([stage, count]) => (
                  <div
                    key={stage}
                    style={{
                      width: `${(count / totalSkills) * 100}%`,
                      background: STAGE_COLORS[stage],
                      minWidth: 2,
                    }}
                    title={`${STAGE_LABELS[stage]}: ${count}`}
                  />
                ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              {(Object.entries(stageDist) as [DreyfusStage, number][])
                .filter(([, count]) => count > 0)
                .map(([stage, count]) => (
                  <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: STAGE_COLORS[stage] }} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                      {STAGE_LABELS[stage]} ({count})
                    </span>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No data</div>
        )}
      </div>

      {/* Top skills */}
      {topSkills.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            Most Popular Skills
          </div>
          {topSkills.map(([skill, count]) => {
            const pct = totalSkills > 0 ? (count / totalSkills) * 100 : 0;
            return (
              <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 80, fontSize: 12, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skill}
                </div>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#22d3ee', borderRadius: 3, minWidth: 2 }} />
                </div>
                <div style={{ width: 24, fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</div>
    </div>
  );
}
