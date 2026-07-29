const BUILD = "kairos-executive-live-details-20260729-1";
const root = document.querySelector("#kairos-executive-os");
const detailState = { workflows: [], loading: false, error: "", updatedAt: null };

if (root) {
  installStyles();
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
  }
}

function observeShell() {
  const observer = new MutationObserver(() => queueMicrotask(renderDetails));
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("online", refreshDetails);
  window.addEventListener("kairos:workflow:changed", refreshDetails);
}

function renderDetails() {
  root.querySelectorAll("[data-execution-detail]").forEach(node => node.remove());
  const heading = root.querySelector(".abos-hero h1")?.textContent || "";
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
    const workflows = selectWorkflows(isAssets);
    section.innerHTML = `<div class="abos-section-head"><div><p class="abos-kicker">${isAssets ? "Completion evidence" : "Live execution map"}</p><h2>${isAssets ? "Completed work and deliverables" : "What Kairos is doing next"}</h2></div><span class="abos-muted">${detailState.updatedAt ? `Updated ${detailState.updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Syncing"}</span></div>${workflows.length ? `<div class="abos-execution-list">${workflows.map(workflowCard).join("")}</div>` : emptyState(isAssets)}`;
  }

  host.insertAdjacentElement("afterend", section);
  section.querySelector("[data-detail-refresh]")?.addEventListener("click", refreshDetails);
  section.querySelector("[data-detail-create]")?.addEventListener("click", () => root.querySelector('[data-view="create"]')?.click());
}

function selectWorkflows(assetsMode) {
  const sorted = [...detailState.workflows].sort((a, b) => dateValue(b.updatedAt || b.completedAt || b.createdAt) - dateValue(a.updatedAt || a.completedAt || a.createdAt));
  if (assetsMode) return sorted.filter(item => normalizeState(item) === "completed").slice(0, 12);
  const priority = { blocked: 0, active: 1, pending: 2, queued: 3, completed: 4 };
  return sorted.sort((a, b) => (priority[normalizeState(a)] ?? 5) - (priority[normalizeState(b)] ?? 5)).slice(0, 8);
}

function workflowCard(item) {
  const state = normalizeState(item);
  const completed = number(item.completedTasks ?? item.progress?.completed ?? item.completedSteps);
  const total = number(item.taskCount ?? item.progress?.total ?? item.totalSteps);
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((completed / total) * 100))) : state === "completed" ? 100 : number(item.progressPercent ?? item.percentComplete);
  const blocker = firstText(item.blockedReason, item.blocker, item.error?.message, item.statusReason);
  const nextAction = firstText(item.nextAction, item.nextStep, item.currentTask, item.currentStage, deriveNextAction(state));
  const evidence = arrayLength(item.deliverables) + arrayLength(item.assets) + arrayLength(item.receipts);
  const meta = [item.department, item.workflowType, item.id].filter(Boolean).slice(0, 2).map(escapeHTML).join(" · ");
  return `<article class="abos-execution-card" data-state="${escapeHTML(state)}"><div class="abos-execution-top"><div><p class="abos-execution-meta">${meta || "Kairos workflow"}</p><h3>${escapeHTML(item.title || item.objective || item.workflowType || "Governed work")}</h3><p>${escapeHTML(item.summary || item.objective || "Kairos is coordinating this work through the governed runtime.")}</p></div><span class="abos-pill">${escapeHTML(state)}</span></div><div class="abos-progress" role="progressbar" aria-label="Workflow progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="--progress:${percent}%"></span></div><div class="abos-execution-stats"><span><b>${percent}%</b> complete</span><span><b>${completed}${total ? ` / ${total}` : ""}</b> steps</span><span><b>${evidence}</b> evidence items</span></div>${blocker ? `<div class="abos-blocker"><strong>Blocked:</strong> ${escapeHTML(blocker)}</div>` : `<div class="abos-next"><strong>Next:</strong> ${escapeHTML(nextAction)}</div>`}</article>`;
}

function emptyState(assetsMode) {
  return `<div class="abos-empty"><p>${assetsMode ? "No completed workflow deliverables are currently listed." : "No live workflow detail is currently listed."}</p>${assetsMode ? "" : '<button class="abos-secondary" data-detail-create>Start a new objective</button>'}</div>`;
}

function normalizeState(item) {
  return String(item.state || item.status || "queued").toLowerCase().replaceAll("_", "-");
}
function deriveNextAction(state) {
  if (state === "blocked") return "Resolve the visible blocker before execution continues.";
  if (state === "completed") return "Review the completed evidence and deliverables.";
  if (state === "active") return "Complete the current governed execution step.";
  return "Wait for Kairos to advance the workflow or request approval.";
}
function firstText(...values) { return values.find(value => typeof value === "string" && value.trim()) || "Review the workflow status."; }
function arrayLength(value) { return Array.isArray(value) ? value.length : 0; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function dateValue(value) { const parsed = Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : 0; }
function installStyles() {
  if (document.querySelector('link[data-kairos-live-details]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./styles/executive-os-live-details.css?v=20260729-1";
  link.dataset.kairosLiveDetails = "true";
  document.head.append(link);
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
