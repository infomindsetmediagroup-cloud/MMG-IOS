const BUILD = "kairos-abos-v2-browser-finish-20260729-2";
const STORAGE_KEY = "kairos.executive-os.session.v2";
const root = document.createElement("main");
root.id = "kairos-executive-os";
root.className = "abos-shell";
root.setAttribute("aria-busy", "false");
document.body.prepend(root);
document.body.classList.add("abos-active");

const restored = restoreSession();
const state = {
  view: restored.view || "today",
  health: null,
  workflows: [],
  briefing: null,
  loading: false,
  error: "",
  warnings: [],
  objective: restored.objective || "",
  lastUpdated: null,
};
const nav = ["today", "approvals", "create", "assets", "growth", "settings"];

start();

function start() {
  bindGlobalEvents();
  refresh();
  setInterval(() => refresh({ quiet: true }), 60000);
}

async function refresh({ quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  state.error = "";
  state.warnings = [];
  root.setAttribute("aria-busy", "true");
  if (!quiet) render();

  const requests = [
    ["Runtime health", "/api/health"],
    ["Workflows", "/api/workflows"],
    ["Executive briefing", "/api/executive-briefing/latest"],
  ];
  const results = await Promise.allSettled(requests.map(([, url]) => json(url)));

  results.forEach((result, index) => {
    const [name] = requests[index];
    if (result.status === "rejected") {
      state.warnings.push(`${name} is temporarily unavailable.`);
      return;
    }
    const { response, body } = result.value;
    if (!response.ok) {
      state.warnings.push(`${name} returned ${response.status}.`);
      return;
    }
    if (index === 0) state.health = body;
    if (index === 1) state.workflows = Array.isArray(body?.workflows) ? body.workflows : [];
    if (index === 2) state.briefing = body?.briefing || null;
  });

  if (state.warnings.length === requests.length && !state.health && !state.workflows.length && !state.briefing) {
    state.error = "Kairos could not reach the governed browser APIs. Check the connection and retry.";
  }
  state.loading = false;
  state.lastUpdated = new Date();
  root.setAttribute("aria-busy", "false");
  render();
}

function render() {
  persistSession();
  const ready = ["ready", "ok"].includes(state.health?.status);
  const statusText = state.loading ? "Refreshing" : ready ? "Operating normally" : state.error ? "Connection issue" : "Runtime limited";
  root.innerHTML = `<header class="abos-topbar"><div class="abos-brand"><div class="abos-mark" aria-hidden="true">K</div><div><strong>Kairos</strong><span>Executive Operating System</span></div></div><div class="abos-topbar-actions"><button class="abos-refresh" data-refresh ${state.loading ? "disabled" : ""} aria-label="Refresh Kairos browser">${state.loading ? "Refreshing…" : "Refresh"}</button><div class="abos-status" data-ready="${ready}"><i></i>${statusText}</div></div></header>${state.warnings.length ? `<div class="abos-warning" role="status">${state.warnings.map(esc).join(" · ")}</div>` : ""}<div class="abos-layout"><section class="abos-main">${view()}</section><aside class="abos-sidebar"><nav class="abos-nav" aria-label="Primary">${nav.map(item => `<button data-view="${item}" aria-current="${state.view === item ? "page" : "false"}">${label(item)}</button>`).join("")}</nav></aside></div>`;
  bind();
}

function view() {
  if (state.error) return `<section class="abos-hero abos-recovery" role="alert"><p class="abos-kicker">Browser recovery</p><h1>Kairos needs a reconnect.</h1><p>${esc(state.error)}</p><div class="abos-actions"><button class="abos-primary" data-refresh>Retry connection</button><button class="abos-secondary" data-open-legacy>Open advanced operations</button></div></section>`;
  if (state.view === "today") return today();
  if (state.view === "approvals") return approvals();
  if (state.view === "create") return create();
  if (state.view === "assets") return assets();
  if (state.view === "growth") return growth();
  return settings();
}

function today() {
  const pending = items().filter(item => item.state === "pending");
  const active = state.workflows.filter(item => item.state === "active");
  const completed = state.workflows.filter(item => item.state === "completed");
  const blocked = state.workflows.filter(item => item.state === "blocked");
  return `<section class="abos-hero"><p class="abos-kicker">${windowTitle()}</p><h1>${pending.length ? `${pending.length} decisions need you.` : "Kairos is working."}</h1><p>${pending.length ? "Review prepared decisions, approve safe work, and keep protected actions under direct control." : "No protected decision is waiting. Kairos will keep producing, measuring, and preparing the next approval window."}</p><div class="abos-actions"><button class="abos-primary" data-open-brief>${pending.length ? "Review approvals" : "Open operating brief"}</button><button class="abos-secondary" data-open-legacy>Advanced operations</button></div>${state.lastUpdated ? `<small class="abos-updated">Updated ${esc(state.lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</small>` : ""}</section><section class="abos-grid">${metric("Approvals", pending.length)}${metric("Active work", active.length)}${metric("Completed", completed.length)}${metric("Blocked", blocked.length)}</section><section class="abos-section"><div class="abos-section-head"><h2>Current work</h2><span class="abos-muted">Live governed queue</span></div>${workflowCards(active.length ? active : state.workflows.slice(0, 5))}</section>`;
}

function approvals() {
  const list = items();
  const pending = list.filter(item => item.state === "pending");
  return `<section class="abos-hero"><p class="abos-kicker">Unified approval queue</p><h1>${pending.length || "No"} protected decisions.</h1><p>Review exact outputs, approve safe execution, request a correction, or deny the action. Pricing, publication, spending, customer communication, and destructive changes remain protected.</p>${pending.some(item => !isProtected(item)) ? `<div class="abos-actions"><button class="abos-primary" data-approve-plan ${state.loading ? "disabled" : ""}>Approve low-risk plan</button></div>` : ""}</section><section class="abos-card-list">${list.length ? list.map(approvalCard).join("") : `<div class="abos-empty">Nothing currently needs approval.</div>`}</section>`;
}

function create() {
  return `<section class="abos-hero"><p class="abos-kicker">Objective to execution</p><h1>What should Kairos accomplish?</h1><p>State the outcome once. Kairos will plan, manufacture, validate, package, and route protected actions into the approval queue.</p><label class="abos-field-label" for="abos-objective">Business objective</label><textarea id="abos-objective" class="abos-objective" data-objective maxlength="12000" placeholder="Example: Build and launch the AI Image Mastery digital product, then create a 14-day social campaign.">${esc(state.objective)}</textarea><div class="abos-objective-meta"><span>${state.objective.length.toLocaleString()} / 12,000</span><span>Saved on this device</span></div><div class="abos-actions"><button class="abos-primary" data-run-objective ${state.loading ? "disabled" : ""}>${state.loading ? "Starting…" : "Start governed work"}</button><button class="abos-secondary" data-manuscript>Open manuscript production</button><button class="abos-secondary" data-social>Open social production</button></div></section>`;
}

function assets() {
  const completed = state.workflows.filter(item => item.state === "completed");
  return `<section class="abos-hero"><p class="abos-kicker">Asset lifecycle</p><h1>Everything Kairos creates.</h1><p>Production assets, source packages, Shopify drafts, social content, evidence, and delivery records remain connected to the work that produced them.</p></section>${workflowCards(completed)}`;
}

function growth() {
  return `<section class="abos-hero"><p class="abos-kicker">Growth intelligence</p><h1>Observe. Learn. Improve.</h1><p>Kairos connects performance to the next production cycle. Verified commerce and content data drive experiments; unsupported metrics are never invented.</p><div class="abos-actions"><button class="abos-primary" data-growth ${state.loading ? "disabled" : ""}>Build growth plan</button><button class="abos-secondary" data-revenue ${state.loading ? "disabled" : ""}>Review revenue intelligence</button></div></section><section class="abos-grid">${metric("Experiments", "Queued")}${metric("Content loop", "Active")}${metric("Store changes", "Approval-gated")}${metric("Paid spend", "Protected")}</section>`;
}

function settings() {
  return `<section class="abos-hero"><p class="abos-kicker">Controls</p><h1>Bounded autonomy.</h1><p>Automatic reads, drafting, validation, packaging, and approved-plan execution. Live publication, pricing, spending, customer messages, and destructive operations remain explicitly protected.</p><div class="abos-actions"><button class="abos-secondary" data-open-legacy>Open advanced system controls</button><button class="abos-secondary" data-reset-browser>Reset browser session</button></div></section>`;
}

function approvalCard(item) {
  return `<article class="abos-card"><div class="abos-card-top"><div><h3>${esc(item.title || "Approval item")}</h3><p>${esc(item.summary || "")}</p></div><span class="abos-pill">${esc(item.state || "pending")}</span></div><div class="abos-card-actions">${item.state === "pending" ? `<button data-action="approve" data-item="${esc(item.id)}">Approve</button><button data-action="fix" data-item="${esc(item.id)}">Fix</button><button data-action="deny" data-item="${esc(item.id)}">Deny</button>` : ""}</div></article>`;
}

function workflowCards(list) {
  return list.length ? `<div class="abos-card-list">${list.map(item => `<article class="abos-card"><div class="abos-card-top"><div><h3>${esc(item.title || item.workflowType || item.id || "Kairos work")}</h3><p>${esc(item.summary || item.objective || `${item.completedTasks || 0} of ${item.taskCount || 0} tasks completed`)}</p></div><span class="abos-pill">${esc(item.state || "queued")}</span></div></article>`).join("")}</div>` : `<div class="abos-empty">No work is currently listed.</div>`;
}

function metric(name, value) {
  return `<article class="abos-metric"><span>${esc(name)}</span><strong>${esc(value)}</strong></article>`;
}

function bind() {
  root.querySelectorAll("[data-view]").forEach(button => button.onclick = () => setView(button.dataset.view));
  root.querySelectorAll("[data-refresh]").forEach(button => button.onclick = () => refresh());
  root.querySelector("[data-open-brief]")?.addEventListener("click", () => setView("approvals"));
  root.querySelectorAll("[data-open-legacy]").forEach(button => button.onclick = openLegacy);
  root.querySelector("[data-approve-plan]")?.addEventListener("click", approvePlan);
  root.querySelectorAll("[data-action]").forEach(button => button.onclick = () => decide(button.dataset.item, button.dataset.action));
  root.querySelector("[data-run-objective]")?.addEventListener("click", runObjective);
  root.querySelector("[data-objective]")?.addEventListener("input", event => {
    state.objective = event.target.value;
    persistSession();
    const counter = root.querySelector(".abos-objective-meta span");
    if (counter) counter.textContent = `${state.objective.length.toLocaleString()} / 12,000`;
  });
  root.querySelector("[data-manuscript]")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:open")));
  root.querySelector("[data-social]")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("kairos:social-production:open")));
  root.querySelector("[data-growth]")?.addEventListener("click", () => runHub("growth-plan", "Build the next evidence-based growth plan for Mindset Media Group."));
  root.querySelector("[data-revenue]")?.addEventListener("click", () => runHub("revenue-intelligence", "Review current verified commerce performance and identify the next best action."));
  root.querySelector("[data-reset-browser]")?.addEventListener("click", resetBrowserSession);
}

function setView(view) {
  if (!nav.includes(view)) return;
  state.view = view;
  state.error = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function decide(itemID, decision) {
  const note = decision === "fix" ? (prompt("What should Kairos correct?") || "").trim() : "";
  if (decision === "fix" && !note) return;
  state.loading = true;
  render();
  try {
    const { response, body } = await json("/api/executive-briefing/decide", { method: "POST", headers: headers(), body: JSON.stringify({ itemID, decision, note, actor: "Executive" }) });
    if (!response.ok) throw new Error(body?.error?.message || "Decision failed.");
    state.briefing = body.briefing;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function approvePlan() {
  const pending = items().filter(item => item.state === "pending" && !isProtected(item));
  for (const item of pending) await decide(item.id, "approve");
  await refresh();
}

function isProtected(item) {
  const text = `${item.category || ""} ${item.title || ""} ${item.summary || ""}`.toLowerCase();
  return ["publish", "price", "pricing", "spend", "customer", "refund", "delete", "destructive", "legal"].some(word => text.includes(word));
}

async function runObjective() {
  const objective = root.querySelector("[data-objective]")?.value.trim() || "";
  if (objective.length < 3) {
    state.error = "State the business outcome before Kairos begins.";
    render();
    return;
  }
  const succeeded = await runHub("objective", objective);
  if (!succeeded) return;
  state.objective = "";
  state.view = "today";
  persistSession();
  await refresh();
}

async function runHub(action, objective) {
  state.loading = true;
  state.error = "";
  render();
  try {
    const { response, body } = await json("/api/hub/run", { method: "POST", headers: headers(), body: JSON.stringify({ action, objective }) });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not start the work.");
    return true;
  } catch (error) {
    state.error = error.message;
    return false;
  } finally {
    state.loading = false;
    render();
  }
}

function openLegacy() {
  document.body.classList.remove("abos-active");
  root.classList.add("abos-hidden");
  document.querySelector(".abos-legacy-close")?.remove();
  const close = document.createElement("button");
  close.className = "abos-legacy-close";
  close.textContent = "Return to Executive OS";
  close.onclick = () => {
    close.remove();
    root.classList.remove("abos-hidden");
    document.body.classList.add("abos-active");
    render();
  };
  document.body.append(close);
}

function resetBrowserSession() {
  localStorage.removeItem(STORAGE_KEY);
  state.view = "today";
  state.objective = "";
  state.error = "";
  render();
}

function bindGlobalEvents() {
  window.addEventListener("kairos:executive-os:open", () => {
    root.classList.remove("abos-hidden");
    document.body.classList.add("abos-active");
    setView("today");
  });
  window.addEventListener("online", () => refresh());
  window.addEventListener("offline", () => {
    state.error = "This device is offline. Kairos preserved the current browser session.";
    render();
  });
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function persistSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ view: nav.includes(state.view) ? state.view : "today", objective: state.objective.slice(0, 12000) }));
  } catch {}
}

function items() { return state.briefing?.items || []; }
function windowTitle() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return hour < 15 ? "Morning operating brief" : "Evening operating review";
}
function label(value) { return value[0].toUpperCase() + value.slice(1); }
function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function json(url, init = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { message: text }; }
  return { response, body };
}
function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
