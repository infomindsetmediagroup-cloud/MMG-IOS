const BUILD = "kairos-system-registry-ui-20260715-1";
const state = { open: false, loading: false, error: "", registry: null, query: "" };

window.addEventListener("kairos:system-registry:open", openWorkspace);

async function openWorkspace(event) {
  state.open = true;
  state.query = String(event.detail?.query || "");
  render();
  await load();
}

async function load() {
  state.loading = true;
  state.error = "";
  render();
  try {
    const response = await fetch(`/api/system-registry?ts=${Date.now()}`, { cache: "no-store", credentials: "include", headers: { "X-MMG-Client-Build": BUILD } });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not load the system registry.");
    state.registry = body;
  } catch (failure) {
    state.error = failure instanceof Error ? failure.message : "Kairos could not load the system registry.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  document.querySelector("#system-registry-workspace")?.remove();
  if (!state.open) return;
  const page = document.querySelector(".child-workspace-page");
  if (!page) return;
  const root = document.createElement("section");
  root.id = "system-registry-workspace";
  root.className = "system-registry-workspace";
  root.innerHTML = `<header><div><p class="eyebrow">Operations · Source of Truth</p><h2>Canonical System Registry</h2><p>Inspect the actual UI module, domain owner, API routes, persistence contract, and runtime state behind every Kairos action.</p></div><button type="button" data-registry-refresh>Refresh Registry</button></header>${state.error ? `<p class="system-registry-error">${escapeHTML(state.error)}</p>` : ""}${state.loading ? loadingMarkup() : registryMarkup()}`;
  page.appendChild(root);
  bind(root);
}

function loadingMarkup() {
  return `<p class="system-registry-loading"><i></i>Reading runtime, capability, readiness, workflow, and execution records…</p>`;
}

function registryMarkup() {
  const registry = state.registry;
  if (!registry) return `<p class="system-registry-empty">No registry snapshot is available.</p>`;
  const actions = filteredActions(registry.actions || []);
  return `<section class="system-registry-summary"><article><span>Canonical actions</span><strong>${Number(registry.counts?.actions || 0)}</strong></article><article><span>Durable workflows</span><strong>${Number(registry.counts?.workflows || 0)}</strong></article><article><span>Work items</span><strong>${Number(registry.counts?.workItems || 0)}</strong></article><article><span>Execution receipts</span><strong>${Number(registry.counts?.executionReceipts || 0)}</strong></article></section><section class="system-registry-runtime"><div><span>Operational source</span><strong>${escapeHTML(registry.sourceOfTruth || "Unknown")}</strong></div><div><span>Private intelligence</span><strong data-state="${escapeAttribute(registry.intelligence?.privateRuntime)}">${escapeHTML(registry.intelligence?.privateRuntime || "unknown")}</strong></div><div><span>Native analysis</span><strong>${escapeHTML(registry.intelligence?.nativeObjectiveAnalysis || "unknown")}</strong></div></section><label class="system-registry-search">Filter services, routes, owners, or actions<input type="search" value="${escapeAttribute(state.query)}" placeholder="Example: publishing, workflow, /api/offers" data-registry-query></label><div class="system-registry-table" role="table"><div class="system-registry-row system-registry-heading" role="row"><span>Action</span><span>Owner</span><span>Runtime</span><span>Persistence</span></div>${actions.map(actionRow).join("") || `<p class="system-registry-empty">No registry entries match this filter.</p>`}</div>`;
}

function actionRow(action) {
  const routes = Array.isArray(action.apiRoutes) ? action.apiRoutes : [];
  return `<article class="system-registry-row" role="row" data-status="${escapeAttribute(action.status)}"><div><strong>${escapeHTML(action.title || action.id)}</strong><small>${escapeHTML(action.center)} · ${escapeHTML(action.id)}</small></div><div><strong>${escapeHTML(action.owner || "Unassigned")}</strong><small>${escapeHTML(action.module || "native command view")}</small></div><div><strong>${escapeHTML(action.ui || "unknown")}</strong><small>${escapeHTML(action.event || "direct route")}</small></div><div><strong>${escapeHTML(action.persistence || "unknown")}</strong><small>${routes.map(escapeHTML).join(" · ")}</small></div></article>`;
}

function filteredActions(actions) {
  const query = state.query.trim().toLowerCase();
  if (!query) return actions;
  return actions.filter(action => JSON.stringify(action).toLowerCase().includes(query));
}

function bind(root) {
  root.querySelector("[data-registry-refresh]")?.addEventListener("click", load);
  root.querySelector("[data-registry-query]")?.addEventListener("input", event => {
    state.query = event.currentTarget.value;
    render();
    const input = document.querySelector("[data-registry-query]");
    input?.focus();
    input?.setSelectionRange(state.query.length, state.query.length);
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function escapeAttribute(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }

window.KairosSystemRegistry = { build: BUILD, open: openWorkspace, refresh: load };
