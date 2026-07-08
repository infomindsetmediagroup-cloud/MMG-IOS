#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PORT = Number(process.env.KAIROS_LOCAL_PORT || process.env.PORT || 4100);
const DATA_FILE = resolve(process.env.KAIROS_LOCAL_DATA_FILE || '.kairos/local-operator-state.json');
const startedAt = new Date();

const customerValueDoctrine = {
  promise: 'Your Knowledge Has Value.',
  support: 'Helping you discover it, build it, and share it with the world.',
  positioning: 'Build around the value only you can provide.',
  guidance: 'Kairos preserves context, organizes the work, recommends the next action, and helps turn customer knowledge into durable assets.',
  sequence: ['Outcome', 'Identity', 'Agency', 'Guidance', 'System']
};

const state = loadState({
  version: '1.9.0-alpha',
  mode: 'customer-value-local-operator',
  doctrine: customerValueDoctrine,
  projects: [],
  productionJobs: [],
  commandQueue: [],
  notes: [],
  events: [
    {
      id: randomUUID(),
      type: 'SYSTEM_STARTED',
      message: `Kairos local operator is online. ${customerValueDoctrine.promise}`,
      createdAt: startedAt.toISOString()
    }
  ]
});

const productionStages = [
  'Intake',
  'Customer Verification',
  'Value Discovery',
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

function loadState(defaultState) {
  try {
    if (!existsSync(DATA_FILE)) return defaultState;
    const persisted = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return {
      ...defaultState,
      ...persisted,
      version: defaultState.version,
      mode: defaultState.mode,
      doctrine: defaultState.doctrine,
      projects: Array.isArray(persisted.projects) ? persisted.projects : [],
      productionJobs: Array.isArray(persisted.productionJobs) ? persisted.productionJobs : [],
      commandQueue: Array.isArray(persisted.commandQueue) ? persisted.commandQueue : [],
      notes: Array.isArray(persisted.notes) ? persisted.notes : [],
      events: Array.isArray(persisted.events) && persisted.events.length ? persisted.events : defaultState.events
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
    doctrine: customerValueDoctrine,
    projects: state.projects,
    productionJobs: state.productionJobs,
    commandQueue: state.commandQueue,
    notes: state.notes,
    events: state.events.slice(0, 250),
    savedAt: new Date().toISOString()
  }, null, 2));
}

function recordEvent(type, message, extra = {}) {
  state.events.unshift({ id: randomUUID(), type, message, createdAt: new Date().toISOString(), ...extra });
  state.events = state.events.slice(0, 250);
  saveState();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(payload, null, 2));
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

function classifyCommand(command) {
  const text = command.toLowerCase();
  if (/(value|knowledge|skill|experience|brand|income|asset|opportunity|positioning|discover)/.test(text)) return 'Customer Value Runtime';
  if (/(shopify|listing|product page|product listing)/.test(text)) return 'Shopify Operations';
  if (/(product|book|download|service)/.test(text)) return 'Product Operations';
  if (/(website|homepage|page|seo|image|photo|hero|navigation|link)/.test(text)) return 'Website Operations';
  if (/(tiktok|content|caption|post|video|article|script)/.test(text)) return 'Content Operations';
  if (/(campaign|email|ad|promo|discount|marketing|growth)/.test(text)) return 'Growth & Marketing';
  if (/(dashboard|app|ios|kairos|module|feature|code)/.test(text)) return 'Kairos Engineering';
  return 'General Operations';
}

function priorityForCommand(command) {
  const text = command.toLowerCase();
  if (/\b(p1|urgent|critical|now|asap|immediately|top priority)\b/.test(text)) return 'P1';
  if (/\b(p3|later|low)\b/.test(text)) return 'P3';
  if (/\b(p4|backlog|someday)\b/.test(text)) return 'P4';
  return 'P2';
}

function titleForCommand(command) {
  const cleaned = command.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 72) return cleaned;
  return `${cleaned.slice(0, 69).trim()}...`;
}

function createCommandWorkItem(command) {
  const trimmed = String(command || '').trim();
  if (!trimmed) throw new Error('Command is required.');
  const now = new Date().toISOString();
  const category = classifyCommand(trimmed);
  const priority = priorityForCommand(trimmed);
  const item = {
    id: randomUUID(),
    title: titleForCommand(trimmed),
    originalCommand: trimmed,
    parsedObjective: trimmed,
    category,
    priority,
    status: 'Queued',
    dependencies: [],
    doctrineAlignment: category === 'Customer Value Runtime' ? customerValueDoctrine.promise : customerValueDoctrine.positioning,
    executionNotes: [`Captured from dashboard command block as ${category}.`, customerValueDoctrine.guidance],
    assignedSubsystem: category,
    createdAt: now,
    updatedAt: now
  };
  state.commandQueue.unshift(item);
  recordEvent('COMMAND_QUEUED', `${item.priority} command queued for ${item.category}: ${item.title}`, { commandId: item.id });
  return item;
}

function updateCommandStatus(id, status) {
  const item = state.commandQueue.find(command => command.id === id);
  if (!item) return null;
  const allowed = ['New', 'Analyzing', 'Ready', 'Queued', 'In Progress', 'Waiting', 'Review', 'Completed', 'Failed', 'Cancelled'];
  if (!allowed.includes(status)) throw new Error('Invalid command status.');
  item.status = status;
  item.updatedAt = new Date().toISOString();
  item.executionNotes.unshift(`Status changed to ${status}.`);
  recordEvent('COMMAND_STATUS_UPDATED', `${item.title} moved to ${status}.`, { commandId: item.id });
  return item;
}

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
      const haystack = [project.orderName, project.customerName, project.customerEmail, project.serviceType, project.status, project.priority, project.valueStatement, project.customerGoal].join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (status === 'All' || project.status === status) && (priority === 'All' || project.priority === priority);
    })
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function projectRows(projects = state.projects) {
  return projects.map(project => `
    <tr>
      <td><a href="/projects/${encodeURIComponent(project.id)}">${escapeHtml(project.orderName)}</a></td>
      <td>${escapeHtml(project.customerName)}<br><small>${escapeHtml(project.customerEmail || '')}</small></td>
      <td>${escapeHtml(project.serviceType)}<br><small>${escapeHtml(project.valueStatement || customerValueDoctrine.promise)}</small></td>
      <td>${escapeHtml(project.status)}</td>
      <td><span class="badge">${escapeHtml(project.priority || 'High')}</span></td>
      <td>${projectProgress(project.id)}%</td>
      <td>$${Number(project.orderTotal || 0).toFixed(2)}</td>
    </tr>
  `).join('');
}

function commandRows() {
  return state.commandQueue.slice(0, 12).map(command => `
    <tr>
      <td>${escapeHtml(command.title)}<br><small>${escapeHtml(command.originalCommand)}</small><br><small>${escapeHtml(command.doctrineAlignment || customerValueDoctrine.promise)}</small></td>
      <td><span class="badge">${escapeHtml(command.priority)}</span></td>
      <td>${escapeHtml(command.category)}</td>
      <td>${escapeHtml(command.status)}</td>
      <td>${escapeHtml(new Date(command.createdAt).toLocaleString())}</td>
      <td>
        <select onchange="updateCommandStatus('${command.id}', this.value)">
          ${['New','Analyzing','Ready','Queued','In Progress','Waiting','Review','Completed','Failed','Cancelled'].map(status => `<option ${command.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

function pageShell(inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Kairos Local Operator</title><style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #020617; color: #f8fafc; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px; }
    .hero, .card, .command, .doctrine { border: 1px solid rgba(255,255,255,.12); background: linear-gradient(135deg, rgba(255,255,255,.09), rgba(255,255,255,.035)); border-radius: 28px; padding: 24px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    .hero, .command, .doctrine { margin-bottom: 20px; }
    .hero { border-color: rgba(56,189,248,.42); background: radial-gradient(circle at top left, rgba(56,189,248,.20), transparent 38%), linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.035)); }
    .command { border-color: rgba(56,189,248,.38); background: radial-gradient(circle at top left, rgba(56,189,248,.20), transparent 42%), linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.035)); }
    .doctrine { border-color: rgba(125,211,252,.34); }
    .kicker { color: #38bdf8; text-transform: uppercase; letter-spacing: .28em; font-size: 12px; font-weight: 700; }
    h1 { font-size: clamp(36px, 7vw, 76px); margin: 12px 0 8px; letter-spacing: -.055em; line-height: .95; }
    h2 { margin: 10px 0; }
    p { color: rgba(248,250,252,.68); line-height: 1.65; }
    .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin: 20px 0; }
    .metric, .doctrine-step { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.055); border-radius: 20px; padding: 18px; }
    .metric span, .doctrine-step span { color: rgba(248,250,252,.58); font-size: 13px; }
    .metric strong, .doctrine-step strong { display: block; font-size: 30px; margin-top: 8px; }
    .doctrine-grid { display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 18px; }
    th, td { text-align: left; padding: 13px 14px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 14px; vertical-align: top; }
    th { color: rgba(248,250,252,.56); font-size: 12px; text-transform: uppercase; letter-spacing: .16em; }
    a { color: #7dd3fc; } small { color: rgba(248,250,252,.5); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    .split { display: grid; grid-template-columns: 1.25fr .75fr; gap: 18px; margin-top: 18px; }
    .feed { list-style: none; padding: 0; margin: 0; }
    .feed li { border-bottom: 1px solid rgba(255,255,255,.08); padding: 11px 0; color: rgba(248,250,252,.7); }
    .feed strong { color: #f8fafc; }
    .badge { display:inline-flex; border:1px solid rgba(125,211,252,.35); color:#7dd3fc; border-radius:999px; padding:3px 8px; font-size:12px; font-weight:700; }
    input, textarea, select { flex: 1; min-width: 220px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #f8fafc; padding: 12px 14px; border-radius: 18px; outline: none; }
    textarea { width: 100%; min-height: 92px; resize: vertical; box-sizing: border-box; }
    select option { color: #020617; }
    .form-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    button, a.button { border: 1px solid rgba(56,189,248,.45); background: rgba(56,189,248,.12); color: #7dd3fc; padding: 11px 14px; border-radius: 999px; text-decoration: none; font-weight: 700; cursor: pointer; }
    code { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); padding: 2px 6px; border-radius: 7px; }
    @media (max-width: 820px) { .grid, .split, .form-grid, .doctrine-grid { grid-template-columns: 1fr; } main { padding: 18px; } }
  </style></head><body><main>${inner}</main></body></html>`;
}

function html(res) {
  const activeJobs = state.productionJobs.filter(job => job.status !== 'Complete').length;
  const revenueToday = state.projects.reduce((sum, project) => sum + Number(project.orderTotal || 0), 0);
  const queuedCommands = state.commandQueue.filter(command => !['Completed', 'Cancelled'].includes(command.status)).length;
  const rows = projectRows(visibleProjects(''));
  const body = pageShell(`
    <section class="hero">
      <div class="kicker">Kairos v${state.version} · Customer Value Runtime</div>
      <h1>${customerValueDoctrine.promise}</h1>
      <p>${customerValueDoctrine.support} ${customerValueDoctrine.guidance}</p>
      <div class="actions"><button onclick="createMockOrder()">Create value discovery order</button><button onclick="advanceFirstJob()">Advance first ready job</button><button onclick="resetState()">Reset local state</button><a class="button" href="/api/status">Status JSON</a><a class="button" href="/api/dashboard">Dashboard JSON</a><a class="button" href="/api/export">Export state</a></div>
    </section>

    <section class="doctrine">
      <div class="kicker">MMG Customer Promise</div>
      <h2>${customerValueDoctrine.positioning}</h2>
      <p>Kairos now treats each customer project as a value-discovery path: identify what the customer already knows, organize it, package it into useful assets, and guide the next action without hype or shortcut promises.</p>
      <div class="doctrine-grid">${customerValueDoctrine.sequence.map((step, index) => `<div class="doctrine-step"><span>Layer ${index + 1}</span><strong>${escapeHtml(step)}</strong></div>`).join('')}</div>
    </section>

    <section class="command">
      <div class="kicker">P1 Command Block</div>
      <h2>Tell Kairos what to build from the value already present</h2>
      <p>Enter operational work here: uncover customer knowledge, build a product, update the website, replace an image, create a listing, queue Shopify work, or turn content into a durable asset.</p>
      <textarea id="commandInput" placeholder="Example: Help this customer turn their HVAC experience into a guide, content series, and service offer..."></textarea>
      <div class="actions"><button onclick="submitCommand()">Queue command</button><button onclick="clearCommand()">Clear</button><a class="button" href="/api/commands">Command queue JSON</a></div>
      <h2>Recent command queue</h2>
      <table><thead><tr><th>Command</th><th>Priority</th><th>Category</th><th>Status</th><th>Created</th><th>Update</th></tr></thead><tbody id="commandRows">${commandRows() || '<tr><td colspan="6">No commands queued yet.</td></tr>'}</tbody></table>
    </section>

    <section class="grid"><div class="metric"><span>Mode</span><strong>Value</strong></div><div class="metric"><span>Commands</span><strong>${queuedCommands}</strong></div><div class="metric"><span>Projects</span><strong>${state.projects.length}</strong></div><div class="metric"><span>Production Jobs</span><strong>${activeJobs}</strong></div><div class="metric"><span>Revenue Signal</span><strong>$${revenueToday.toFixed(2)}</strong></div></section>

    <section class="card"><div class="kicker">Value Discovery Intake</div><h2>Create a real operating project</h2><p>Capture what the customer knows, what they want to build, and how Kairos should organize it into assets, content, products, or service work.</p><div class="form-grid"><input id="manualCustomerName" placeholder="Customer name" /><input id="manualCustomerEmail" placeholder="Customer email" /><input id="manualValueStatement" placeholder="What knowledge, skill, or experience has value?" /><input id="manualCustomerGoal" placeholder="Goal: extra income, audience, product, service..." /><select id="manualServiceType"><option>Value Discovery</option><option>Publishing Service</option><option>Book Production</option><option>Product Page Build</option><option>Knowledge Library Article</option><option>Marketing Campaign</option><option>Custom Kairos Project</option></select><input id="manualOrderTotal" placeholder="Order total, e.g. 49.00" /></div><div class="actions"><button onclick="createManualProject()">Create Kairos project</button></div></section>

    <section class="split"><div class="card"><div class="kicker">Customer Intake Engine</div><h2>Projects created from Shopify orders</h2><div class="actions"><input id="projectSearch" placeholder="Search customer, email, order, service, goal, value..." oninput="filterProjects()" /><select id="statusFilter" onchange="filterProjects()"><option>All</option><option>Intake</option><option>Customer Verification</option><option>Value Discovery</option><option>Asset Collection</option><option>Draft Creation</option><option>Internal Review</option><option>Quality Assurance</option><option>Customer Review</option><option>Revision</option><option>Final Approval</option><option>Delivery</option><option>Delivered</option></select><select id="priorityFilter" onchange="filterProjects()"><option>All</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div><table><thead><tr><th>Order</th><th>Customer</th><th>Service / Value</th><th>Status</th><th>Priority</th><th>Progress</th><th>Total</th></tr></thead><tbody id="projectRows">${rows || '<tr><td colspan="7">No projects yet. Create a value discovery order to test the operating loop.</td></tr>'}</tbody></table><p>Real endpoint: <code>POST /api/intake/shopify-order</code>. Command endpoint: <code>POST /api/commands</code>.</p></div><div class="card"><div class="kicker">Operating Feed</div><h2>Latest events</h2><ul class="feed">${state.events.slice(0,8).map(event => `<li><span class="badge">${escapeHtml(event.type)}</span><br><strong>${escapeHtml(new Date(event.createdAt).toLocaleString())}</strong><br>${escapeHtml(event.message)}</li>`).join('')}</ul></div></section>

    <script>
      async function submitCommand() { const input = document.getElementById('commandInput'); const command = input.value.trim(); if (!command) return; await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command }) }); location.reload(); }
      function clearCommand() { document.getElementById('commandInput').value = ''; }
      async function updateCommandStatus(id, status) { await fetch('/api/commands/' + id + '/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }); location.reload(); }
      async function filterProjects() { const search = encodeURIComponent(document.getElementById('projectSearch').value || ''); const status = encodeURIComponent(document.getElementById('statusFilter').value || 'All'); const priority = encodeURIComponent(document.getElementById('priorityFilter').value || 'All'); const result = await (await fetch('/api/projects/table?search=' + search + '&status=' + status + '&priority=' + priority)).json(); document.getElementById('projectRows').innerHTML = result.html || '<tr><td colspan="7">No matching projects.</td></tr>'; }
      async function createMockOrder() { const id = Date.now(); await fetch('/api/intake/shopify-order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'gid://shopify/Order/' + id, name: '#' + String(id).slice(-6), email: 'customer@example.com', totalPrice: '49.00', valueStatement: 'Customer has practical knowledge that can become a guide, content series, and offer.', customerGoal: 'Build an extra income path from existing experience.', customer: { id: 'gid://shopify/Customer/501', displayName: 'Example Customer', email: 'customer@example.com' }, lineItems: [{ shopifyLineItemId: 'line_' + id, title: 'Value Discovery Intake', quantity: 1, productType: 'Value Discovery', requiresProduction: true }] }) }); location.reload(); }
      async function createManualProject() { const payload = { customerName: document.getElementById('manualCustomerName').value.trim() || 'Manual Customer', customerEmail: document.getElementById('manualCustomerEmail').value.trim() || 'manual@example.com', valueStatement: document.getElementById('manualValueStatement').value.trim() || 'Customer knowledge has value.', customerGoal: document.getElementById('manualCustomerGoal').value.trim() || 'Discover, build, and share value.', serviceType: document.getElementById('manualServiceType').value, orderTotal: document.getElementById('manualOrderTotal').value.trim() || '0' }; await fetch('/api/intake/manual-project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); location.reload(); }
      async function advanceFirstJob() { const jobs = await (await fetch('/api/production/jobs')).json(); const job = jobs.find(j => j.status !== 'Complete'); if (!job) return alert('No open production jobs.'); await fetch('/api/production/jobs/' + job.id + '/advance', { method: 'POST' }); location.reload(); }
      async function resetState() { if (!confirm('Reset local Kairos state?')) return; await fetch('/api/reset', { method: 'POST' }); location.reload(); }
    </script>
  `);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function projectDetailHtml(res, projectId) {
  const project = state.projects.find(item => item.id === projectId);
  if (!project) return json(res, 404, { error: 'Project not found.' });
  const jobs = state.productionJobs.filter(job => job.projectId === projectId).sort((a, b) => a.sequence - b.sequence);
  const jobRows = jobs.map(job => `<tr><td>${job.sequence}</td><td>${escapeHtml(job.stage)}</td><td><span class="badge">${escapeHtml(job.status)}</span></td><td>${job.completedAt ? escapeHtml(new Date(job.completedAt).toLocaleString()) : '—'}</td><td>${job.status === 'Ready' ? `<button onclick="advanceJob('${job.id}')">Complete stage</button>` : ''}</td></tr>`).join('');
  const body = pageShell(`<section class="hero"><div class="kicker">Project Detail · Value Stewardship</div><h1>${escapeHtml(project.orderName)} · ${escapeHtml(project.customerName)}</h1><p>${escapeHtml(project.valueStatement || customerValueDoctrine.promise)}</p><p>Goal: <strong>${escapeHtml(project.customerGoal || customerValueDoctrine.support)}</strong></p><p>Service: <strong>${escapeHtml(project.serviceType)}</strong> · Status: <strong>${escapeHtml(project.status)}</strong> · Progress: <strong>${projectProgress(project.id)}%</strong></p><div class="actions"><a class="button" href="/">Back to console</a><a class="button" href="/api/projects/${encodeURIComponent(project.id)}">Project JSON</a></div></section><section class="card"><div class="kicker">Production Workflow</div><h2>Stage controls</h2><table><thead><tr><th>#</th><th>Stage</th><th>Status</th><th>Completed</th><th>Action</th></tr></thead><tbody>${jobRows}</tbody></table></section><section class="card" style="margin-top:18px"><div class="kicker">Operator Notes</div><h2>Project notes</h2><div class="actions"><input id="noteText" placeholder="Add customer value, production, or delivery note..." /><button onclick="addNote()">Add note</button></div><ul class="feed">${state.notes.filter(note => note.projectId === project.id).slice(0,12).map(note => `<li><span class="badge">${escapeHtml(note.type || 'NOTE')}</span><br><strong>${escapeHtml(new Date(note.createdAt).toLocaleString())}</strong><br>${escapeHtml(note.text)}</li>`).join('') || '<li>No notes yet.</li>'}</ul></section><script>async function advanceJob(id){await fetch('/api/production/jobs/'+id+'/advance',{method:'POST'});location.reload();} async function addNote(){const input=document.getElementById('noteText');const text=input.value.trim();if(!text)return;await fetch('/api/projects/${encodeURIComponent(project.id)}/notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,type:'VALUE_STEWARDSHIP_NOTE'})});location.reload();}</script>`);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function dashboard() {
  const revenueToday = state.projects.reduce((sum, project) => sum + Number(project.orderTotal || 0), 0);
  return {
    doctrine: customerValueDoctrine,
    revenueToday,
    ordersToday: state.projects.length,
    activeProjects: state.projects.filter(project => project.status !== 'Archived').length,
    valueDiscoveryProjects: state.projects.filter(project => project.status === 'Value Discovery' || project.serviceType === 'Value Discovery').length,
    productionQueue: state.productionJobs.filter(job => job.status !== 'Complete').length,
    commandQueue: state.commandQueue.filter(command => !['Completed', 'Cancelled'].includes(command.status)).length,
    p1Commands: state.commandQueue.filter(command => command.priority === 'P1' && !['Completed', 'Cancelled'].includes(command.status)).length,
    publishingQueue: state.productionJobs.filter(job => job.stage.toLowerCase().includes('draft')).length,
    qaAlerts: state.productionJobs.filter(job => job.stage === 'Quality Assurance' && job.status === 'Ready').length,
    marketingCampaigns: 0,
    criticalProjects: state.projects.filter(project => project.priority === 'Critical').length,
    operatorNotes: state.notes.length,
    automationRunning: 0,
    shopifySyncHealthy: false,
    systemStatus: 'Healthy',
    source: 'customer-value-local-operator',
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
  const project = { id: projectId, shopifyOrderId: order.id, orderName: order.name, customerId: order.customer?.id ?? order.email ?? 'unknown-customer', customerName: order.customer?.displayName ?? order.email ?? 'Unknown Customer', customerEmail: order.customer?.email ?? order.email ?? null, serviceType: lineItem?.productType ?? lineItem?.title ?? 'Shopify Service Order', valueStatement: order.valueStatement ?? lineItem?.valueStatement ?? customerValueDoctrine.promise, customerGoal: order.customerGoal ?? customerValueDoctrine.support, doctrineAlignment: customerValueDoctrine.positioning, status: 'Intake', priority: 'High', orderTotal: Number(order.totalPrice ?? order.currentTotalPrice ?? 0), createdAt: new Date().toISOString() };
  state.projects.push(project);
  for (const [index, stage] of productionStages.entries()) state.productionJobs.push({ id: randomUUID(), projectId, stage, sequence: index + 1, status: index === 0 ? 'Ready' : 'Queued', createdAt: new Date().toISOString() });
  recordEvent('PROJECT_CREATED', `${project.orderName} created ${productionStages.length} Kairos production jobs around customer value.`, { projectId });
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
  const note = { id: randomUUID(), projectId, type: body.type || 'VALUE_STEWARDSHIP_NOTE', text, createdAt: new Date().toISOString() };
  state.notes.unshift(note);
  recordEvent('NOTE_ADDED', `Value stewardship note added to ${project.orderName}.`, { projectId, noteId: note.id });
  return json(res, 201, { note });
}

async function manualProject(req, res) {
  const body = await readBody(req);
  const id = Date.now();
  return intake({ ...req, on(event, handler) { if (event === 'data') handler(Buffer.from(JSON.stringify({ id: body.shopifyOrderId || `manual-${id}`, name: body.orderName || `MANUAL-${String(id).slice(-6)}`, email: body.customerEmail || 'manual@example.com', totalPrice: body.orderTotal || '0', valueStatement: body.valueStatement || customerValueDoctrine.promise, customerGoal: body.customerGoal || customerValueDoctrine.support, customer: { displayName: body.customerName || 'Manual Customer', email: body.customerEmail || 'manual@example.com' }, lineItems: [{ title: body.serviceType || 'Value Discovery', productType: body.serviceType || 'Value Discovery', valueStatement: body.valueStatement || customerValueDoctrine.promise, requiresProduction: true }] }))); if (event === 'end') handler(); } }, res);
}

function exportState() { return { exportedAt: new Date().toISOString(), version: state.version, mode: state.mode, doctrine: customerValueDoctrine, dashboard: dashboard(), commandQueue: state.commandQueue, projects: state.projects, productionJobs: state.productionJobs, notes: state.notes, events: state.events }; }
function resetLocalState() { state.projects = []; state.productionJobs = []; state.commandQueue = []; state.notes = []; state.events = []; recordEvent('STATE_RESET', 'Kairos local operator state was reset.'); }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && url.pathname === '/') return html(res);
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { ok: true, service: 'kairos-customer-value-local-operator', version: state.version, mode: state.mode, doctrine: customerValueDoctrine, startedAt: startedAt.toISOString(), uptimeSeconds: Math.round(process.uptime()), githubActions: 'manual-only; not used by this operator', dataFile: DATA_FILE });
    if (req.method === 'GET' && url.pathname === '/api/dashboard') return json(res, 200, dashboard());
    if (req.method === 'GET' && url.pathname === '/api/export') return json(res, 200, exportState());
    if (req.method === 'GET' && url.pathname === '/api/commands') return json(res, 200, state.commandQueue);
    if (req.method === 'POST' && url.pathname === '/api/commands') { const body = await readBody(req); return json(res, 201, createCommandWorkItem(body.command)); }
    const commandStatusMatch = url.pathname.match(/^\/api\/commands\/([^/]+)\/status$/);
    if (req.method === 'POST' && commandStatusMatch) { const body = await readBody(req); const item = updateCommandStatus(commandStatusMatch[1], String(body.status || '')); if (!item) return json(res, 404, { error: 'Command not found.' }); return json(res, 200, item); }
    if (req.method === 'GET' && url.pathname === '/api/projects/table') return json(res, 200, { count: visibleProjects(url.searchParams.get('search') || '', url.searchParams.get('status') || 'All', url.searchParams.get('priority') || 'All').length, html: projectRows(visibleProjects(url.searchParams.get('search') || '', url.searchParams.get('status') || 'All', url.searchParams.get('priority') || 'All')) });
    if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, state.projects);
    const projectPageMatch = url.pathname.match(/^\/projects\/([^/]+)$/);
    if (req.method === 'GET' && projectPageMatch) return projectDetailHtml(res, decodeURIComponent(projectPageMatch[1]));
    const projectApiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    const projectNoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/notes$/);
    if (req.method === 'POST' && projectNoteMatch) return addProjectNote(req, res, decodeURIComponent(projectNoteMatch[1]));
    if (req.method === 'GET' && projectApiMatch) { const project = state.projects.find(item => item.id === decodeURIComponent(projectApiMatch[1])); if (!project) return json(res, 404, { error: 'Project not found.' }); return json(res, 200, { project, productionJobs: state.productionJobs.filter(job => job.projectId === project.id).sort((a,b) => a.sequence - b.sequence) }); }
    if (req.method === 'GET' && url.pathname === '/api/production/jobs') return json(res, 200, state.productionJobs);
    if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, state.events);
    if (req.method === 'POST' && url.pathname === '/api/intake/shopify-order') return intake(req, res);
    if (req.method === 'POST' && url.pathname === '/api/intake/manual-project') return manualProject(req, res);
    const advanceMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/advance$/);
    if (req.method === 'POST' && advanceMatch) { const result = advanceJob(advanceMatch[1]); return json(res, result.status, result.payload); }
    if (req.method === 'POST' && url.pathname === '/api/reset') { resetLocalState(); return json(res, 200, { ok: true }); }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.listen(PORT, () => {
  console.log(`Kairos customer value operator online: http://localhost:${PORT}`);
  console.log('Customer promise active: Your Knowledge Has Value.');
});