import { kairosState } from "./state.js";
import { bundlePackages, bundleMetrics } from "./bundles.js";
import { websiteAudit, websiteMetrics } from "./website-ops.js";
import { shopifyOps, shopifyMetrics } from "./shopify-ops.js";

const skin = document.createElement("link");
skin.rel = "stylesheet";
skin.href = "./styles/command-center.css";
document.head.appendChild(skin);

const nav = document.querySelector("#module-nav");
const view = document.querySelector("#dashboard-view");
const title = document.querySelector("#page-title");
const mode = document.querySelector("#runtime-mode");

mode.textContent = kairosState.mode;

function renderNav(active = "dashboard") {
  nav.innerHTML = kairosState.modules.map(module => `
    <button class="nav-button ${module.id === active ? "active" : ""}" data-module="${module.id}"><span class="nav-icon">${module.icon || "•"}</span>${module.label}</button>
  `).join("");

  nav.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => renderModule(button.dataset.module));
  });
}

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "ready", "live", "low", "p1", "architecture ready", "package queue active"].includes(normalized)) return "badge good";
  if (["medium", "queued", "p2", "approval", "build", "installed / mapping required", "popup + bundle build queued", "route audit required", "needs widget validation", "open"].includes(normalized)) return "badge warning";
  if (["critical", "high", "blocked", "failed", "danger"].includes(normalized)) return "badge danger";
  return "badge";
}

function progress(value) {
  return `<div class="progress-shell"><div class="progress-bar" style="width:${value}%"></div></div>`;
}

function list(items, statusKey = "status") {
  return `<div class="list">${items.map(item => `
    <div class="list-item">
      <div>
        <strong>${item.title}</strong>
        <p class="muted">${item.lane || item.status || item.risk || item.area || "Kairos"}</p>
      </div>
      <span class="${badgeClass(item[statusKey])}">${item[statusKey]}</span>
    </div>
  `).join("")}</div>`;
}

function renderDashboard() {
  const metrics = bundleMetrics();
  const site = websiteMetrics();
  const shop = shopifyMetrics();
  title.textContent = "Dashboard";
  view.innerHTML = `
    <article class="card hero-panel">
      <div class="card-header"><div><p class="eyebrow">Good evening, ${kairosState.operator}</p><h3>${kairosState.activeBatch}</h3></div><span class="badge good">Live</span></div>
      <p class="metric">${kairosState.health}%</p>
      <p class="muted">Kairos is online as the Phase 1 web operations command center.</p>
      <div class="action-row"><button class="action-button">Start Daily Ops</button><button class="action-button">Run Website Audit</button><button class="action-button">Prepare Shopify Queue</button></div>
    </article>

    <section class="kpi-grid">
      ${kairosState.kpis.map(kpi => `<article class="card kpi-card"><div class="card-header"><h3>${kpi.label}</h3><span class="trend ${kpi.tone}">${kpi.trend}</span></div><p class="metric">${kpi.value}</p></article>`).join("")}
    </section>

    <article class="card large"><div class="card-header"><h3>Website Operations</h3><span class="badge warning">${site.open} Open</span></div><p class="metric">${site.score}%</p><p class="muted">Site health for ${websiteAudit.site}</p>${progress(site.score)}</article>
    <article class="card"><div class="card-header"><h3>Shopify Operations</h3><span class="badge danger">${shop.critical} Critical</span></div><p class="metric">${shop.score}%</p><p class="muted">${shopifyOps.store}</p>${progress(shop.score)}</article>

    <article class="card large"><div class="card-header"><h3>Bundle Packages</h3><span class="badge good">${metrics.projectedRevenue}</span></div><div class="list">${bundlePackages.map(bundle => `<div class="list-item"><div><strong>${bundle.title}</strong><p class="muted">${bundle.price} • ${bundle.destination}</p></div><span class="${badgeClass(bundle.status)}">${bundle.status}</span></div>`).join("")}</div></article>
    <article class="card"><div class="card-header"><h3>Awaiting Approval</h3><span class="badge warning">${kairosState.approvals.length}</span></div>${list(kairosState.approvals, "risk")}</article>
    <article class="card full"><div class="card-header"><h3>Today's Priorities</h3><span class="badge good">Active Queue</span></div>${list(kairosState.priorities, "priority")}</article>
  `;
}

function renderBundles() {
  const metrics = bundleMetrics();
  title.textContent = "Bundles";
  view.innerHTML = `
    <article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Package Engine</p><h3>Bundle Command Center</h3></div><span class="badge good">${metrics.activeBundles} Active</span></div><p class="metric">${metrics.projectedRevenue}</p><p class="muted">Projected package revenue across active bundle offers.</p><div class="action-row"><button class="action-button">Package Next Bundle</button><button class="action-button">Create Shopify Listing</button><button class="action-button">Assign Vault Access</button></div></article>
    <article class="card full"><div class="card-header"><h3>Bundle Queue</h3><span class="badge warning">Packaging</span></div><div class="list">${bundlePackages.map(bundle => `<div class="list-item"><div><strong>${bundle.title}</strong><p class="muted">${bundle.items.join(" • ")}</p><p class="muted">${bundle.value} value → ${bundle.price}</p></div><span class="${badgeClass(bundle.status)}">${bundle.status}</span></div>`).join("")}</div></article>
  `;
}

function renderWebsite() {
  const site = websiteMetrics();
  title.textContent = "Website Ops";
  view.innerHTML = `
    <article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Website Intelligence</p><h3>Website Operations Command Center</h3></div><span class="badge warning">${site.open} Open</span></div><p class="metric">${site.score}%</p><p class="muted">${websiteAudit.site} • ${websiteAudit.lastRun}</p>${progress(site.score)}<div class="action-row"><button class="action-button">Run Website Audit</button><button class="action-button">Generate Backlog</button><button class="action-button">Approve Fix Batch</button></div></article>
    <article class="card large"><div class="card-header"><h3>Audit Findings</h3><span class="badge danger">${site.critical} Critical</span></div>${list(websiteAudit.findings, "severity")}</article>
    <article class="card"><div class="card-header"><h3>Opportunities</h3><span class="badge">${site.opportunities}</span></div><div class="list">${websiteAudit.opportunities.map(item => `<div class="list-item"><strong>${item}</strong><span class="badge warning">Queued</span></div>`).join("")}</div></article>
  `;
}

function renderShopify() {
  const shop = shopifyMetrics();
  title.textContent = "Shopify";
  view.innerHTML = `
    <article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Commerce Operations</p><h3>Shopify Command Center</h3></div><span class="badge danger">${shop.critical} Critical</span></div><p class="metric">${shop.score}%</p><p class="muted">${shopifyOps.store} • ${shopifyOps.lastRun}</p>${progress(shop.score)}<div class="action-row"><button class="action-button">Validate Judge.me</button><button class="action-button">Create Bundle Listing</button><button class="action-button">Stage Discount Offer</button></div></article>
    <article class="card large"><div class="card-header"><h3>Commerce Queue</h3><span class="badge warning">${shop.open} Open</span></div>${list(shopifyOps.queues, "severity")}</article>
    <article class="card"><div class="card-header"><h3>Judge.me</h3><span class="badge warning">Installed</span></div><p class="muted">${shopifyOps.judgeMe.widgetStatus}</p><div class="list">${shopifyOps.judgeMe.requiredBlocks.map(block => `<div class="list-item"><strong>${block}</strong><span class="badge warning">Required</span></div>`).join("")}</div></article>
    <article class="card full"><div class="card-header"><h3>Product Health</h3><span class="badge">${shop.products}</span></div><div class="list">${shopifyOps.productHealth.map(product => `<div class="list-item"><div><strong>${product.title}</strong><p class="muted">${product.status}</p>${progress(product.score)}</div><span class="badge">${product.score}%</span></div>`).join("")}</div></article>
  `;
}

function renderModule(moduleId) {
  renderNav(moduleId);
  const module = kairosState.modules.find(item => item.id === moduleId);
  title.textContent = module?.label || "Dashboard";
  if (moduleId === "dashboard") return renderDashboard();
  if (moduleId === "bundles") return renderBundles();
  if (moduleId === "website") return renderWebsite();
  if (moduleId === "shopify") return renderShopify();

  const moduleCopy = kairosState.commandCenters[moduleId] || [];
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Command Center</p><h3>${module?.label}</h3></div><span class="badge warning">Build Queue</span></div><p class="muted">Kairos-managed workspace for ${module?.label} operations.</p><div class="action-row"><button class="action-button">Execute Next Task</button><button class="action-button">Create Backlog Item</button></div></article><article class="card full"><div class="card-header"><h3>Execution Queue</h3><span class="badge warning">Queued</span></div><div class="list">${moduleCopy.map(task => `<div class="list-item"><strong>${task}</strong><span class="badge warning">Queued</span></div>`).join("")}</div></article>`;
}

renderNav();
renderDashboard();
