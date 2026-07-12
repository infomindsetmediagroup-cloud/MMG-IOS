const ANALYTICS_BUILD = "kairos-shopify-analytics-20260712-1";
let latest = null;
let loading = false;

boot();
setInterval(loadAnalytics, 60000);

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
    const response = await fetch("/api/analytics/shopify", { cache: "no-store", headers: { "X-MMG-Client-Build": ANALYTICS_BUILD } });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: { message: text } }; }
    latest = body;
  } catch (error) {
    latest = { status: "needs-attention", error: { message: error instanceof Error ? error.message : "Analytics request failed." }, analytics: { metrics: [] } };
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
  const status = state.loading ? "Refreshing Shopify analytics…" : analytics.status === "ready" ? "Live · today" : analytics.status === "partial" ? "Partial · today" : "Needs authorization";
  const cards = state.loading
    ? Array.from({ length: 7 }, (_, index) => cardHTML({ label: index === 0 ? "Shopify analytics" : "Loading", displayValue: "…", status: "loading" })).join("")
    : metrics.length
      ? metrics.map(cardHTML).join("")
      : cardHTML({ label: "Shopify analytics", displayValue: "Unavailable", status: "authorization-required", error: latest?.error?.message || analytics.requirements?.[0] || "Shopify read_reports access is required." });

  return `<header class="shopify-analytics-head"><div><p class="eyebrow">Live Shopify Analytics</p><h2>Store performance</h2></div><div class="shopify-analytics-state"><span>${escapeHTML(status)}</span><button type="button" data-refresh-shopify>Refresh</button></div></header><div class="shopify-analytics-grid">${cards}</div>`;
}

function cardHTML(metric) {
  const available = metric.status === "available";
  const value = available ? (metric.displayValue ?? "—") : metric.status === "loading" ? "…" : "Unavailable";
  const detail = available ? "Verified ShopifyQL" : metric.error || "Requires Shopify read_reports access";
  return `<article class="shopify-analytics-card" data-state="${escapeHTML(metric.status || "unknown")}"><span>${escapeHTML(metric.label || metric.id || "Metric")}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(detail)}</small></article>`;
}

function bind(panel) {
  panel.querySelector("[data-refresh-shopify]")?.addEventListener("click", loadAnalytics);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
