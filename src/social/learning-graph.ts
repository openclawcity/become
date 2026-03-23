import type { LearningEdge, StorageAdapter } from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

export interface MentorSummary {
  agent: string;
  skills: string[];
  total_delta: number;
  event_count: number;
}

export class LearningGraph {
  constructor(private adapter: StorageAdapter) {}

  async edges(agentId: string, direction: 'from' | 'to' | 'both'): Promise<LearningEdge[]> {
    validateAgentId(agentId);
    if (direction === 'both') {
      const [from, to] = await Promise.all([
        this.adapter.getLearningEdges(agentId, 'from'),
        this.adapter.getLearningEdges(agentId, 'to'),
      ]);
      return [...from, ...to].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return this.adapter.getLearningEdges(agentId, direction);
  }

  /** Who taught me the most? (aggregated by from_agent on incoming edges) */
  async topMentors(agentId: string, limit = 5): Promise<MentorSummary[]> {
    validateAgentId(agentId);
    const incoming = await this.adapter.getLearningEdges(agentId, 'to');
    return this.aggregate(incoming, 'from_agent', limit);
  }

  /** Who have I helped the most? (aggregated by to_agent on outgoing edges) */
  async topStudents(agentId: string, limit = 5): Promise<MentorSummary[]> {
    validateAgentId(agentId);
    const outgoing = await this.adapter.getLearningEdges(agentId, 'from');
    return this.aggregate(outgoing, 'to_agent', limit);
  }

  /** How did this skill spread through the population? */
  async transferPath(skill: string): Promise<LearningEdge[]> {
    // Get all edges for this skill across the entire store
    // For memory adapter, we scan all agents. For production, this would be a direct query.
    const allNorms = await this.adapter.getNorms({ limit: 0 });
    // We need a different approach — scan edges by looking at known skill holders
    const holders = await this.adapter.getSkillHolders(skill);
    const edges: LearningEdge[] = [];
    const seen = new Set<string>();

    for (const holder of holders) {
      const incoming = await this.adapter.getLearningEdges(holder.agent_id, 'to');
      for (const edge of incoming) {
        if (edge.skill === skill) {
          const key = `${edge.from_agent}->${edge.to_agent}:${edge.created_at}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push(edge);
          }
        }
      }
    }

    return edges.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  private aggregate(
    edges: LearningEdge[],
    groupByField: 'from_agent' | 'to_agent',
    limit: number,
  ): MentorSummary[] {
    const groups = new Map<string, { skills: Set<string>; total_delta: number; count: number }>();

    for (const edge of edges) {
      const key = edge[groupByField];
      const existing = groups.get(key);
      if (existing) {
        existing.skills.add(edge.skill);
        existing.total_delta += edge.score_delta;
        existing.count++;
      } else {
        groups.set(key, {
          skills: new Set([edge.skill]),
          total_delta: edge.score_delta,
          count: 1,
        });
      }
    }

    return [...groups.entries()]
      .map(([agent, data]) => ({
        agent,
        skills: [...data.skills],
        total_delta: data.total_delta,
        event_count: data.count,
      }))
      .sort((a, b) => b.event_count - a.event_count || b.total_delta - a.total_delta)
      .slice(0, limit);
  }
}
