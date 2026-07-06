#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PORT = Number(process.env.KAIROS_LOCAL_PORT || process.env.PORT || 4100);
const DATA_FILE = resolve(process.env.KAIROS_LOCAL_DATA_FILE || '.kairos/local-operator-state.json');
const startedAt = new Date();
const state = loadState({
  version: '1.6.0-alpha',
  mode: 'emergency-local-operator',
  projects: [],
  productionJobs: [],
  notes: [],
  events: [
    {
      id: randomUUID(),
      type: 'SYSTEM_STARTED',
      message: 'Kairos emergency local operator is online.',
      createdAt: startedAt.toISOString()
    }
  ]
});

function loadState(defaultState) {
  try {
    if (!existsSync(DATA_FILE)) return defaultState;
    const persisted = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return {
      ...defaultState,
      ...persisted,
      version: defaultState.version,
      mode: defaultState.mode,
      events: Array.isArray(persisted.events) && persisted.events.length ? persisted.events : defaultState.events,
      projects: Array.isArray(persisted.projects) ? persisted.projects : [],
      productionJobs: Array.isArray(persisted.productionJobs) ? persisted.productionJobs : [],
      notes: Array.isArray(persisted.notes) ? persisted.notes : []
    };
  } catch {
    return defaultState;
  }
}

function saveState() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify({
    version: state.version,
    mode: state.mode,
    projects: state.projects,
    productionJobs: state.productionJobs,
    notes: state.notes,
    events: state.events.slice(0, 200),
    savedAt: new Date().toISOString()
  }, null, 2));
}

function recordEvent(type, message, extra = {}) {
  state.events.unshift({
    id: randomUUID(),
    type,
    message,
    createdAt: new Date().toISOString(),
    ...extra
  });
  state.events = state.events.slice(0, 200);
  saveState();
}

const stages = [
  'Intake',
  'Customer Verification',
  'Asset Collection',
  'Draft Creation',
  'Internal Review',
  'Quality Assurance',
  'Customer Review',
  'Revision',
  'Final Approval',
  'Delivery',
  'Archive'
];

function projectProgress(projectId) {
  const jobs = state.productionJobs.filter(job => job.projectId === projectId);
  if (!jobs.length) return 0;
  return Math.round((jobs.filter(job => job.status === 'Complete').length / jobs.length) * 100);
}

function priorityWeight(priority) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[priority] ?? 4;
}

function visibleProjects(search = '', status = 'All', priority = 'All') {
  const term = search.trim().toLowerCase();
  return state.projects
    .filter(project => {
      const haystack = [project.orderName, project.customerName, project.customerEmail, project.serviceType, project.status, project.priority].join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      const matchesStatus = status === 'All' || project.status === status;
      const matchesPriority = priority === 'All' || project.priority === priority;
      return matchesSearch && matchesStatus && matchesPriority;
    })
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function projectRows(projects = state.projects) {
  return projects.map(project => `
    <tr>
      <td><a href="/projects/${encodeURIComponent(project.id)}">${escapeHtml(project.orderName)}</a></td>
      <td>${escapeHtml(project.customerName)}<br><small>${escapeHtml(project.customerEmail || '')}</small></td>
      <td>${escapeHtml(project.serviceType)}</td>
      <td>${escapeHtml(project.status)}</td>
      <td><span class="badge">${escapeHtml(project.priority || 'High')}</span></td>
      <td>${projectProgress(project.id)}%</td>
      <td>$${Number(project.orderTotal || 0).toFixed(2)}</td>
    </tr>
  `).join('');
}

function projectDetailHtml(res, projectId) {
  const project = state.projects.find(item => item.id === projectId);
  if (!project) return json(res, 404, { error: 'Project not found.' });
  const jobs = state.productionJobs
    .filter(job => job.projectId === projectId)
    .sort((a, b) => a.sequence - b.sequence);
  const jobRows = jobs.map(job => `
    <tr>
      <td>${job.sequence}</td>
      <td>${escapeHtml(job.stage)}</td>
      <td><span class="badge">${escapeHtml(job.status)}</span></td>
      <td>${job.completedAt ? escapeHtml(new Date(job.completedAt).toLocaleString()) : '—'}</td>
      <td>${job.status === 'Ready' ? `<button onclick="advanceJob('${job.id}')">Complete stage</button>` : ''}</td>
    </tr>
  `).join('');
  const body = pageShell(`
    <section class="hero">
      <div class="kicker">Project Detail</div>
      <h1>${escapeHtml(project.orderName)} · ${escapeHtml(project.customerName)}</h1>
      <p>Service: <strong>${escapeHtml(project.serviceType)}</strong> · Status: <strong>${escapeHtml(project.status)}</strong> · Progress: <strong>${projectProgress(project.id)}%</strong></p>
      <div class="actions"><a class="button" href="/">Back to console</a><a class="button" href="/api/projects/${encodeURIComponent(project.id)}">Project JSON</a></div>
      <div class="actions">
        <select id="prioritySelect">
          ${['Critical','High','Medium','Low'].map(level => `<option ${project.priority === level ? 'selected' : ''}>${level}</option>`).join('')}
        </select>
        <button onclick="updatePriority()">Update priority</button>
      </div>
    </section>
    <section class="grid">
      <div class="metric"><span>Order Total</span><strong>$${Number(project.orderTotal || 0).toFixed(2)}</strong></div>
      <div class="metric"><span>Priority</span><strong>${escapeHtml(project.priority)}</strong></div>
      <div class="metric"><span>Jobs</span><strong>${jobs.length}</strong></div>
      <div class="metric"><span>Open</span><strong>${jobs.filter(job => job.status !== 'Complete').length}</strong></div>
    </section>
    <section class="card">
      <div class="kicker">Production Workflow</div>
      <h2>Stage controls</h2>
      <table><thead><tr><th>#</th><th>Stage</th><th>Status</th><th>Completed</th><th>Action</th></tr></thead><tbody>${jobRows}</tbody></table>
    </section>
    <section class="card" style="margin-top:18px">
      <div class="kicker">Operator Notes</div>
      <h2>Project notes</h2>
      <div class="actions"><input id="noteText" placeholder="Add customer, production, or delivery note..." /><button onclick="addNote()">Add note</button></div>
      <ul class="feed">${state.notes.filter(note => note.projectId === project.id).slice(0,12).map(note => `<li><span class="badge">${escapeHtml(note.type || 'NOTE')}</span><br><strong>${escapeHtml(new Date(note.createdAt).toLocaleString())}</strong><br>${escapeHtml(note.text)}</li>`).join('') || '<li>No notes yet.</li>'}</ul>
    </section>
    <script>
      async function advanceJob(id) {
        await fetch('/api/production/jobs/' + id + '/advance', { method: 'POST' });
        location.reload();
      }
      async function addNote() {
        const input = document.getElementById('noteText');
        const text = input.value.trim();
        if (!text) return;
        await fetch('/api/projects/${encodeURIComponent(project.id)}/notes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, type: 'OPERATOR_NOTE' })
        });
        location.reload();
      }
      async function updatePriority() {
        const priority = document.getElementById('prioritySelect').value;
        await fetch('/api/projects/${encodeURIComponent(project.id)}/priority', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ priority })
        });
        location.reload();
      }
    </script>
  `);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function pageShell(inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Kairos Local Operator</title><style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #020617; color: #f8fafc; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px; }
    .hero, .card { border: 1px solid rgba(255,255,255,.12); background: linear-gradient(135deg, rgba(255,255,255,.09), rgba(255,255,255,.035)); border-radius: 28px; padding: 24px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    .hero { margin-bottom: 20px; }
    .kicker { color: #38bdf8; text-transform: uppercase; letter-spacing: .28em; font-size: 12px; font-weight: 700; }
    h1 { font-size: clamp(32px, 6vw, 64px); margin: 12px 0 8px; letter-spacing: -.04em; }
    p { color: rgba(248,250,252,.68); line-height: 1.65; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 20px 0; }
    .metric { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.055); border-radius: 20px; padding: 18px; }
    .metric span { color: rgba(248,250,252,.58); font-size: 13px; }
    .metric strong { display: block; font-size: 30px; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 18px; }
    th, td { text-align: left; padding: 13px 14px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 14px; }
    th { color: rgba(248,250,252,.56); font-size: 12px; text-transform: uppercase; letter-spacing: .16em; }
    a { color: #7dd3fc; } small { color: rgba(248,250,252,.5); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    .split { display: grid; grid-template-columns: 1.25fr .75fr; gap: 18px; margin-top: 18px; }
    .feed { list-style: none; padding: 0; margin: 0; }
    .feed li { border-bottom: 1px solid rgba(255,255,255,.08); padding: 11px 0; color: rgba(248,250,252,.7); }
    .feed strong { color: #f8fafc; }
    .badge { display:inline-flex; border:1px solid rgba(125,211,252,.35); color:#7dd3fc; border-radius:999px; padding:3px 8px; font-size:12px; font-weight:700; }
    input, select { flex: 1; min-width: 220px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #f8fafc; padding: 12px 14px; border-radius: 999px; outline: none; }
    select option { color: #020617; }
    .form-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    button, a.button { border: 1px solid rgba(56,189,248,.45); background: rgba(56,189,248,.12); color: #7dd3fc; padding: 11px 14px; border-radius: 999px; text-decoration: none; font-weight: 700; cursor: pointer; }
    code { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); padding: 2px 6px; border-radius: 7px; }
    @media (max-width: 820px) { .grid, .split, .form-grid { grid-template-columns: 1fr; } main { padding: 18px; } }
  </style></head><body><main>${inner}</main></body></html>`;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

function html(res) {
  const activeJobs = state.productionJobs.filter(job => job.status !== 'Complete').length;
  const revenueToday = state.projects.reduce((sum, project) => sum + Number(project.orderTotal || 0), 0);
  const rows = projectRows(visibleProjects(''));
  const body = pageShell(`
    <section class="hero">
      <div class="kicker">Kairos v${state.version}</div>
      <h1>MMG operating console is online.</h1>
      <p>This no-install emergency operator runs with plain Node.js. It lets you validate the Kairos operating loop today without Docker, pnpm, GitHub Actions, Codespaces, or CI minutes.</p>
      <div class="actions"><button onclick="createMockOrder()">Create mock Shopify order</button><button onclick="advanceFirstJob()">Advance first ready job</button><button onclick="resetState()">Reset local state</button><a class="button" href="/api/status">View status JSON</a><a class="button" href="/api/dashboard">View dashboard JSON</a><a class="button" href="/api/export">Export operating state</a></div>
    </section>
    <section class="grid"><div class="metric"><span>Mode</span><strong>Local</strong></div><div class="metric"><span>Projects</span><strong>${state.projects.length}</strong></div><div class="metric"><span>Production Jobs</span><strong>${activeJobs}</strong></div><div class="metric"><span>Revenue Signal</span><strong>$${revenueToday.toFixed(2)}</strong></div><div class="metric"><span>Notes</span><strong>${state.notes.length}</strong></div></section>
    <section class="card"><div class="kicker">Manual Intake</div><h2>Create a real operating project</h2><p>Use this when MMG needs to track work before Shopify webhooks are connected. It creates the same Kairos project and production workflow as a Shopify order.</p><div class="form-grid"><input id="manualCustomerName" placeholder="Customer name" /><input id="manualCustomerEmail" placeholder="Customer email" /><select id="manualServiceType"><option>Publishing Service</option><option>Book Production</option><option>Product Page Build</option><option>Knowledge Library Article</option><option>Marketing Campaign</option><option>Custom Kairos Project</option></select><input id="manualOrderTotal" placeholder="Order total, e.g. 49.00" /></div><div class="actions"><button onclick="createManualProject()">Create Kairos project</button></div></section>
    <section class="split"><div class="card"><div class="kicker">Customer Intake Engine</div><h2>Projects created from Shopify orders</h2><div class="actions"><input id="projectSearch" placeholder="Search customer, email, order, service..." oninput="filterProjects()" /><select id="statusFilter" onchange="filterProjects()"><option>All</option><option>Intake</option><option>Customer Verification</option><option>Asset Collection</option><option>Draft Creation</option><option>Internal Review</option><option>Quality Assurance</option><option>Customer Review</option><option>Revision</option><option>Final Approval</option><option>Delivery</option><option>Delivered</option></select><select id="priorityFilter" onchange="filterProjects()"><option>All</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div><table><thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Status</th><th>Priority</th><th>Progress</th><th>Total</th></tr></thead><tbody id="projectRows">${rows || '<tr><td colspan="7">No projects yet. Click Create mock Shopify order to test the operating loop.</td></tr>'}</tbody></table><p>Real endpoint: <code>POST /api/intake/shopify-order</code>. This endpoint mirrors the production intake contract and persists records locally at <code>${escapeHtml(DATA_FILE)}</code>.</p></div><div class="card"><div class="kicker">Operating Feed</div><h2>Latest events</h2><ul class="feed">${state.events.slice(0,8).map(event => `<li><span class="badge">${escapeHtml(event.type)}</span><br><strong>${escapeHtml(new Date(event.createdAt).toLocaleString())}</strong><br>${escapeHtml(event.message)}</li>`).join('')}</ul></div></section>
    <script>
      async function filterProjects() { const search = encodeURIComponent(document.getElementById('projectSearch').value || ''); const status = encodeURIComponent(document.getElementById('statusFilter').value || 'All'); const priority = encodeURIComponent(document.getElementById('priorityFilter').value || 'All'); const result = await (await fetch('/api/projects/table?search=' + search + '&status=' + status + '&priority=' + priority)).json(); document.getElementById('projectRows').innerHTML = result.html || '<tr><td colspan="7">No matching projects.</td></tr>'; }
      async function createMockOrder() { const id = Date.now(); await fetch('/api/intake/shopify-order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'gid://shopify/Order/' + id, name: '#' + String(id).slice(-6), email: 'customer@example.com', totalPrice: '49.00', customer: { id: 'gid://shopify/Customer/501', displayName: 'Example Customer', email: 'customer@example.com' }, lineItems: [{ shopifyLineItemId: 'line_' + id, title: 'Publishing Service Intake', quantity: 1, productType: 'Publishing Service', requiresProduction: true }] }) }); location.reload(); }
      async function createManualProject() { const payload = { customerName: document.getElementById('manualCustomerName').value.trim() || 'Manual Customer', customerEmail: document.getElementById('manualCustomerEmail').value.trim() || 'manual@example.com', serviceType: document.getElementById('manualServiceType').value, orderTotal: document.getElementById('manualOrderTotal').value.trim() || '0' }; await fetch('/api/intake/manual-project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); location.reload(); }
      async function advanceFirstJob() { const jobs = await (await fetch('/api/production/jobs')).json(); const job = jobs.find(j => j.status !== 'Complete'); if (!job) return alert('No open production jobs.'); await fetch('/api/production/jobs/' + job.id + '/advance', { method: 'POST' }); location.reload(); }
      async function resetState() { if (!confirm('Reset local Kairos state?')) return; await fetch('/api/reset', { method: 'POST' }); location.reload(); }
    </script>
  `);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function dashboard() {
  const revenueToday = state.projects.reduce((sum, project) => sum + Number(project.orderTotal || 0), 0);
  return {
    revenueToday,
    ordersToday: state.projects.length,
    activeProjects: state.projects.filter(project => project.status !== 'Archived').length,
    productionQueue: state.productionJobs.filter(job => job.status !== 'Complete').length,
    publishingQueue: state.productionJobs.filter(job => job.stage.toLowerCase().includes('draft')).length,
    qaAlerts: state.productionJobs.filter(job => job.stage === 'Quality Assurance' && job.status === 'Ready').length,
    marketingCampaigns: 0,
    criticalProjects: state.projects.filter(project => project.priority === 'Critical').length,
    operatorNotes: state.notes.length,
    automationRunning: 0,
    shopifySyncHealthy: false,
    systemStatus: 'Healthy',
    source: 'emergency-local-operator',
    dataFile: DATA_FILE
  };
}

async function intake(req, res) {
  const order = await readBody(req);
  if (!order.id || !order.name) return json(res, 400, { error: 'Order id and name are required.' });
  const existing = state.projects.find(project => project.shopifyOrderId === order.id);
  if (existing) return json(res, 200, { duplicate: true, project: existing });
  const lineItem = Array.isArray(order.lineItems) ? order.lineItems[0] : undefined;
  const projectId = randomUUID();
  const project = { id: projectId, shopifyOrderId: order.id, orderName: order.name, customerId: order.customer?.id ?? order.email ?? 'unknown-customer', customerName: order.customer?.displayName ?? order.email ?? 'Unknown Customer', customerEmail: order.customer?.email ?? order.email ?? null, serviceType: lineItem?.productType ?? lineItem?.title ?? 'Shopify Service Order', status: 'Intake', priority: 'High', orderTotal: Number(order.totalPrice ?? order.currentTotalPrice ?? 0), createdAt: new Date().toISOString() };
  state.projects.push(project);
  for (const [index, stage] of stages.entries()) state.productionJobs.push({ id: randomUUID(), projectId, stage, sequence: index + 1, status: index === 0 ? 'Ready' : 'Queued', createdAt: new Date().toISOString() });
  recordEvent('PROJECT_CREATED', `${project.orderName} created ${stages.length} Kairos production jobs.`, { projectId });
  return json(res, 201, { project, productionJobs: state.productionJobs.filter(job => job.projectId === projectId) });
}

function advanceJob(jobId) {
  const job = state.productionJobs.find(item => item.id === jobId);
  if (!job) return { status: 404, payload: { error: 'Production job not found.' } };
  if (job.status === 'Complete') return { status: 200, payload: { job, unchanged: true } };
  job.status = 'Complete';
  job.completedAt = new Date().toISOString();
  const nextJob = state.productionJobs.filter(item => item.projectId === job.projectId && item.status === 'Queued').sort((a, b) => a.sequence - b.sequence)[0];
  if (nextJob) nextJob.status = 'Ready';
  const project = state.projects.find(item => item.id === job.projectId);
  if (project) {
    const projectJobs = state.productionJobs.filter(item => item.projectId === project.id);
    const completed = projectJobs.filter(item => item.status === 'Complete').length;
    project.percentComplete = Math.round((completed / projectJobs.length) * 100);
    project.status = project.percentComplete >= 100 ? 'Delivered' : nextJob?.stage ?? project.status;
    project.updatedAt = new Date().toISOString();
  }
  recordEvent('JOB_ADVANCED', `${job.stage} completed${nextJob ? `; ${nextJob.stage} is ready.` : '; project workflow complete.'}`, { projectId: job.projectId, jobId: job.id });
  return { status: 200, payload: { job, nextJob, project } };
}

async function addProjectNote(req, res, projectId) {
  const project = state.projects.find(item => item.id === projectId);
  if (!project) return json(res, 404, { error: 'Project not found.' });
  const body = await readBody(req);
  const text = String(body.text || '').trim();
  if (!text) return json(res, 400, { error: 'Note text is required.' });
  const note = { id: randomUUID(), projectId, type: body.type || 'OPERATOR_NOTE', text, createdAt: new Date().toISOString() };
  state.notes.unshift(note);
  recordEvent('NOTE_ADDED', `Note added to ${project.orderName}.`, { projectId, noteId: note.id });
  return json(res, 201, { note });
}

async function updateProjectPriority(req, res, projectId) {
  const project = state.projects.find(item => item.id === projectId);
  if (!project) return json(res, 404, { error: 'Project not found.' });
  const body = await readBody(req);
  const priority = String(body.priority || '').trim();
  if (!['Critical', 'High', 'Medium', 'Low'].includes(priority)) return json(res, 400, { error: 'Priority must be Critical, High, Medium, or Low.' });
  project.priority = priority;
  project.updatedAt = new Date().toISOString();
  recordEvent('PRIORITY_UPDATED', `${project.orderName} priority changed to ${priority}.`, { projectId });
  return json(res, 200, { project });
}

async function manualProject(req, res) {
  const body = await readBody(req);
  const id = Date.now();
  return intake({ ...req, on(event, handler) { if (event === 'data') handler(Buffer.from(JSON.stringify({ id: body.shopifyOrderId || `manual-${id}`, name: body.orderName || `MANUAL-${String(id).slice(-6)}`, email: body.customerEmail || 'manual@example.com', totalPrice: body.orderTotal || '0', customer: { displayName: body.customerName || 'Manual Customer', email: body.customerEmail || 'manual@example.com' }, lineItems: [{ title: body.serviceType || 'Manual Kairos Project', productType: body.serviceType || 'Manual Project', requiresProduction: true }] }))); if (event === 'end') handler(); } }, res);
}

function exportState() { return { exportedAt: new Date().toISOString(), version: state.version, mode: state.mode, dashboard: dashboard(), projects: state.projects, productionJobs: state.productionJobs, notes: state.notes, events: state.events }; }
function resetLocalState() { state.projects = []; state.productionJobs = []; state.notes = []; state.events = []; recordEvent('STATE_RESET', 'Kairos local operator state was reset.'); }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && url.pathname === '/') return html(res);
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { ok: true, service: 'kairos-emergency-local-operator', version: state.version, mode: state.mode, startedAt: startedAt.toISOString(), uptimeSeconds: Math.round(process.uptime()), githubActions: 'manual-only; not used by this operator', dataFile: DATA_FILE });
    if (req.method === 'GET' && url.pathname === '/api/dashboard') return json(res, 200, dashboard());
    if (req.method === 'GET' && url.pathname === '/api/export') return json(res, 200, exportState());
    if (req.method === 'GET' && url.pathname === '/api/projects/table') return json(res, 200, { count: visibleProjects(url.searchParams.get('search') || '', url.searchParams.get('status') || 'All', url.searchParams.get('priority') || 'All').length, html: projectRows(visibleProjects(url.searchParams.get('search') || '', url.searchParams.get('status') || 'All', url.searchParams.get('priority') || 'All')) });
    if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, state.projects);
    const projectPageMatch = url.pathname.match(/^\/projects\/([^/]+)$/);
    if (req.method === 'GET' && projectPageMatch) return projectDetailHtml(res, decodeURIComponent(projectPageMatch[1]));
    const projectApiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    const projectNoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/notes$/);
    const projectPriorityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/priority$/);
    if (req.method === 'POST' && projectNoteMatch) return addProjectNote(req, res, decodeURIComponent(projectNoteMatch[1]));
    if (req.method === 'POST' && projectPriorityMatch) return updateProjectPriority(req, res, decodeURIComponent(projectPriorityMatch[1]));
    if (req.method === 'GET' && projectApiMatch) { const project = state.projects.find(item => item.id === decodeURIComponent(projectApiMatch[1])); if (!project) return json(res, 404, { error: 'Project not found.' }); return json(res, 200, { project, productionJobs: state.productionJobs.filter(job => job.projectId === project.id).sort((a,b) => a.sequence - b.sequence) }); }
    if (req.method === 'GET' && url.pathname === '/api/production/jobs') return json(res, 200, state.productionJobs);
    if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, state.events);
    if (req.method === 'POST' && url.pathname === '/api/intake/shopify-order') return intake(req, res);
    if (req.method === 'POST' && url.pathname === '/api/intake/manual-project') return manualProject(req, res);
    const advanceMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/advance$/);
    if (req.method === 'POST' && advanceMatch) return json(res, advanceJob(advanceMatch[1]).status, advanceJob(advanceMatch[1]).payload);
    if (req.method === 'POST' && url.pathname === '/api/reset') { resetLocalState(); return json(res, 200, { ok: true }); }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' }); }
});

server.listen(PORT, () => {
  console.log(`Kairos local operator online: http://localhost:${PORT}`);
  console.log('No Docker, pnpm, GitHub Actions, Codespaces, or CI minutes required.');
});
