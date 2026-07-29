const BUILD = "kairos-executive-live-details-20260729-3";
const root = document.querySelector("#kairos-executive-os");
const detailState = { workflows: [], loading: false, error: "", actionError: "", updatedAt: null, selectedID: "", workingID: "" };

if (root) {
  installStyles();
  installOperationalStyles();
  observeShell();
  refreshDetails();
  setInterval(refreshDetails, 60000);
}

async function refreshDetails() {
  if (detailState.loading) return;
  detailState.loading = true;
  try {
    const response = await fetch("/api/workflows", { cache: "no-store", credentials: "include", headers: { "X-MMG-Client-Build": BUILD } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Workflow detail returned ${response.status}.`);
    detailState.workflows = Array.isArray(body?.workflows) ? body.workflows : [];
    detailState.error = "";
    detailState.updatedAt = new Date();
  } catch (error) {
    detailState.error = String(error?.message || "Live execution detail is temporarily unavailable.");
  } finally {
    detailState.loading = false;
    renderDetails();
    renderSelectedWorkflow();
  }
}

function observeShell() {
  const observer = new MutationObserver(() => queueMicrotask(renderDetails));
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("online", refreshDetails);
  window.addEventListener("kairos:workflow:changed", refreshDetails);
  window.addEventListener("keydown", event => { if (event.key === "Escape") closeWorkflow(); });
}

function renderDetails() {
  root.querySelectorAll("[data-execution-detail]").forEach(node => node.remove());
  const isToday = root.querySelector('[data-view="today"][aria-current="page"]');
  const isAssets = root.querySelector('[data-view="assets"][aria-current="page"]');
  if (!isToday && !isAssets) return;

  const host = isToday ? root.querySelector(".abos-section") : root.querySelector(".abos-main");
  if (!host) return;
  const section = document.createElement("section");
  section.className = "abos-execution-detail";
  section.dataset.executionDetail = "true";

  if (detailState.error && !detailState.workflows.length) {
    section.innerHTML = `<div class="abos-section-head"><div><p class="abos-kicker">Live execution</p><h2>Workflow detail unavailable</h2></div><button class="abos-secondary" data-detail-refresh>Retry</button></div><p class="abos-detail-error">${escapeHTML(detailState.error)}</p>`;
  } else {
    const workflows = selectWorkflows(Boolean(isAssets));
    section.innerHTML = `<div class="abos-section-head"><div><p class="abos-kicker">${isAssets ? "Completion evidence" : "Live execution map"}</p><h2>${isAssets ? "Completed work and deliverables" : "What Kairos is doing next"}</h2></div><span class="abos-muted">${detailState.updatedAt ? `Updated ${detailState.updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Syncing"}</span></div>${workflows.length ? `<div class="abos-execution-list">${workflows.map(workflowCard).join("")}</div>` : emptyState(Boolean(isAssets))}`;
  }

  host.insertAdjacentElement("afterend", section);
  section.querySelector("[data-detail-refresh]")?.addEventListener("click", refreshDetails);
  section.querySelector("[data-detail-create]")?.addEventListener("click", () => root.querySelector('[data-view="create"]')?.click());
  section.querySelectorAll("[data-workflow-open]").forEach(button => button.addEventListener("click", () => openWorkflow(button.dataset.workflowOpen)));
}

function selectWorkflows(assetsMode) {
  const sorted = [...detailState.workflows].sort((a, b) => dateValue(b.updatedAt || b.completedAt || b.createdAt) - dateValue(a.updatedAt || a.completedAt || a.createdAt));
  if (assetsMode) return sorted.filter(item => normalizeState(item) === "completed").slice(0, 12);
  const priority = { blocked: 0, pending: 1, queued: 2, active: 3, completed: 4 };
  return sorted.sort((a, b) => (priority[normalizeState(a)] ?? 5) - (priority[normalizeState(b)] ?? 5)).slice(0, 8);
}

function workflowCard(item) {
  const state = normalizeState(item);
  const progress = workflowProgress(item, state);
  const blocker = firstText(item.blockedReason, item.blocker, item.error?.message, item.statusReason);
  const nextAction = firstText(item.nextAction, item.nextStep, item.currentTask, item.currentStage, deriveNextAction(state));
  const evidence = evidenceItems(item).length;
  const meta = [item.department, item.workflowType, item.id].filter(Boolean).slice(0, 2).map(escapeHTML).join(" · ");
  const actionLabel = actionRequiredLabel(item);
  return `<article class="abos-execution-card" data-state="${escapeHTML(state)}"><button class="abos-card-open" data-workflow-open="${escapeHTML(workflowID(item))}" aria-label="Open workflow details"><div class="abos-execution-top"><div><p class="abos-execution-meta">${meta || "Kairos workflow"}</p><h3>${escapeHTML(item.title || item.objective || item.workflowType || "Governed work")}</h3><p>${escapeHTML(item.summary || item.objective || "Kairos is coordinating this work through the governed runtime.")}</p></div><span class="abos-pill">${escapeHTML(state)}</span></div><div class="abos-progress" role="progressbar" aria-label="Workflow progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span style="--progress:${progress.percent}%"></span></div><div class="abos-execution-stats"><span><b>${progress.percent}%</b> complete</span><span><b>${progress.completed}${progress.total ? ` / ${progress.total}` : ""}</b> steps</span><span><b>${evidence}</b> evidence items</span></div>${blocker && state === "blocked" ? `<div class="abos-blocker"><strong>Blocked:</strong> ${escapeHTML(blocker)}</div>` : `<div class="abos-next"><strong>${actionLabel ? "Action required" : "Next"}:</strong> ${escapeHTML(nextAction)}</div>`}<span class="abos-open-label">${actionLabel ? `${escapeHTML(actionLabel)} →` : "Open workflow →"}</span></button></article>`;
}

function openWorkflow(id) {
  detailState.selectedID = id || "";
  detailState.actionError = "";
  renderSelectedWorkflow();
}

function closeWorkflow() {
  detailState.selectedID = "";
  detailState.actionError = "";
  document.querySelector("[data-workflow-dialog]")?.remove();
  document.body.classList.remove("abos-dialog-open");
}

function renderSelectedWorkflow() {
  document.querySelector("[data-workflow-dialog]")?.remove();
  if (!detailState.selectedID) return;
  const item = detailState.workflows.find(workflow => workflowID(workflow) === detailState.selectedID);
  if (!item) return closeWorkflow();
  const state = normalizeState(item);
  const progress = workflowProgress(item, state);
  const tasks = taskItems(item);
  const evidence = evidenceItems(item);
  const blocker = firstText(item.blockedReason, item.blocker, item.error?.message, item.statusReason);
  const nextAction = firstText(item.nextAction, item.nextStep, item.currentTask, item.currentStage, deriveNextAction(state));
  const dialog = document.createElement("div");
  dialog.className = "abos-workflow-dialog";
  dialog.dataset.workflowDialog = "true";
  dialog.dataset.workflowId = workflowID(item);
  dialog.innerHTML = `<div class="abos-dialog-backdrop" data-dialog-close></div><section class="abos-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="abos-workflow-title"><header class="abos-dialog-head"><div><p class="abos-kicker">${escapeHTML(item.department || item.workflowType || "Kairos workflow")}</p><h2 id="abos-workflow-title">${escapeHTML(item.title || item.objective || item.workflowType || "Governed work")}</h2></div><button class="abos-dialog-close" data-dialog-close aria-label="Close workflow details">×</button></header><p class="abos-dialog-summary">${escapeHTML(item.summary || item.objective || "Kairos is coordinating this work through the governed runtime.")}</p><div class="abos-dialog-metrics"><span><b>${progress.percent}%</b> complete</span><span><b>${progress.completed}${progress.total ? ` / ${progress.total}` : ""}</b> steps</span><span><b>${escapeHTML(state)}</b> status</span></div><div class="abos-progress" role="progressbar" aria-label="Workflow detail progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span style="--progress:${progress.percent}%"></span></div>${blocker && state === "blocked" ? `<div class="abos-blocker"><strong>Blocked:</strong> ${escapeHTML(blocker)}</div>` : `<div class="abos-next"><strong>Next:</strong> ${escapeHTML(nextAction)}</div>`}${detailState.actionError ? `<div class="abos-action-error" role="alert">${escapeHTML(detailState.actionError)}</div>` : ""}<section class="abos-dialog-section"><h3>Execution timeline</h3>${tasks.length ? `<ol class="abos-task-list">${tasks.map(taskRow).join("")}</ol>` : `<div class="abos-empty">No task-level timeline is currently available.</div>`}</section><section class="abos-dialog-section"><h3>Evidence and deliverables</h3>${evidence.length ? `<div class="abos-evidence-list">${evidence.map(evidenceRow).join("")}</div>` : `<div class="abos-empty">No linked evidence is currently available.</div>`}</section>${workflowActions(item)}<footer class="abos-dialog-footer"><span>Workflow ID: ${escapeHTML(workflowID(item))}</span><button class="abos-secondary" data-dialog-close>Close</button></footer></section>`;
  document.body.append(dialog);
  document.body.classList.add("abos-dialog-open");
  dialog.querySelectorAll("[data-dialog-close]").forEach(button => button.addEventListener("click", closeWorkflow));
  dialog.querySelectorAll("[data-workflow-action]").forEach(button => button.addEventListener("click", () => performWorkflowAction(item, button.dataset.workflowAction)));
  dialog.querySelector(".abos-dialog-close")?.focus();
}

function workflowActions(item) {
  const disabled = detailState.workingID === workflowID(item) ? " disabled aria-busy=\"true\"" : "";
  const buttons = [];
  if (item.canResume) buttons.push(`<button class="abos-primary" data-workflow-action="resume"${disabled}>${detailState.workingID ? "Resuming…" : "Resume workflow"}</button>`);
  if (item.canApprove) buttons.push(`<button class="abos-primary" data-workflow-action="approve"${disabled}>${detailState.workingID ? "Preparing source…" : "Approve foundation"}</button>`);
  if (item.canReject) buttons.push(`<button class="abos-secondary" data-workflow-action="reject"${disabled}>Request revision</button>`);
  if (item.canStartProduction) buttons.push(`<button class="abos-primary" data-workflow-action="start-production"${disabled}>${detailState.workingID ? "Starting…" : "Start production"}</button>`);
  if (!buttons.length) return "";
  return `<section class="abos-dialog-section abos-action-section"><h3>Governed action</h3><p>${escapeHTML(actionExplanation(item))}</p><div class="abos-dialog-actions">${buttons.join("")}</div></section>`;
}

async function performWorkflowAction(item, action) {
  const id = workflowID(item);
  if (!id || detailState.workingID) return;
  if (action === "start-production" && !window.confirm("Start the approved Kairos production workflow now?")) return;
  let reason = "";
  if (action === "reject") {
    reason = window.prompt("What revision does the foundation require?", "Revise the production foundation before execution.") || "";
    if (!reason.trim()) return;
  }
  detailState.workingID = id;
  detailState.actionError = "";
  renderSelectedWorkflow();
  try {
    const response = await fetch(`/api/workflows/${encodeURIComponent(id)}/${encodeURIComponent(action)}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify(reason ? { reason } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Kairos returned ${response.status}.`);
    window.dispatchEvent(new CustomEvent("kairos:workflow:changed", { detail: { workflowID: id, action } }));
    await refreshDetails();
  } catch (error) {
    detailState.actionError = String(error?.message || "Kairos could not complete the governed action.");
  } finally {
    detailState.workingID = "";
    renderSelectedWorkflow();
  }
}

function taskRow(task, index) {
  const state = String(task.state || task.status || (task.completed ? "completed" : "pending")).toLowerCase();
  const title = task.title || task.name || task.label || task.description || `Step ${index + 1}`;
  const detail = task.summary || task.description || task.result || "";
  return `<li data-state="${escapeHTML(state)}"><i aria-hidden="true"></i><div><strong>${escapeHTML(title)}</strong>${detail && detail !== title ? `<p>${escapeHTML(detail)}</p>` : ""}</div><span>${escapeHTML(state)}</span></li>`;
}

function evidenceRow(item, index) {
  const title = item.title || item.name || item.label || item.filename || `Evidence ${index + 1}`;
  const detail = item.summary || item.description || item.type || item.kind || "Linked workflow evidence";
  const href = safeHref(item.url || item.href || item.downloadUrl || item.previewUrl || item.path);
  return `<article><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(detail)}</p></div>${href ? `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">Open</a>` : `<span>Recorded</span>`}</article>`;
}

function taskItems(item) {
  for (const value of [item.tasks, item.steps, item.timeline, item.progress?.steps]) if (Array.isArray(value)) return value;
  return [];
}
function evidenceItems(item) {
  return [item.deliverables, item.assets, item.receipts, item.evidence].flatMap(value => Array.isArray(value) ? value : []);
}
function workflowProgress(item, state) {
  const completed = number(item.completedTasks ?? item.progress?.completed ?? item.completedSteps);
  const total = number(item.taskCount ?? item.progress?.total ?? item.totalSteps);
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((completed / total) * 100))) : state === "completed" ? 100 : Math.min(100, number(item.progressPercent ?? item.percentComplete));
  return { completed, total, percent };
}
function workflowID(item) { return String(item.id || item.workflowID || item.workflowId || item.runID || item.runId || ""); }
function safeHref(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const href = value.trim();
  if (/^https?:\/\//i.test(href) || href.startsWith("/") || href.startsWith("./")) return href;
  return "";
}
function emptyState(assetsMode) {
  return `<div class="abos-empty"><p>${assetsMode ? "No completed workflow deliverables are currently listed." : "No live workflow detail is currently listed."}</p>${assetsMode ? "" : '<button class="abos-secondary" data-detail-create>Start a new objective</button>'}</div>`;
}
function normalizeState(item) { return String(item.state || item.status || "queued").toLowerCase().replaceAll("_", "-"); }
function deriveNextAction(state) {
  if (state === "blocked") return "Resolve the visible blocker before execution continues.";
  if (state === "completed") return "Review the completed evidence and deliverables.";
  if (state === "active") return "Complete the current governed execution step.";
  return "Wait for Kairos to advance the workflow or request approval.";
}
function actionRequiredLabel(item) {
  if (item.canApprove) return "Approve foundation";
  if (item.canStartProduction) return "Start production";
  if (item.canResume) return "Resume workflow";
  return "";
}
function actionExplanation(item) {
  if (item.canApprove) return "Approval authorizes Kairos to generate and durably store the authoritative source. It does not publish or modify Shopify.";
  if (item.canStartProduction) return "Start Production authorizes the durable manuscript workflow. Publication and commerce changes remain separately approval-gated.";
  if (item.canResume) return "Resume reconnects this intake record to the persistent project Agent and foundation Workflow.";
  return "This action remains governed by Kairos approval policy.";
}
function firstText(...values) { return values.find(value => typeof value === "string" && value.trim()) || "Review the workflow status."; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function dateValue(value) { const parsed = Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : 0; }
function installStyles() {
  if (document.querySelector('link[data-kairos-live-details]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./styles/executive-os-live-details.css?v=20260729-2";
  link.dataset.kairosLiveDetails = "true";
  document.head.append(link);
}
function installOperationalStyles() {
  if (document.querySelector("style[data-kairos-operational-actions]")) return;
  const style = document.createElement("style");
  style.dataset.kairosOperationalActions = "true";
  style.textContent = ".abos-action-section{padding:16px;border:1px solid rgba(47,155,255,.28);border-radius:16px;background:rgba(47,155,255,.06)}.abos-action-section>p{margin:0 0 14px;color:var(--abos-muted);font-size:12px;line-height:1.5}.abos-dialog-actions{display:flex;gap:10px;flex-wrap:wrap}.abos-dialog-actions button[disabled]{opacity:.55;cursor:wait}.abos-action-error{margin-top:12px;padding:11px 12px;border-radius:12px;background:rgba(255,101,119,.1);color:#ffb0ba;font-size:12px;line-height:1.45}@media(max-width:640px){.abos-dialog-actions{display:grid}.abos-dialog-actions button{width:100%}}";
  document.head.append(style);
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
