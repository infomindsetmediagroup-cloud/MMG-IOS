const BUILD = "kairos-revenue-intelligence-ui-20260713-1";
const state = { open: false, loading: false, error: "", report: null, workflow: null };

start();

function start() {
  document.addEventListener("click", interceptRevenueIntelligence, true);
  window.addEventListener("kairos:revenue-intelligence:open", openWorkspace);
}

function interceptRevenueIntelligence(event) {
  const button = event.target.closest?.('[data-child="revenue-intelligence"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openWorkspace();
}

async function openWorkspace() {
  state.open = true;
  await loadLatest();
  render();
  setTimeout(() => document.querySelector("#revenue-intelligence")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
}

async function loadLatest() {
  try {
    const { response, body } = await request("/api/revenue-intelligence/latest");
    if (response.ok) state.report = body.report || null;
  } catch {}
}

async function runReview(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.loading = true;
  state.error = "";
  render();
  try {
    const { response, body } = await request("/api/revenue-intelligence/reviews", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        objective: data.get("objective"),
        period: data.get("period"),
        priority: data.get("priority"),
        createWorkflow: data.get("createWorkflow") === "on",
      }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not complete the revenue review.");
    state.report = body.report;
    state.workflow = body.workflow || null;
  } catch (error) {
    state.error = error.message || "Kairos could not complete the revenue review.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub) return;
  let root = document.querySelector("#revenue-intelligence");
  if (!state.open) { root?.remove(); return; }
  if (!root) {
    root = document.createElement("section");
    root.id = "revenue-intelligence";
    root.className = "revenue-intelligence workspace";
    hub.appendChild(root);
  }

  root.innerHTML = `<header class="revenue-head"><div><p class="eyebrow">Business · Revenue Intelligence</p><h2>Verified Commerce Review</h2><p>Read authoritative Shopify evidence, identify supported constraints, and route the next action into work.</p></div><button type="button" data-close-revenue>Close</button></header>${state.error ? `<p class="revenue-error">${escapeHTML(state.error)}</p>` : ""}<div class="revenue-layout"><section class="revenue-form"><h3>Run Revenue Review</h3><form data-revenue-form><label>Review objective<textarea name="objective" maxlength="3000" required placeholder="Example: Review current store performance and identify the next measurable revenue action."></textarea></label><label>Requested period<input name="period" maxlength="180" value="current verified snapshot" placeholder="Today, current snapshot, last 30 days"></label><label>Priority<select name="priority"><option value="high">High</option><option value="normal" selected>Normal</option><option value="critical">Critical</option><option value="low">Low</option></select></label><label class="revenue-check"><input type="checkbox" name="createWorkflow" checked> Create a five-task follow-through workflow</label><button class="primary" type="submit">Run Verified Review</button></form><div class="revenue-integrity"><strong>Evidence rule</strong><p>Kairos reports only values returned by the authoritative Shopify analytics endpoint. Missing history is never inferred.</p></div></section><section class="revenue-report">${state.loading ? `<p class="revenue-loading">Kairos is reading the authoritative commerce snapshot…</p>` : reportMarkup()}</section></div>`;
  bind();
}

function reportMarkup() {
  const report = state.report;
  if (!report) return `<div class="revenue-empty"><strong>No verified review yet.</strong><p>Run the first review to capture the current Shopify evidence and create a bounded action workflow.</p></div>`;
  const metrics = Array.isArray(report.metrics) ? report.metrics : [];
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const actions = Array.isArray(report.nextActions) ? report.nextActions : [];
  return `<article class="revenue-review"><div class="revenue-report-head"><div><p class="eyebrow">${escapeHTML(report.status)}</p><h3>${escapeHTML(report.requestedPeriod)}</h3></div><span>${escapeHTML(report.coverage?.label || "Verified snapshot")}</span></div><p class="revenue-qualification">${escapeHTML(report.coverage?.qualification || "")}</p><div class="revenue-metrics">${metrics.length ? metrics.map(metric => `<div><span>${escapeHTML(metric.label)}</span><strong>${escapeHTML(metric.displayValue)}</strong><small>${escapeHTML(metric.source)}</small></div>`).join("") : `<div class="revenue-no-metrics"><strong>Metrics unavailable</strong><span>Review the authorization finding below.</span></div>`}</div><section class="revenue-findings"><h4>Verified findings</h4>${findings.map(item => `<article data-severity="${escapeHTML(item.severity)}"><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.detail)}</p></article>`).join("")}</section><section class="revenue-actions"><h4>Next bounded actions</h4><ol>${actions.map(action => `<li>${escapeHTML(action)}</li>`).join("")}</ol></section><footer><span>${Number(report.restrictions?.restrictedMetricCount || 0)} restricted metrics</span><span>No invented data</span><span>No extrapolation</span></footer>${state.workflow ? `<button type="button" data-open-revenue-workflow>Open Follow-Through Workflow</button>` : ""}</article>`;
}

function bind() {
  document.querySelector("[data-close-revenue]")?.addEventListener("click", () => { state.open = false; render(); });
  document.querySelector("[data-revenue-form]")?.addEventListener("submit", runReview);
  document.querySelector("[data-open-revenue-workflow]")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID: state.workflow?.id } }));
  });
}

function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
