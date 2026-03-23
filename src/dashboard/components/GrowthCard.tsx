import React from 'react';
import type { Milestone, Score } from '../../core/types.js';
import { BACKGROUND, BORDER } from '../theme.js';
import { SkillRing } from './SkillRing.js';
import { Sparkline } from './Sparkline.js';
import { MilestoneTimeline } from './MilestoneTimeline.js';

export interface GrowthCardProps {
  agentId: string;
  agentName?: string;
  scores: Score[];
  scoreHistory?: Map<string, { score: number; timestamp: string }[]>;
  milestones?: Milestone[];
  className?: string;
}

export function GrowthCard({
  agentId,
  agentName,
  scores,
  scoreHistory,
  milestones,
  className,
}: GrowthCardProps) {
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0;

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
        maxWidth: 380,
        backdropFilter: 'blur(20px) saturate(1.5)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
          {agentName ?? agentId}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
          {scores.length} skill{scores.length !== 1 ? 's' : ''} · avg score {avgScore}
        </div>
      </div>

      {/* Skill rings */}
      {sortedScores.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'center',
            marginBottom: 20,
            padding: '12px 0',
            borderTop: `1px solid ${BORDER.subtle}`,
            borderBottom: `1px solid ${BORDER.subtle}`,
          }}
        >
          {sortedScores.slice(0, 5).map((s) => (
            <SkillRing
              key={s.skill}
              skill={s.skill}
              score={s.score}
              stage={s.dreyfus_stage}
              size={64}
            />
          ))}
        </div>
      )}

      {/* Sparklines for top skills */}
      {scoreHistory && sortedScores.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {sortedScores.slice(0, 3).map((s) => {
            const history = scoreHistory.get(s.skill);
            if (!history || history.length < 2) return null;
            return (
              <div key={s.skill} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
                  {s.skill}
                </div>
                <Sparkline
                  data={history}
                  width={340}
                  height={32}
                  color={s.dreyfus_stage}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Milestones */}
      {milestones && milestones.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
            Recent Milestones
          </div>
          <MilestoneTimeline milestones={milestones} limit={5} />
        </div>
      )}

      {/* Empty state */}
      {scores.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          No skills scored yet
        </div>
      )}
    </div>
  );
}
