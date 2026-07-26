const BUILD = "kairos-operations-dashboard-20260726-1";
const state = { loading: false, health: null, metrics: null, error: "", refreshedAt: null };

const observer = new MutationObserver(() => mount());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", mount, { once: true });

function mount() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub || document.querySelector("#kairos-operations-observability")) return;
  const section = document.createElement("section");
  section.id = "kairos-operations-observability";
  section.className = "kairos-ops";
  section.setAttribute("aria-labelledby", "kairos-ops-title");
  section.innerHTML = shell();
  hub.appendChild(section);
  section.querySelector("[data-ops-refresh]")?.addEventListener("click", refresh);
  refresh();
}

async function refresh() {
  if (state.loading) return;
  state.loading = true;
  state.error = "";
  render();
  try {
    const [healthResponse, metricsResponse] = await Promise.all([
      fetch("/api/kairos/operations/health", { cache: "no-store", credentials: "include", headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD } }),
      fetch("/api/kairos/operations/metrics", { cache: "no-store", credentials: "include", headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD } }),
    ]);
    const [health, metrics] = await Promise.all([healthResponse.json().catch(() => ({})), metricsResponse.json().catch(() => ({}))]);
    if (!healthResponse.ok) throw new Error(health?.error?.message || `Health returned ${healthResponse.status}.`);
    if (!metricsResponse.ok) throw new Error(metrics?.error?.message || `Metrics returned ${metricsResponse.status}.`);
    state.health = health;
    state.metrics = metrics;
    state.refreshedAt = new Date().toISOString();
  } catch (error) {
    state.error = error?.message || "Operational telemetry is unavailable.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const section = document.querySelector("#kairos-operations-observability");
  if (!section) return;
  section.innerHTML = shell();
  section.querySelector("[data-ops-refresh]")?.addEventListener("click", refresh);
}

function shell() {
  const health = state.health || {};
  const metrics = state.metrics || {};
  const totals = metrics.totals || {};
  const latency = metrics.latencyMs || {};
  const dependencies = health.dependencies || {};
  return `
    <div class="kairos-ops__header">
      <div><p class="kairos-ops__eyebrow">Production operations</p><h2 id="kairos-ops-title">Kairos observability</h2><p>Dependency health, governed execution telemetry, and verification incidents.</p></div>
      <button type="button" data-ops-refresh ${state.loading ? "disabled aria-disabled=\"true\"" : ""}>${state.loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    ${state.error ? `<p class="kairos-ops__error" role="alert">${escapeHTML(state.error)}</p>` : ""}
    <div class="kairos-ops__grid">
      ${metric("Overall", health.overall || "unknown")}
      ${metric("Requests", number(totals.uniqueRequests))}
      ${metric("Approvals", number(totals.uniqueApprovals))}
      ${metric("Failures", number(totals.failures))}
      ${metric("Verification failures", number(totals.verificationFailures))}
      ${metric("p95 latency", `${number(latency.p95)} ms`)}
    </div>
    <div class="kairos-ops__columns">
      <article><h3>Dependency health</h3>${dependencyRows(dependencies)}</article>
      <article><h3>Active alerts</h3>${alertRows(metrics.alerts)}</article>
    </div>
    <p class="kairos-ops__meta">Retained events: ${number(metrics.window?.retainedEvents)}${state.refreshedAt ? ` · refreshed ${escapeHTML(state.refreshedAt)}` : ""}</p>`;
}

function metric(label, value) { return `<article class="kairos-ops__metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></article>`; }
function dependencyRows(dependencies) {
  const entries = Object.entries(dependencies);
  if (!entries.length) return "<p>No dependency data loaded.</p>";
  return `<div class="kairos-ops__list">${entries.map(([name, item]) => `<p><span>${escapeHTML(label(name))}</span><strong data-status="${escapeHTML(item?.status || "unknown")}">${escapeHTML(item?.status || "unknown")}</strong></p>`).join("")}</div>`;
}
function alertRows(alerts) {
  if (!Array.isArray(alerts) || !alerts.length) return '<p class="kairos-ops__clear">No active operational alerts.</p>';
  return `<div class="kairos-ops__alerts">${alerts.slice(0, 8).map(item => `<p><strong>${escapeHTML(item.severity || "warning")}</strong><span>${escapeHTML(item.code || "OPERATIONAL_ALERT")} · ${number(item.count)}</span></p>`).join("")}</div>`;
}
function label(value) { return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, char => char.toUpperCase()); }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result.toLocaleString("en-US") : "0"; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
