const ANALYTICS_BUILD = "kairos-shopify-analytics-20260715-7";
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
let selectedMetricID = null;
let lastSuccessfulAt = null;

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
    if (response.ok) {
      lastSuccessfulAt = new Date().toISOString();
      saveSnapshot(range, body);
    }
    reconcileSelection();
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
    cards = Array.from({ length: 4 }, (_, index) => cardHTML({ id: `loading-${index}`, label: index === 0 ? "Shopify analytics" : "Loading", displayValue: "…", status: "loading" })).join("");
  } else if (available.length) {
    cards = available.map(cardHTML).join("");
    if (restricted.length) cards += authorizationCard(analytics.authorization, restricted.length);
  } else if (restricted.length || metrics.length) {
    cards = authorizationCard(analytics.authorization, restricted.length || metrics.length);
  } else {
    cards = authorizationCard(analytics.authorization, 0, latest?.error?.message || analytics.requirements?.[0]);
  }

  const ranges = RANGES.map(option => `<button type="button" data-shopify-range="${option.id}" aria-pressed="${option.id === range}">${option.label}</button>`).join("");
  const synchronized = lastSuccessfulAt ? `Last synchronized ${formatTimestamp(lastSuccessfulAt)}` : "Waiting for first successful synchronization";
  return `<header class="shopify-analytics-head"><div><p class="eyebrow">Live Shopify Analytics</p><h2>Store performance</h2><small>${escapeHTML(rangeLabel())} · auto-refreshes every 15 seconds</small></div><div class="shopify-analytics-controls"><div class="shopify-analytics-ranges" role="group" aria-label="Shopify analytics range">${ranges}</div><div class="shopify-analytics-state"><span>${escapeHTML(status)}</span><button type="button" data-refresh-shopify>Refresh</button></div></div></header><p class="shopify-analytics-sync">${escapeHTML(synchronized)}</p><div class="shopify-analytics-grid">${cards}</div>${renderDrilldown(metrics)}`;
}

function cardHTML(metric) {
  const available = metric.status === "available";
  const value = available ? (metric.displayValue ?? "—") : metric.status === "loading" ? "…" : "Unavailable";
  const change = available ? comparisonFor(metric) : null;
  const trend = change && Number.isFinite(change.delta)
    ? `<em data-direction="${change.delta > 0 ? "up" : change.delta < 0 ? "down" : "flat"}">${change.delta > 0 ? "+" : ""}${formatDelta(change.delta, metric)}<small>${escapeHTML(change.source)}</small></em>`
    : "";
  const detail = available ? `Verified ShopifyQL · ${rangeLabel()}` : "Unavailable";
  const selected = metric.id === selectedMetricID;
  return `<button type="button" class="shopify-analytics-card" data-state="${escapeHTML(metric.status || "unknown")}" data-shopify-metric="${escapeHTML(metric.id || "")}" aria-pressed="${selected}" ${available ? "" : "disabled"}><span>${escapeHTML(metric.label || metric.id || "Metric")}</span><div class="shopify-analytics-value"><strong>${escapeHTML(value)}</strong>${trend}</div><small>${escapeHTML(detail)}</small><b>${selected ? "Close details" : "View details"}</b></button>`;
}

function renderDrilldown(metrics) {
  if (!selectedMetricID) return "";
  const metric = metrics.find(item => item.id === selectedMetricID && item.status === "available");
  if (!metric) return "";
  const change = comparisonFor(metric);
  const currentValue = metric.displayValue ?? formatRaw(metric.value ?? metric.rawValue, metric);
  const previousValue = change && Number.isFinite(change.previousValue) ? formatRaw(change.previousValue, metric) : "Not provided";
  const absoluteChange = change && Number.isFinite(change.delta) ? `${change.delta > 0 ? "+" : ""}${formatDelta(change.delta, metric)}` : "Not available";
  const percentChange = change && Number.isFinite(change.percentDelta) ? `${change.percentDelta > 0 ? "+" : ""}${change.percentDelta.toFixed(1)}%` : "Not available";
  const source = metric.source || metric.querySource || metric.provenance || "ShopifyQL verified metric";
  const status = metric.status === "available" ? "Available and verified" : metric.status || "Unknown";
  return `<section class="shopify-analytics-drilldown" aria-live="polite" aria-label="${escapeHTML(metric.label || metric.id)} details"><header><div><p class="eyebrow">Metric drilldown</p><h3>${escapeHTML(metric.label || metric.id)}</h3></div><button type="button" data-close-shopify-drilldown aria-label="Close metric details">×</button></header><div class="shopify-analytics-drilldown-grid"><dl><dt>Current period</dt><dd>${escapeHTML(currentValue)}</dd></dl><dl><dt>Previous period</dt><dd>${escapeHTML(previousValue)}</dd></dl><dl><dt>Absolute change</dt><dd>${escapeHTML(absoluteChange)}</dd></dl><dl><dt>Percentage change</dt><dd>${escapeHTML(percentChange)}</dd></dl><dl><dt>Selected range</dt><dd>${escapeHTML(rangeLabel())}</dd></dl><dl><dt>Comparison source</dt><dd>${escapeHTML(change?.source || "No comparison available")}</dd></dl><dl><dt>Data source</dt><dd>${escapeHTML(source)}</dd></dl><dl><dt>Metric status</dt><dd>${escapeHTML(status)}</dd></dl></div><footer>Last successful synchronization: ${escapeHTML(lastSuccessfulAt ? formatTimestamp(lastSuccessfulAt) : "Not yet synchronized")}</footer></section>`;
}

function comparisonFor(metric) {
  const direct = metric.comparison || metric.previousPeriod || null;
  if (direct) {
    const currentValue = Number(metric.value ?? metric.rawValue);
    const previousValue = Number(direct.previousValue ?? direct.value ?? direct.previous);
    const suppliedDelta = Number(direct.delta ?? direct.change);
    const delta = Number.isFinite(suppliedDelta) ? suppliedDelta : Number.isFinite(currentValue) && Number.isFinite(previousValue) ? currentValue - previousValue : NaN;
    if (Number.isFinite(delta)) return { delta, previousValue, currentValue, percentDelta: percent(delta, previousValue), source: "Previous period" };
  }
  return comparison?.[metric.id] || null;
}

function buildComparison(body, previous) {
  const currentMetrics = body?.analytics?.metrics;
  const previousMetrics = previous?.analytics?.metrics;
  if (!Array.isArray(currentMetrics) || !Array.isArray(previousMetrics)) return null;
  const prior = Object.fromEntries(previousMetrics.map(metric => [metric.id, metric]));
  return Object.fromEntries(currentMetrics.map(metric => {
    const old = prior[metric.id];
    const currentValue = Number(metric.value ?? metric.rawValue);
    const previousValue = Number(old?.value ?? old?.rawValue);
    if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return [metric.id, null];
    const delta = currentValue - previousValue;
    return [metric.id, { delta, currentValue, previousValue, percentDelta: percent(delta, previousValue), source: "Since last refresh" }];
  }).filter(([, value]) => value));
}

function formatDelta(delta, metric) {
  if (String(metric.displayValue || "").includes("%")) return `${Math.abs(delta).toFixed(1)}%`;
  if (String(metric.displayValue || "").includes("$")) return `$${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatRaw(value, metric) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "—");
  if (String(metric.displayValue || "").includes("%")) return `${number.toFixed(1)}%`;
  if (String(metric.displayValue || "").includes("$")) return `$${number.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
  panel.querySelector("[data-close-shopify-drilldown]")?.addEventListener("click", () => selectMetric(null));
  for (const button of panel.querySelectorAll("[data-shopify-range]")) button.addEventListener("click", () => setRange(button.dataset.shopifyRange));
  for (const button of panel.querySelectorAll("[data-shopify-metric]")) button.addEventListener("click", () => selectMetric(button.dataset.shopifyMetric));
}

function selectMetric(id) {
  selectedMetricID = id && id === selectedMetricID ? null : id;
  renderIntoPanel();
}

function reconcileSelection() {
  const metrics = latest?.analytics?.metrics || [];
  if (selectedMetricID && !metrics.some(metric => metric.id === selectedMetricID && metric.status === "available")) selectedMetricID = null;
}

function setRange(next) {
  if (!RANGES.some(option => option.id === next) || next === range) return;
  range = next;
  localStorage.setItem(RANGE_KEY, range);
  comparison = null;
  selectedMetricID = null;
  loadAnalytics();
}

function percent(delta, previousValue) { return Number.isFinite(previousValue) && previousValue !== 0 ? delta / Math.abs(previousValue) * 100 : NaN; }
function formatTimestamp(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function rangeLabel() { return RANGES.find(option => option.id === range)?.label || "30 Days"; }
function readRange() { try { const saved = localStorage.getItem(RANGE_KEY); return RANGES.some(option => option.id === saved) ? saved : "30d"; } catch { return "30d"; } }
function readSnapshot(id) { try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "{}")[id] || null; } catch { return null; } }
function saveSnapshot(id, value) { try { const rows = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "{}"); rows[id] = value; localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(rows)); } catch {} }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

window.KairosShopifyAnalytics = { build: ANALYTICS_BUILD, refresh: loadAnalytics, getRange: () => range, setRange, selectMetric };
