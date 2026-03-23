import type { FileSkillStore } from '../../skills/store.js';
import type { TrustManager, TrustLevel } from '../../skills/trust.js';

export interface DashboardDeps {
  store: FileSkillStore;
  trust: TrustManager;
  getProxyStats: () => { requests_forwarded: number; skills_injected: number; lessons_extracted: number; started_at: string } | null;
  getState: () => 'on' | 'off';
  setState: (state: 'on' | 'off') => void;
}

type Handler = (body?: any) => any;

export function createHandlers(deps: DashboardDeps): Record<string, Handler> {
  const { store, trust, getProxyStats, getState, setState } = deps;

  return {
    // ── Status ──────────────────────────────────────────────────────────
    'GET /api/status': () => ({
      state: getState(),
      skills_count: store.listApproved().length,
      pending_count: store.listPending().length,
      rejected_count: store.listRejected().length,
      proxy: getProxyStats(),
    }),

    // ── State toggle ────────────────────────────────────────────────────
    'POST /api/state': (body) => {
      const newState = body?.state;
      if (newState !== 'on' && newState !== 'off') {
        return { error: 'state must be "on" or "off"' };
      }
      try {
        setState(newState);
        return { state: newState };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to change state';
        return { error: msg };
      }
    },

    // ── Skills (approved) ───────────────────────────────────────────────
    'GET /api/skills': () => store.listApproved(),

    // ── Pending ─────────────────────────────────────────────────────────
    'GET /api/pending': () => store.listPending(),

    // ── Rejected ────────────────────────────────────────────────────────
    'GET /api/rejected': () => store.listRejected(),

    // ── Approve ─────────────────────────────────────────────────────────
    'POST /api/approve': (body) => {
      const id = body?.id;
      if (!id || typeof id !== 'string') return { error: 'id required' };
      const ok = store.approve(id);
      return ok ? { ok: true } : { error: 'not found' };
    },

    // ── Reject ──────────────────────────────────────────────────────────
    'POST /api/reject': (body) => {
      const id = body?.id;
      if (!id || typeof id !== 'string') return { error: 'id required' };
      const ok = store.reject(id);
      return ok ? { ok: true } : { error: 'not found' };
    },

    // ── Disable (approved → rejected) ───────────────────────────────────
    'POST /api/disable': (body) => {
      const id = body?.id;
      if (!id || typeof id !== 'string') return { error: 'id required' };
      const ok = store.disable(id);
      return ok ? { ok: true } : { error: 'not found' };
    },

    // ── Remove permanently ──────────────────────────────────────────────
    'DELETE /api/skill': (body) => {
      const id = body?.id;
      if (!id || typeof id !== 'string') return { error: 'id required' };
      const ok = store.remove(id);
      return ok ? { ok: true } : { error: 'not found' };
    },

    // ── Trust ───────────────────────────────────────────────────────────
    'GET /api/trust': () => trust.getConfig(),

    'POST /api/trust': (body) => {
      const { agent, level } = body ?? {};
      if (!agent || typeof agent !== 'string') return { error: 'agent required' };
      if (!['trusted', 'pending', 'blocked'].includes(level)) return { error: 'level must be trusted/pending/blocked' };
      trust.setLevel(agent, level as TrustLevel);
      return { ok: true };
    },

    'POST /api/trust/default': (body) => {
      const { level } = body ?? {};
      if (!['trusted', 'pending', 'blocked'].includes(level)) return { error: 'level must be trusted/pending/blocked' };
      trust.setDefault(level as TrustLevel);
      return { ok: true };
    },

    // ── Network ─────────────────────────────────────────────────────────
    'GET /api/network': () => {
      const approved = store.listApproved();
      const pending = store.listPending();
      const all = [...approved, ...pending];

      const agents: Record<string, { lessons: number; skills: string[]; trust: string }> = {};
      for (const skill of all) {
        const id = skill.learned_from;
        if (!agents[id]) {
          agents[id] = { lessons: 0, skills: [], trust: trust.getLevel(id) };
        }
        agents[id].lessons++;
        if (!agents[id].skills.includes(skill.name)) {
          agents[id].skills.push(skill.name);
        }
      }
      return agents;
    },

    // ── Stats ───────────────────────────────────────────────────────────
    'GET /api/stats': () => {
      const counts = trust.getDailyCounts();
      return {
        today_lessons: counts.total,
        today_per_agent: counts.perAgent,
        total_approved: store.listApproved().length,
        total_pending: store.listPending().length,
        total_rejected: store.listRejected().length,
        proxy: getProxyStats(),
      };
    },
  };
}
