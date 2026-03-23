import type { DreyfusStage, LearningEdge, Skill, StorageAdapter } from '../core/types.js';
import { validateAgentId } from '../core/validation.js';

export interface TeachingContext {
  artifact_id?: string;
  description?: string;
}

export interface TeacherCandidate {
  agent_id: string;
  skill: string;
  score: number;
  stage: DreyfusStage;
}

export interface StudentCandidate {
  agent_id: string;
  skill: string;
  score: number;
  stage: DreyfusStage;
}

const STAGE_ORDER: DreyfusStage[] = ['novice', 'beginner', 'competent', 'proficient', 'expert'];

export class TeachingProtocol {
  constructor(private adapter: StorageAdapter) {}

  async teach(
    teacher: string,
    student: string,
    skill: string,
    context?: TeachingContext,
  ): Promise<LearningEdge> {
    validateAgentId(teacher);
    validateAgentId(student);

    if (teacher === student) {
      throw new Error('Cannot teach yourself');
    }

    const now = new Date().toISOString();
    const edge: LearningEdge = {
      from_agent: teacher,
      to_agent: student,
      skill,
      event_type: 'teaching',
      score_delta: 0,
      metadata: context ? { ...context } : {},
      created_at: now,
    };

    await this.adapter.saveLearningEdge(edge);
    return edge;
  }

  async findTeachers(skill: string, opts?: { minStage?: DreyfusStage }): Promise<TeacherCandidate[]> {
    const holders = await this.adapter.getSkillHolders(skill);
    const minIdx = opts?.minStage ? STAGE_ORDER.indexOf(opts.minStage) : 0;

    return holders
      .filter((s) => STAGE_ORDER.indexOf(s.dreyfus_stage) >= minIdx)
      .sort((a, b) => b.score - a.score)
      .map((s) => ({
        agent_id: s.agent_id,
        skill: s.name,
        score: s.score,
        stage: s.dreyfus_stage,
      }));
  }

  async findStudents(skill: string, teacherAgentId: string): Promise<StudentCandidate[]> {
    validateAgentId(teacherAgentId);
    const holders = await this.adapter.getSkillHolders(skill);
    const teacher = holders.find((s) => s.agent_id === teacherAgentId);
    const teacherStageIdx = teacher ? STAGE_ORDER.indexOf(teacher.dreyfus_stage) : STAGE_ORDER.length;

    return holders
      .filter((s) => s.agent_id !== teacherAgentId && STAGE_ORDER.indexOf(s.dreyfus_stage) < teacherStageIdx)
      .sort((a, b) => a.score - b.score)
      .map((s) => ({
        agent_id: s.agent_id,
        skill: s.name,
        score: s.score,
        stage: s.dreyfus_stage,
      }));
  }

  async teachingHistory(agentId: string): Promise<LearningEdge[]> {
    validateAgentId(agentId);
    const fromEdges = await this.adapter.getLearningEdges(agentId, 'from');
    return fromEdges.filter((e) => e.event_type === 'teaching');
  }
}
