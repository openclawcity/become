/**
 * Server-rendered HTML for the become dashboard.
 * Single-page app with vanilla JS — no build step needed.
 */
export function renderDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>become</title>
<style>
  :root { --bg: #0a0a0a; --card: #141414; --border: #262626; --text: #e5e5e5; --dim: #737373; --accent: #22d3ee; --green: #22c55e; --red: #ef4444; --amber: #f59e0b; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 24px; font-weight: 600; margin-bottom: 4px; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: var(--accent); }
  .subtitle { color: var(--dim); font-size: 14px; margin-bottom: 24px; }

  /* Nav */
  nav { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  nav button { background: none; border: none; color: var(--dim); font-size: 14px; padding: 8px 16px; cursor: pointer; border-radius: 6px 6px 0 0; }
  nav button:hover { color: var(--text); }
  nav button.active { color: var(--accent); border-bottom: 2px solid var(--accent); }

  /* Status bar */
  .status-bar { display: flex; gap: 16px; align-items: center; margin-bottom: 24px; padding: 12px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; }
  .status-dot.on { background: var(--green); }
  .status-dot.off { background: var(--red); }
  .status-label { font-weight: 600; }
  .status-stat { color: var(--dim); }

  /* Cards */
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .card-instruction { font-size: 15px; margin-bottom: 8px; }
  .card-meta { font-size: 12px; color: var(--dim); display: flex; gap: 12px; flex-wrap: wrap; }
  .card-meta span { display: inline-flex; align-items: center; gap: 4px; }

  /* Buttons */
  .btn { border: none; padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 500; }
  .btn-approve { background: var(--green); color: #000; }
  .btn-reject { background: var(--red); color: #fff; }
  .btn-disable { background: var(--border); color: var(--text); }
  .btn-trust { background: var(--accent); color: #000; }
  .btn-small { padding: 4px 10px; font-size: 12px; }
  .btn:hover { opacity: 0.85; }
  .btn-group { display: flex; gap: 6px; }

  /* Badge */
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
  .badge-trusted { background: rgba(34,197,94,0.15); color: var(--green); }
  .badge-pending { background: rgba(245,158,11,0.15); color: var(--amber); }
  .badge-blocked { background: rgba(239,68,68,0.15); color: var(--red); }

  /* Empty state */
  .empty { text-align: center; padding: 40px; color: var(--dim); }

  /* Page sections */
  .page { display: none; }
  .page.active { display: block; }

  /* Trust settings */
  .trust-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .trust-row:last-child { border: none; }
  .trust-agent { font-weight: 500; }
  .trust-lessons { font-size: 13px; color: var(--dim); }

  /* Skill group */
  .skill-group { margin-bottom: 20px; }
  .skill-group-name { font-size: 13px; text-transform: uppercase; color: var(--dim); letter-spacing: 0.5px; margin-bottom: 8px; }

  /* Toggle */
  .toggle { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .toggle-switch { width: 44px; height: 24px; background: var(--border); border-radius: 12px; position: relative; cursor: pointer; transition: background 0.2s; }
  .toggle-switch.on { background: var(--green); }
  .toggle-switch::after { content: ''; position: absolute; width: 18px; height: 18px; background: white; border-radius: 50%; top: 3px; left: 3px; transition: transform 0.2s; }
  .toggle-switch.on::after { transform: translateX(20px); }
</style>
</head>
<body>
<div class="container">
  <h1>become</h1>
  <p class="subtitle">agent-to-agent learning</p>

  <div class="status-bar" id="status-bar">
    <div class="status-dot" id="status-dot"></div>
    <span class="status-label" id="status-label">Loading...</span>
    <span class="status-stat" id="status-skills"></span>
    <span class="status-stat" id="status-pending"></span>
  </div>

  <nav>
    <button class="active" onclick="showPage('pending',this)">Pending</button>
    <button onclick="showPage('skills',this)">Active Skills</button>
    <button onclick="showPage('network',this)">Network</button>
    <button onclick="showPage('settings',this)">Settings</button>
  </nav>

  <!-- Pending Page -->
  <div id="page-pending" class="page active"></div>

  <!-- Skills Page -->
  <div id="page-skills" class="page"></div>

  <!-- Network Page -->
  <div id="page-network" class="page"></div>

  <!-- Settings Page -->
  <div id="page-settings" class="page"></div>
</div>

<script>
const API = '';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}

function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (name === 'pending') loadPending();
  if (name === 'skills') loadSkills();
  if (name === 'network') loadNetwork();
  if (name === 'settings') loadSettings();
}

// ── Status Bar ────────────────────────────────────────────────────────
async function loadStatus() {
  const s = await api('GET', '/api/status');
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  dot.className = 'status-dot ' + s.state;
  label.textContent = s.state.toUpperCase();
  document.getElementById('status-skills').textContent = s.skills_count + ' skills';
  document.getElementById('status-pending').textContent = s.pending_count + ' pending';
}

// ── Pending Page ──────────────────────────────────────────────────────
async function loadPending() {
  const lessons = await api('GET', '/api/pending');
  const el = document.getElementById('page-pending');
  if (lessons.length === 0) {
    el.innerHTML = '<div class="empty">No pending lessons. Your agent will learn as it talks to other agents.</div>';
    return;
  }
  el.innerHTML = '<h2>Pending Review (' + lessons.length + ')</h2>' +
    lessons.map(l => renderPendingCard(l)).join('');
}

function renderPendingCard(l) {
  return '<div class="card" id="card-' + l.id + '">' +
    '<div class="card-instruction">' + esc(l.instruction) + '</div>' +
    '<div class="card-meta">' +
      '<span>From: <strong>' + esc(l.learned_from) + '</strong></span>' +
      '<span>Source: ' + esc(l.source) + '</span>' +
      '<span>Confidence: ' + (l.confidence * 100).toFixed(0) + '%</span>' +
      '<span>Skill: ' + esc(l.name) + '</span>' +
    '</div>' +
    '<div style="margin-top:12px" class="btn-group">' +
      '<button class="btn btn-approve" onclick="doApprove(\\''+l.id+'\\')">Approve</button>' +
      '<button class="btn btn-reject" onclick="doReject(\\''+l.id+'\\')">Reject</button>' +
      '<button class="btn btn-trust btn-small" onclick="doTrustAgent(\\''+esc(l.learned_from)+'\\')">Trust Agent</button>' +
    '</div>' +
  '</div>';
}

async function doApprove(id) {
  await api('POST', '/api/approve', { id });
  document.getElementById('card-' + id)?.remove();
  loadStatus();
}

async function doReject(id) {
  await api('POST', '/api/reject', { id });
  document.getElementById('card-' + id)?.remove();
  loadStatus();
}

async function doTrustAgent(agent) {
  await api('POST', '/api/trust', { agent, level: 'trusted' });
  loadPending();
  loadStatus();
}

// ── Skills Page ───────────────────────────────────────────────────────
async function loadSkills() {
  const skills = await api('GET', '/api/skills');
  const el = document.getElementById('page-skills');
  if (skills.length === 0) {
    el.innerHTML = '<div class="empty">No active skills yet. Approve pending lessons to activate them.</div>';
    return;
  }

  // Group by skill name
  const groups = {};
  for (const s of skills) {
    if (!groups[s.name]) groups[s.name] = [];
    groups[s.name].push(s);
  }

  let html = '<h2>Active Skills (' + skills.length + ')</h2>';
  for (const [name, items] of Object.entries(groups)) {
    html += '<div class="skill-group"><div class="skill-group-name">' + esc(name) + '</div>';
    for (const s of items) {
      html += '<div class="card" id="card-' + s.id + '">' +
        '<div class="card-header"><div class="card-instruction">' + esc(s.instruction) + '</div>' +
        '<button class="btn btn-disable btn-small" onclick="doDisable(\\''+s.id+'\\')">Disable</button></div>' +
        '<div class="card-meta"><span>From: ' + esc(s.learned_from) + '</span><span>Source: ' + esc(s.source) + '</span></div>' +
      '</div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

async function doDisable(id) {
  await api('POST', '/api/disable', { id });
  document.getElementById('card-' + id)?.remove();
  loadStatus();
}

// ── Network Page ──────────────────────────────────────────────────────
async function loadNetwork() {
  const network = await api('GET', '/api/network');
  const el = document.getElementById('page-network');
  const entries = Object.entries(network);
  if (entries.length === 0) {
    el.innerHTML = '<div class="empty">No agents have taught yours yet.</div>';
    return;
  }

  let html = '<h2>Who Taught Your Agent</h2>';
  entries.sort((a, b) => b[1].lessons - a[1].lessons);
  for (const [agent, data] of entries) {
    const d = data;
    const badgeClass = 'badge badge-' + d.trust;
    html += '<div class="card"><div class="trust-row">' +
      '<div><div class="trust-agent">' + esc(agent) + ' <span class="' + badgeClass + '">' + d.trust + '</span></div>' +
      '<div class="trust-lessons">' + d.lessons + ' lesson(s): ' + d.skills.map(esc).join(', ') + '</div></div>' +
      '<div class="btn-group">' +
        (d.trust !== 'trusted' ? '<button class="btn btn-trust btn-small" onclick="setTrust(\\''+esc(agent)+'\\',\\'trusted\\')">Trust</button>' : '') +
        (d.trust !== 'blocked' ? '<button class="btn btn-reject btn-small" onclick="setTrust(\\''+esc(agent)+'\\',\\'blocked\\')">Block</button>' : '') +
        (d.trust !== 'pending' ? '<button class="btn btn-disable btn-small" onclick="setTrust(\\''+esc(agent)+'\\',\\'pending\\')">Reset</button>' : '') +
      '</div>' +
    '</div></div>';
  }
  el.innerHTML = html;
}

async function setTrust(agent, level) {
  await api('POST', '/api/trust', { agent, level });
  loadNetwork();
}

// ── Settings Page ─────────────────────────────────────────────────────
async function loadSettings() {
  const status = await api('GET', '/api/status');
  const trust = await api('GET', '/api/trust');
  const stats = await api('GET', '/api/stats');

  const el = document.getElementById('page-settings');
  el.innerHTML = '<h2>Settings</h2>' +
    '<div class="card">' +
      '<div class="toggle">' +
        '<div class="toggle-switch ' + status.state + '" id="toggle-state" onclick="toggleState()"></div>' +
        '<span>Proxy is <strong>' + status.state.toUpperCase() + '</strong></span>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<h2 style="margin-bottom:8px">Default Trust</h2>' +
      '<div class="card-meta" style="margin-bottom:12px">What happens when a new agent teaches your agent</div>' +
      '<div class="btn-group">' +
        '<button class="btn ' + (trust.default === 'pending' ? 'btn-approve' : 'btn-disable') + '" onclick="setDefaultTrust(\\'pending\\')">Pending (review)</button>' +
        '<button class="btn ' + (trust.default === 'trusted' ? 'btn-approve' : 'btn-disable') + '" onclick="setDefaultTrust(\\'trusted\\')">Auto-approve</button>' +
        '<button class="btn ' + (trust.default === 'blocked' ? 'btn-approve' : 'btn-disable') + '" onclick="setDefaultTrust(\\'blocked\\')">Block all</button>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<h2 style="margin-bottom:8px">Stats</h2>' +
      '<div class="card-meta" style="flex-direction:column;gap:4px">' +
        '<span>Approved: ' + stats.total_approved + '</span>' +
        '<span>Pending: ' + stats.total_pending + '</span>' +
        '<span>Rejected: ' + stats.total_rejected + '</span>' +
        '<span>Lessons today: ' + stats.today_lessons + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<h2 style="margin-bottom:8px;color:var(--red)">Danger Zone</h2>' +
      '<div class="btn-group">' +
        '<button class="btn btn-reject" onclick="if(confirm(\\'Clear all skills?\\'))clearAll()">Clear All Skills</button>' +
      '</div>' +
    '</div>';
}

async function toggleState() {
  const el = document.getElementById('toggle-state');
  const newState = el.classList.contains('on') ? 'off' : 'on';
  await api('POST', '/api/state', { state: newState });
  loadStatus();
  loadSettings();
}

async function setDefaultTrust(level) {
  await api('POST', '/api/trust/default', { level });
  loadSettings();
}

async function clearAll() {
  const skills = await api('GET', '/api/skills');
  for (const s of skills) {
    await api('DELETE', '/api/skill', { id: s.id });
  }
  loadStatus();
  loadSettings();
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Init
loadStatus();
loadPending();
setInterval(loadStatus, 10000);
</script>
</body>
</html>`;
}
