const ANALYTICS_BUILD = "kairos-shopify-analytics-20260715-5";
let latest = null;
let loading = false;

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

  return `<header class="shopify-analytics-head"><div><p class="eyebrow">Live Shopify Analytics</p><h2>Store performance</h2></div><div class="shopify-analytics-state"><span>${escapeHTML(status)}</span><button type="button" data-refresh-shopify>Refresh</button></div></header><div class="shopify-analytics-grid">${cards}</div>`;
}

function cardHTML(metric) {
  const available = metric.status === "available";
  const value = available ? (metric.displayValue ?? "—") : metric.status === "loading" ? "…" : "Unavailable";
  const detail = available ? "Verified ShopifyQL" : "Unavailable";
  return `<article class="shopify-analytics-card" data-state="${escapeHTML(metric.status || "unknown")}"><span>${escapeHTML(metric.label || metric.id || "Metric")}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(detail)}</small></article>`;
}

function authorizationCard(auth = {}, count = 0, message = "") {
  const granted = Array.isArray(auth?.grantedScopes) ? auth.grantedScopes : [];
  const readReports = auth?.scopeInspectionStatus === "verified"
    ? auth.readReportsGranted ? "Granted" : "Missing"
    : "Could not verify";
  const protectedData = auth?.protectedCustomerDataRequired ? "Still required" : "Not detected";
  const detail = count
    ? `${count} Shopify dashboard metric${count === 1 ? "" : "s"} blocked by the current authorization.`
    : "Shopify dashboard analytics are blocked by the current authorization.";
  const exactError = Array.isArray(auth?.exactErrors) && auth.exactErrors.length ? auth.exactErrors[0] : message;

  return `<article class="shopify-analytics-card shopify-analytics-authorization" data-state="authorization-required"><span>Shopify analytics authorization</span><strong>Access required</strong><small>${escapeHTML(detail)}</small><dl><div><dt>read_reports</dt><dd>${escapeHTML(readReports)}</dd></div><div><dt>Protected customer data</dt><dd>${escapeHTML(protectedData)}</dd></div><div><dt>Granted scopes</dt><dd>${escapeHTML(granted.length ? granted.join(", ") : "Not returned")}</dd></div></dl>${exactError ? `<p>${escapeHTML(exactError)}</p>` : ""}</article>`;
}

function bind(panel) {
  panel.querySelector("[data-refresh-shopify]")?.addEventListener("click", loadAnalytics);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
