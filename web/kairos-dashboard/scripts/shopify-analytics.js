const ANALYTICS_BUILD = "kairos-shopify-analytics-20260715-6";
const RANGE_KEY = "kairos.shopify.analytics.range";
const SNAPSHOT_KEY = "kairos.shopify.analytics.snapshots";
const RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
];
let latest = null;
let loading = false;
let range = readRange();
let comparison = null;

boot();
setInterval(loadAnalytics, 15000);

function boot() {
  ensurePanel();
  loadAnalytics();
  const observer = new MutationObserver(() => ensurePanel());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function ensurePanel() {
  const root = document.querySelector("#kairos-hub");
  if (!root || document.querySelector("#shopify-analytics-panel")) return;
  const anchor = root.querySelector(".hero") || root.firstElementChild;
  if (!anchor) return;
  const panel = document.createElement("section");
  panel.id = "shopify-analytics-panel";
  panel.className = "shopify-analytics-panel";
  panel.setAttribute("aria-label", "Live Shopify analytics");
  panel.innerHTML = renderPanel();
  anchor.insertAdjacentElement("beforebegin", panel);
  bind(panel);
}

async function loadAnalytics() {
  if (loading) return;
  loading = true;
  ensurePanel();
  renderIntoPanel({ loading: true });
  try {
    const previous = readSnapshot(range);
    const url = `/api/analytics/shopify?range=${encodeURIComponent(range)}&compare=previous`;
    const response = await fetch(url, { cache: "no-store", headers: { "X-MMG-Client-Build": ANALYTICS_BUILD, "X-Kairos-Analytics-Range": range } });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: { message: text } }; }
    latest = body;
    comparison = buildComparison(body, previous);
    if (response.ok) saveSnapshot(range, body);
  } catch (error) {
    latest = { status: "needs-attention", error: { message: error instanceof Error ? error.message : "Analytics request failed." }, analytics: { metrics: [] } };
    comparison = null;
  } finally {
    loading = false;
    renderIntoPanel();
  }
}

function renderIntoPanel(state = {}) {
  ensurePanel();
  const panel = document.querySelector("#shopify-analytics-panel");
  if (!panel) return;
  panel.innerHTML = renderPanel(state);
  bind(panel);
}

function renderPanel(state = {}) {
  const analytics = latest?.analytics || {};
  const metrics = Array.isArray(analytics.metrics) ? analytics.metrics : [];
  const available = metrics.filter(metric => metric.status === "available");
  const restricted = metrics.filter(metric => metric.status === "authorization-required");
  const status = state.loading
    ? `Refreshing ${rangeLabel()}…`
    : analytics.status === "ready"
      ? "Live · synchronized"
      : available.length
        ? "Partial · synchronized"
        : "Authorization required";

  let cards = "";
  if (state.loading) {
    cards = Array.from({ length: 4 }, (_, index) => cardHTML({ label: index === 0 ? "Shopify analytics" : "Loading", displayValue: "…", status: "loading" })).join("");
  } else if (available.length) {
    cards = available.map(cardHTML).join("");
    if (restricted.length) cards += authorizationCard(analytics.authorization, restricted.length);
  } else if (restricted.length || metrics.length) {
    cards = authorizationCard(analytics.authorization, restricted.length || metrics.length);
  } else {
    cards = authorizationCard(analytics.authorization, 0, latest?.error?.message || analytics.requirements?.[0]);
  }

  const ranges = RANGES.map(option => `<button type="button" data-shopify-range="${option.id}" aria-pressed="${option.id === range}">${option.label}</button>`).join("");
  return `<header class="shopify-analytics-head"><div><p class="eyebrow">Live Shopify Analytics</p><h2>Store performance</h2><small>${escapeHTML(rangeLabel())} · auto-refreshes every 15 seconds</small></div><div class="shopify-analytics-controls"><div class="shopify-analytics-ranges" role="group" aria-label="Shopify analytics range">${ranges}</div><div class="shopify-analytics-state"><span>${escapeHTML(status)}</span><button type="button" data-refresh-shopify>Refresh</button></div></div></header><div class="shopify-analytics-grid">${cards}</div>`;
}

function cardHTML(metric) {
  const available = metric.status === "available";
  const value = available ? (metric.displayValue ?? "—") : metric.status === "loading" ? "…" : "Unavailable";
  const change = available ? comparisonFor(metric) : null;
  const trend = change && Number.isFinite(change.delta)
    ? `<em data-direction="${change.delta > 0 ? "up" : change.delta < 0 ? "down" : "flat"}">${change.delta > 0 ? "+" : ""}${formatDelta(change.delta, metric)}<small>${escapeHTML(change.source)}</small></em>`
    : "";
  const detail = available ? `Verified ShopifyQL · ${rangeLabel()}` : "Unavailable";
  return `<article class="shopify-analytics-card" data-state="${escapeHTML(metric.status || "unknown")}"><span>${escapeHTML(metric.label || metric.id || "Metric")}</span><div class="shopify-analytics-value"><strong>${escapeHTML(value)}</strong>${trend}</div><small>${escapeHTML(detail)}</small></article>`;
}

function comparisonFor(metric) {
  const direct = metric.comparison || metric.previousPeriod || null;
  if (direct && Number.isFinite(Number(direct.delta ?? direct.change))) return { delta: Number(direct.delta ?? direct.change), source: "Previous period" };
  return comparison?.[metric.id] || null;
}

function buildComparison(body, previous) {
  const currentMetrics = body?.analytics?.metrics;
  const previousMetrics = previous?.analytics?.metrics;
  if (!Array.isArray(currentMetrics) || !Array.isArray(previousMetrics)) return null;
  const prior = Object.fromEntries(previousMetrics.map(metric => [metric.id, metric]));
  return Object.fromEntries(currentMetrics.map(metric => {
    const old = prior[metric.id];
    const nowValue = Number(metric.value ?? metric.rawValue);
    const oldValue = Number(old?.value ?? old?.rawValue);
    return [metric.id, Number.isFinite(nowValue) && Number.isFinite(oldValue) ? { delta: nowValue - oldValue, source: "Since last refresh" } : null];
  }).filter(([, value]) => value));
}

function formatDelta(delta, metric) {
  if (String(metric.displayValue || "").includes("%")) return `${delta.toFixed(1)}%`;
  if (String(metric.displayValue || "").includes("$")) return `$${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function authorizationCard(auth = {}, count = 0, message = "") {
  const granted = Array.isArray(auth?.grantedScopes) ? auth.grantedScopes : [];
  const readReports = auth?.scopeInspectionStatus === "verified" ? auth.readReportsGranted ? "Granted" : "Missing" : "Could not verify";
  const protectedData = auth?.protectedCustomerDataRequired ? "Still required" : "Not detected";
  const detail = count ? `${count} Shopify dashboard metric${count === 1 ? "" : "s"} blocked by the current authorization.` : "Shopify dashboard analytics are blocked by the current authorization.";
  const exactError = Array.isArray(auth?.exactErrors) && auth.exactErrors.length ? auth.exactErrors[0] : message;
  return `<article class="shopify-analytics-card shopify-analytics-authorization" data-state="authorization-required"><span>Shopify analytics authorization</span><strong>Access required</strong><small>${escapeHTML(detail)}</small><dl><div><dt>read_reports</dt><dd>${escapeHTML(readReports)}</dd></div><div><dt>Protected customer data</dt><dd>${escapeHTML(protectedData)}</dd></div><div><dt>Granted scopes</dt><dd>${escapeHTML(granted.length ? granted.join(", ") : "Not returned")}</dd></div></dl>${exactError ? `<p>${escapeHTML(exactError)}</p>` : ""}</article>`;
}

function bind(panel) {
  panel.querySelector("[data-refresh-shopify]")?.addEventListener("click", loadAnalytics);
  for (const button of panel.querySelectorAll("[data-shopify-range]")) button.addEventListener("click", () => setRange(button.dataset.shopifyRange));
}

function setRange(next) {
  if (!RANGES.some(option => option.id === next) || next === range) return;
  range = next;
  localStorage.setItem(RANGE_KEY, range);
  comparison = null;
  loadAnalytics();
}

function rangeLabel() { return RANGES.find(option => option.id === range)?.label || "30 Days"; }
function readRange() { try { const saved = localStorage.getItem(RANGE_KEY); return RANGES.some(option => option.id === saved) ? saved : "30d"; } catch { return "30d"; } }
function readSnapshot(id) { try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "{}")[id] || null; } catch { return null; } }
function saveSnapshot(id, value) { try { const rows = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "{}"); rows[id] = value; localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(rows)); } catch {} }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

window.KairosShopifyAnalytics = { build: ANALYTICS_BUILD, refresh: loadAnalytics, getRange: () => range, setRange };
