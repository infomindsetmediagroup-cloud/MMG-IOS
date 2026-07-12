const ANALYTICS_BUILD = "kairos-shopify-analytics-20260712-2";
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
  const available = metrics.filter(metric => metric.status === "available");
  const restricted = metrics.filter(metric => metric.status === "authorization-required");
  const status = state.loading
    ? "Refreshing Shopify analytics…"
    : analytics.status === "ready"
      ? "Live · today"
      : available.length
        ? "Partial · today"
        : "Authorization required";

  let cards = "";
  if (state.loading) {
    cards = Array.from({ length: 4 }, (_, index) => cardHTML({ label: index === 0 ? "Shopify analytics" : "Loading", displayValue: "…", status: "loading" })).join("");
  } else if (available.length) {
    cards = available.map(cardHTML).join("");
    if (restricted.length) cards += authorizationCard(restricted.length);
  } else if (restricted.length || metrics.length) {
    cards = authorizationCard(restricted.length || metrics.length);
  } else {
    cards = authorizationCard(0, latest?.error?.message || analytics.requirements?.[0]);
  }

  return `<header class="shopify-analytics-head"><div><p class="eyebrow">Live Shopify Analytics</p><h2>Store performance</h2></div><div class="shopify-analytics-state"><span>${escapeHTML(status)}</span><button type="button" data-refresh-shopify>Refresh</button></div></header><div class="shopify-analytics-grid">${cards}</div>`;
}

function cardHTML(metric) {
  const available = metric.status === "available";
  const value = available ? (metric.displayValue ?? "—") : metric.status === "loading" ? "…" : "Unavailable";
  const detail = available ? "Verified ShopifyQL" : "Unavailable";
  return `<article class="shopify-analytics-card" data-state="${escapeHTML(metric.status || "unknown")}"><span>${escapeHTML(metric.label || metric.id || "Metric")}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(detail)}</small></article>`;
}

function authorizationCard(count, message = "") {
  const detail = count
    ? `${count} Shopify dashboard metric${count === 1 ? "" : "s"} blocked by the current app authorization.`
    : "Shopify dashboard analytics are blocked by the current app authorization.";
  const normalized = String(message || "").toLowerCase();
  const requirements = [
    "Add the read_reports access scope to the Shopify app.",
    "Request Level 2 protected customer-data access in Shopify Partner settings.",
    "Reinstall or reauthorize the app so Shopify issues a token with the new permissions.",
  ];
  return `<article class="shopify-analytics-card shopify-analytics-authorization" data-state="authorization-required"><span>Shopify analytics authorization</span><strong>Access required</strong><small>${escapeHTML(detail)}</small><ul>${requirements.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>${normalized && !normalized.includes("read_reports") ? `<p>${escapeHTML(message)}</p>` : ""}</article>`;
}

function bind(panel) {
  panel.querySelector("[data-refresh-shopify]")?.addEventListener("click", loadAnalytics);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
