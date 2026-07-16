const BUILD = "kairos-workflow-runtime-ui-20260716-3";
const state = { open: false, loading: false, workflows: [], selected: null, error: "", notice: "", filter: "all" };

start();

function start() {
  document.addEventListener("click", interceptWorkQueue, true);
  window.addEventListener("kairos:workflow-runtime:open", openWorkspace);
}

function interceptWorkQueue(event) {
  const button = event.target.closest?.('[data-child="work-queue"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openWorkspace();
}

async function openWorkspace(event) {
  state.open = true;
  state.filter = normalizeFilter(event?.detail?.filter || "all");
  await loadQueue();
  render();
  setTimeout(() => document.querySelector("#workflow-runtime")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
}

async function loadQueue() {
  state.loading = true; state.error = ""; render();
  try {
    const { response, body } = await request("/api/workflows");
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not load the production queue.");
    state.workflows = body.workflows || [];
  } catch (error) { state.error = error.message || "Kairos could not load the production queue."; }
  finally { state.loading = false; render(); }
}

async function createWorkflow(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  state.loading = true; state.error = ""; render();
  try {
    const { response, body } = await request("/api/workflows", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: data.get("title"), objective: data.get("objective"), center: data.get("center"), priority: data.get("priority"),
        approvalRequired: data.get("approvalRequired") === "on", source: "command-center-work-queue",
      }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not create the workflow.");
    state.selected = body.workflow;
    state.filter = "all";
    form.reset();
    await loadQueue();
  } catch (error) { state.error = error.message || "Kairos could not create the workflow."; }
  finally { state.loading = false; render(); }
}

async function openWorkflow(id) {
  state.loading = true; state.error = ""; render();
  try {
    const { response, body } = await request(`/api/workflows/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not open the workflow.");
    state.selected = body.workflow;
  } catch (error) { state.error = error.message || "Kairos could not open the workflow."; }
  finally { state.loading = false; render(); }
}

async function workflowCommand(command) {
  if (!state.selected) return;
  state.loading = true; state.error = ""; state.notice = ""; render();
  try {
    const { response, body } = await request(`/api/workflows/${encodeURIComponent(state.selected.id)}`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ command, actor: "Executive" }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not update the workflow.");
    state.selected = body.workflow;
    if (command === "approve") state.notice = "Approved. Kairos started the targeted native execution cycle; refresh or use Run Kairos Now to read the latest verified artifacts.";
    await loadQueue();
  } catch (error) { state.error = error.message || "Kairos could not update the workflow."; }
  finally { state.loading = false; render(); }
}

async function runKairos() {
  if (!state.selected) return;
  const workflowID = state.selected.id;
  state.loading = true; state.error = ""; state.notice = "Kairos is analyzing authoritative records and producing verified native deliverables…"; render();
  try {
    const { response, body } = await request("/api/autonomy/run", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ source: "work-queue-targeted-cycle", workflowID }),
    });
    if (!response.ok && response.status !== 202) throw new Error(body?.error?.message || "Kairos could not run the targeted workflow cycle.");
    const read = await request(`/api/workflows/${encodeURIComponent(workflowID)}`);
    if (read.response.ok) state.selected = read.body.workflow;
    state.notice = body.status === "deferred"
      ? "A Kairos cycle for this workflow is already running or was just completed. The durable result will appear on refresh."
      : `Kairos preserved ${Number(body.actionsApplied || 0)} verified native task artifact${Number(body.actionsApplied || 0) === 1 ? "" : "s"} in cycle ${body.id || "complete"}.`;
    await loadQueue();
  } catch (error) { state.error = error.message || "Kairos could not run the targeted workflow cycle."; }
  finally { state.loading = false; render(); }
}

async function addTask(event) {
  event.preventDefault();
  if (!state.selected) return;
  const data = new FormData(event.currentTarget);
  state.loading = true; state.error = ""; render();
  try {
    const { response, body } = await request(`/api/workflows/${encodeURIComponent(state.selected.id)}/tasks`, {
      method: "POST", headers: headers(), body: JSON.stringify({ title: data.get("title"), description: data.get("description") }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not add the task.");
    state.selected = body.workflow;
    await loadQueue();
  } catch (error) { state.error = error.message || "Kairos could not add the task."; }
  finally { state.loading = false; render(); }
}

async function setTask(taskID, taskState) {
  if (!state.selected) return;
  state.loading = true; state.error = ""; render();
  try {
    const { response, body } = await request(`/api/workflows/${encodeURIComponent(state.selected.id)}/tasks/${encodeURIComponent(taskID)}`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ state: taskState }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not update the task.");
    state.selected = body.workflow;
    await loadQueue();
  } catch (error) { state.error = error.message || "Kairos could not update the task."; }
  finally { state.loading = false; render(); }
}

function render() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub) return;
  let root = document.querySelector("#workflow-runtime");
  if (!state.open) { root?.remove(); return; }
  if (!root) {
    root = document.createElement("section");
    root.id = "workflow-runtime";
    root.className = "workflow-runtime workspace";
    hub.appendChild(root);
  }
  root.innerHTML = `<header class="workflow-head"><div><p class="eyebrow">Operations · Work Queue</p><h2>Workflow Runtime</h2><p>Create work, let Kairos produce verified native deliverables, inspect the evidence, and stop at constitutional approval gates.</p></div><button type="button" data-close-workflow>Close</button></header>${state.error ? `<p class="workflow-error">${escapeHTML(state.error)}</p>` : ""}${state.notice ? `<p class="workflow-notice">${escapeHTML(state.notice)}</p>` : ""}<div class="workflow-filter-bar">${filterButton("all","All Work")}${filterButton("active","In Progress")}${filterButton("finished","Done 24h")}${filterButton("pending","Not Started")}</div><div class="workflow-layout"><section class="workflow-create"><h3>New Workflow</h3><form data-workflow-form><label>Title<input name="title" maxlength="180" required placeholder="Example: Finish tonight’s TikTok package"></label><label>Objective<textarea name="objective" maxlength="4000" required placeholder="Describe the finished outcome."></textarea></label><div class="workflow-fields"><label>Center<select name="center"><option value="content">Content</option><option value="business">Business</option><option value="customers">Customers</option><option value="knowledge">Knowledge</option><option value="operations">Operations</option></select></label><label>Priority<select name="priority"><option value="high">High</option><option value="normal" selected>Normal</option><option value="critical">Critical</option><option value="low">Low</option></select></label></div><label class="workflow-check"><input type="checkbox" name="approvalRequired"> Require executive approval before start</label><button class="primary" type="submit">Create Workflow</button></form></section><section class="workflow-queue"><div class="workflow-section-head"><div><h3>${escapeHTML(filterTitle())}</h3><small>${filteredWorkflows().length} workflow${filteredWorkflows().length===1?"":"s"}</small></div><button type="button" data-refresh-workflows>Refresh</button></div>${state.loading ? `<p class="workflow-loading">Kairos is updating the queue…</p>` : queueMarkup()}</section></div>${state.selected ? detailMarkup(state.selected) : ""}`;
  bind();
}

function filterButton(filter,label){return `<button type="button" class="workflow-filter ${state.filter===filter?"active":""}" data-workflow-filter="${filter}">${label}</button>`;}
function normalizeFilter(filter){return ["all","active","finished","pending"].includes(filter)?filter:"all";}
function filteredWorkflows(){const cutoff=Date.now()-24*60*60*1000;return state.workflows.filter(item=>state.filter==="all"?true:state.filter==="active"?item.state==="active":state.filter==="finished"?item.state==="completed"&&Date.parse(item.updatedAt||item.completedAt||0)>=cutoff:!["active","completed","cancelled"].includes(item.state));}
function filterTitle(){return ({all:"Production Queue",active:"In Progress",finished:"Completed in the Last 24 Hours",pending:"Not Started"})[state.filter]||"Production Queue";}

function queueMarkup() {
  const workflows=filteredWorkflows();
  if (!workflows.length) return `<div class="workflow-empty"><strong>No ${escapeHTML(filterTitle().toLowerCase())} workflows.</strong><p>The counter will update when governed work enters this state.</p></div>`;
  return `<div class="workflow-list">${workflows.map(item => `<button type="button" class="workflow-row" data-open-workflow="${escapeHTML(item.id)}"><span class="workflow-priority" data-priority="${escapeHTML(item.priority)}"></span><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.center)} · ${escapeHTML(item.state)} · ${item.completedTasks}/${item.taskCount} tasks</small></div><b>${Number(item.progress || 0)}%</b></button>`).join("")}</div>`;
}

function detailMarkup(workflow) {
  const canStart = workflow.state === "ready" && (!workflow.approvalRequired || workflow.approvalStatus === "approved");
  const canRun = !["completed","cancelled"].includes(workflow.state) && (!workflow.approvalRequired || workflow.approvalStatus === "approved");
  return `<section class="workflow-detail"><header><div><p class="eyebrow">${escapeHTML(workflow.center)} · ${escapeHTML(workflow.priority)} priority</p><h3>${escapeHTML(workflow.title)}</h3><p>${escapeHTML(workflow.objective)}</p></div><div class="workflow-progress"><strong>${Number(workflow.progress || 0)}%</strong><span>${escapeHTML(workflow.state)}</span></div></header><div class="workflow-meter"><span style="width:${Number(workflow.progress || 0)}%"></span></div><div class="workflow-actions">${workflow.approvalRequired && workflow.approvalStatus !== "approved" ? `<button type="button" data-workflow-command="approve">Approve & Start Kairos</button>` : ""}${canStart ? `<button class="primary" type="button" data-workflow-command="start">Start</button>` : ""}${canRun ? `<button class="primary" type="button" data-run-kairos>Run Kairos Now</button>` : ""}${workflow.state === "blocked" ? `<button type="button" data-workflow-command="resume">Resume</button>` : ""}${workflow.state === "active" ? `<button type="button" data-workflow-command="block">Block</button>` : ""}${workflow.progress === 100 && workflow.state !== "completed" ? `<button class="primary" type="button" data-workflow-command="complete">Complete</button>` : ""}${!["completed","cancelled"].includes(workflow.state) ? `<button type="button" data-workflow-command="cancel">Cancel</button>` : ""}</div><div class="workflow-tasks">${workflow.tasks.map(taskMarkup).join("")}</div><form class="workflow-add-task" data-task-form><input name="title" maxlength="240" required placeholder="Add another task"><input name="description" maxlength="2000" placeholder="Task description"><button type="submit">Add Task</button></form></section>`;
}

function taskMarkup(task) {
  const output = task.nativeOutput;
  const evidence = Array.isArray(output?.evidenceReferences) ? output.evidenceReferences : [];
  const verification = Array.isArray(output?.verification) ? output.verification : [];
  return `<article><div class="workflow-task-copy"><div class="workflow-task-labels"><span>${escapeHTML(task.stage || "unclassified")}</span><span>${escapeHTML(task.executionClass || "native-analysis")}</span></div><strong>${escapeHTML(task.title)}</strong><p>${escapeHTML(task.description || "")}</p></div><select data-task-state="${escapeHTML(task.id)}"><option value="ready" ${task.state === "ready" ? "selected" : ""}>Ready</option><option value="active" ${task.state === "active" ? "selected" : ""}>Active</option><option value="blocked" ${task.state === "blocked" ? "selected" : ""}>Blocked</option><option value="completed" ${task.state === "completed" ? "selected" : ""}>Completed</option><option value="cancelled" ${task.state === "cancelled" ? "selected" : ""}>Cancelled</option></select>${output ? `<details class="workflow-native-output" open><summary>Verified Kairos deliverable · ${escapeHTML(output.artifactID || "artifact")}</summary><h4>${escapeHTML(output.deliverable?.title || task.title)}</h4><p>${escapeHTML(output.summary || "")}</p><div class="workflow-deliverable">${escapeHTML(output.deliverable?.content || "")}</div><dl><div><dt>Evidence</dt><dd>${evidence.map(escapeHTML).join(" · ") || "No reference"}</dd></div><div><dt>Verification</dt><dd>${verification.map(escapeHTML).join(" · ") || "No verification"}</dd></div><div><dt>Read-back hash</dt><dd>${escapeHTML(output.contentHash || "")}</dd></div><div><dt>Next action</dt><dd>${escapeHTML(output.nextAction || "Review the preserved artifact.")}</dd></div></dl></details>` : ""}</article>`;
}

function bind() {
  document.querySelector("[data-close-workflow]")?.addEventListener("click", () => { state.open = false; state.selected = null; render(); });
  document.querySelector("[data-refresh-workflows]")?.addEventListener("click", loadQueue);
  document.querySelector("[data-workflow-form]")?.addEventListener("submit", createWorkflow);
  document.querySelector("[data-task-form]")?.addEventListener("submit", addTask);
  document.querySelectorAll("[data-workflow-filter]").forEach(button=>button.addEventListener("click",()=>{state.filter=normalizeFilter(button.dataset.workflowFilter);state.selected=null;render();}));
  document.querySelectorAll("[data-open-workflow]").forEach(button => button.addEventListener("click", () => openWorkflow(button.dataset.openWorkflow)));
  document.querySelectorAll("[data-workflow-command]").forEach(button => button.addEventListener("click", () => workflowCommand(button.dataset.workflowCommand)));
  document.querySelector("[data-run-kairos]")?.addEventListener("click", runKairos);
  document.querySelectorAll("[data-task-state]").forEach(select => select.addEventListener("change", () => setTask(select.dataset.taskState, select.value)));
}

function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
