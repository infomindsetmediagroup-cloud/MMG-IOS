import { kairosState } from "./state.js";
import { bundlePackages, bundleMetrics } from "./bundles.js";
import { websiteAudit, websiteMetrics } from "./website-ops.js";
import { shopifyOps, shopifyMetrics } from "./shopify-ops.js";
import { knowledgeOps, knowledgeMetrics } from "./knowledge-ops.js";
import { revenueOps, revenueMetrics } from "./revenue-ops.js";
import { customerOps, customerMetrics } from "./customer-ops.js";
import { getActionLog, recordAction } from "./runtime-actions.js";

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
  nav.querySelectorAll("button").forEach(button => button.addEventListener("click", () => renderModule(button.dataset.module)));
}

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "ready", "live", "low", "p1", "architecture ready", "package queue active", "free"].includes(normalized)) return "badge good";
  if (["medium", "queued", "p2", "approval", "build", "installed / mapping required", "popup + bundle build queued", "route audit required", "needs widget validation", "open", "seeding", "paid", "high", "not connected", "discount", "lead magnet", "bundle", "upsell", "purchased", "premium", "lead", "customer", "activation", "trust", "expansion"].includes(normalized)) return "badge warning";
  if (["critical", "blocked", "failed", "danger", "license"].includes(normalized)) return "badge danger";
  return "badge";
}

function progress(value) {
  return `<div class="progress-shell"><div class="progress-bar" style="width:${value}%"></div></div>`;
}

function actionButton(label, action, detail = "Queued from dashboard") {
  return `<button class="action-button" data-action="${action}" data-detail="${detail}">${label}</button>`;
}

function bindActions() {
  view.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      recordAction(button.dataset.action, button.dataset.detail);
      renderModule(document.querySelector(".nav-button.active")?.dataset.module || "dashboard");
    });
  });
}

function list(items, statusKey = "status") {
  return `<div class="list">${items.map(item => `<div class="list-item"><div><strong>${item.title || item.label}</strong><p class="muted">${item.lane || item.status || item.risk || item.area || item.access || item.type || item.trigger || item.stage || "Kairos"}</p></div><span class="${badgeClass(item[statusKey])}">${item[statusKey]}</span></div>`).join("")}</div>`;
}

function actionLogCard() {
  const log = getActionLog();
  return `<article class="card full"><div class="card-header"><h3>Command Log</h3><span class="badge good">${log.length}</span></div><div class="list">${(log.length ? log : [{ action: "Awaiting first command", detail: "Click a command button to queue an operational action.", status: "Standby", createdAt: "Kairos" }]).map(item => `<div class="list-item"><div><strong>${item.action}</strong><p class="muted">${item.detail} • ${item.createdAt}</p></div><span class="${badgeClass(item.status)}">${item.status}</span></div>`).join("")}</div></article>`;
}

function renderDashboard() {
  const metrics = bundleMetrics();
  const site = websiteMetrics();
  const shop = shopifyMetrics();
  const knowledge = knowledgeMetrics();
  const revenue = revenueMetrics();
  const customer = customerMetrics();
  title.textContent = "Dashboard";
  view.innerHTML = `
    <article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Good evening, ${kairosState.operator}</p><h3>${kairosState.activeBatch}</h3></div><span class="badge good">Live</span></div><p class="metric">${kairosState.health}%</p><p class="muted">Kairos is online as the Phase 1 web operations command center.</p><div class="action-row">${actionButton("Start Daily Ops", "Start Daily Ops", "Daily operations run queued.")}${actionButton("Run Website Audit", "Run Website Audit", "Website audit workflow queued.")}${actionButton("Prepare Shopify Queue", "Prepare Shopify Queue", "Shopify operations queue staged.")}</div></article>
    <section class="kpi-grid">${kairosState.kpis.map(kpi => `<article class="card kpi-card"><div class="card-header"><h3>${kpi.label}</h3><span class="trend ${kpi.tone}">${kpi.trend}</span></div><p class="metric">${kpi.value}</p></article>`).join("")}</section>
    <article class="card large"><div class="card-header"><h3>Website Operations</h3><span class="badge warning">${site.open} Open</span></div><p class="metric">${site.score}%</p><p class="muted">Site health for ${websiteAudit.site}</p>${progress(site.score)}</article>
    <article class="card"><div class="card-header"><h3>Shopify Operations</h3><span class="badge danger">${shop.critical} Critical</span></div><p class="metric">${shop.score}%</p><p class="muted">${shopifyOps.store}</p>${progress(shop.score)}</article>
    <article class="card"><div class="card-header"><h3>Knowledge Bank</h3><span class="badge warning">${knowledge.queuedModules} Modules</span></div><p class="metric">${knowledge.score}%</p><p class="muted">${knowledgeOps.activeVault}</p>${progress(knowledge.score)}</article>
    <article class="card"><div class="card-header"><h3>Revenue Engine</h3><span class="badge warning">${revenue.queued} Queued</span></div><p class="metric">${revenue.score}%</p><p class="muted">${revenueOps.activeFunnel}</p>${progress(revenue.score)}</article>
    <article class="card"><div class="card-header"><h3>Customer Ops</h3><span class="badge warning">${customer.queues} Queued</span></div><p class="metric">${customer.score}%</p><p class="muted">${customerOps.activePortal}</p>${progress(customer.score)}</article>
    <article class="card large"><div class="card-header"><h3>Bundle Packages</h3><span class="badge good">${metrics.projectedRevenue}</span></div><div class="list">${bundlePackages.map(bundle => `<div class="list-item"><div><strong>${bundle.title}</strong><p class="muted">${bundle.price} • ${bundle.destination}</p></div><span class="${badgeClass(bundle.status)}">${bundle.status}</span></div>`).join("")}</div></article>
    ${actionLogCard()}
  `;
  bindActions();
}

function renderBundles() {
  const metrics = bundleMetrics();
  title.textContent = "Bundles";
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Package Engine</p><h3>Bundle Command Center</h3></div><span class="badge good">${metrics.activeBundles} Active</span></div><p class="metric">${metrics.projectedRevenue}</p><p class="muted">Projected package revenue across active bundle offers.</p><div class="action-row">${actionButton("Package Next Bundle", "Package Next Bundle", "Next bundle package queued.")}${actionButton("Create Shopify Listing", "Create Shopify Listing", "Shopify listing generation queued.")}${actionButton("Assign Vault Access", "Assign Vault Access", "Vault entitlement mapping queued.")}</div></article><article class="card full"><div class="card-header"><h3>Bundle Queue</h3><span class="badge warning">Packaging</span></div><div class="list">${bundlePackages.map(bundle => `<div class="list-item"><div><strong>${bundle.title}</strong><p class="muted">${bundle.items.join(" • ")}</p><p class="muted">${bundle.value} value → ${bundle.price}</p></div><span class="${badgeClass(bundle.status)}">${bundle.status}</span></div>`).join("")}</div></article>${actionLogCard()}`;
  bindActions();
}

function renderWebsite() {
  const site = websiteMetrics();
  title.textContent = "Website Ops";
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Website Intelligence</p><h3>Website Operations Command Center</h3></div><span class="badge warning">${site.open} Open</span></div><p class="metric">${site.score}%</p><p class="muted">${websiteAudit.site} • ${websiteAudit.lastRun}</p>${progress(site.score)}<div class="action-row">${actionButton("Run Website Audit", "Run Website Audit", "Website audit workflow queued.")}${actionButton("Generate Backlog", "Generate Website Backlog", "Website backlog generation queued.")}${actionButton("Approve Fix Batch", "Approve Website Fix Batch", "Website fix batch staged for approval.")}</div></article><article class="card large"><div class="card-header"><h3>Audit Findings</h3><span class="badge danger">${site.critical} Critical</span></div>${list(websiteAudit.findings, "severity")}</article><article class="card"><div class="card-header"><h3>Opportunities</h3><span class="badge">${site.opportunities}</span></div><div class="list">${websiteAudit.opportunities.map(item => `<div class="list-item"><strong>${item}</strong><span class="badge warning">Queued</span></div>`).join("")}</div></article>${actionLogCard()}`;
  bindActions();
}

function renderShopify() {
  const shop = shopifyMetrics();
  title.textContent = "Shopify";
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Commerce Operations</p><h3>Shopify Command Center</h3></div><span class="badge danger">${shop.critical} Critical</span></div><p class="metric">${shop.score}%</p><p class="muted">${shopifyOps.store} • ${shopifyOps.lastRun}</p>${progress(shop.score)}<div class="action-row">${actionButton("Validate Judge.me", "Validate Judge.me", "Review widget validation queued.")}${actionButton("Create Bundle Listing", "Create Bundle Listing", "Bundle listing workflow queued.")}${actionButton("Stage Discount Offer", "Stage Discount Offer", "Checkout discount workflow queued.")}</div></article><article class="card large"><div class="card-header"><h3>Commerce Queue</h3><span class="badge warning">${shop.open} Open</span></div>${list(shopifyOps.queues, "severity")}</article><article class="card"><div class="card-header"><h3>Judge.me</h3><span class="badge warning">Installed</span></div><p class="muted">${shopifyOps.judgeMe.widgetStatus}</p><div class="list">${shopifyOps.judgeMe.requiredBlocks.map(block => `<div class="list-item"><strong>${block}</strong><span class="badge warning">Required</span></div>`).join("")}</div></article><article class="card full"><div class="card-header"><h3>Product Health</h3><span class="badge">${shop.products}</span></div><div class="list">${shopifyOps.productHealth.map(product => `<div class="list-item"><div><strong>${product.title}</strong><p class="muted">${product.status}</p>${progress(product.score)}</div><span class="badge">${product.score}%</span></div>`).join("")}</div></article>${actionLogCard()}`;
  bindActions();
}

function renderKnowledge() {
  const knowledge = knowledgeMetrics();
  title.textContent = "Knowledge";
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Knowledge Operations</p><h3>Knowledge Bank Command Center</h3></div><span class="badge warning">${knowledge.queuedModules} Queued</span></div><p class="metric">${knowledge.score}%</p><p class="muted">${knowledgeOps.activeVault} • ${knowledgeOps.lastRun}</p>${progress(knowledge.score)}<div class="action-row">${actionButton("Build Free Vault", "Build Free Vault", "Free Vault build queued.")}${actionButton("Create Module", "Create Knowledge Module", "Knowledge module generation queued.")}${actionButton("Map Vault Access", "Map Vault Access", "Vault access mapping queued.")}</div></article><article class="card large"><div class="card-header"><h3>Knowledge Categories</h3><span class="badge">${knowledge.categories}</span></div>${list(knowledgeOps.categories)}</article><article class="card"><div class="card-header"><h3>Vault Packages</h3><span class="badge warning">${knowledge.vaultItems}</span></div>${list(knowledgeOps.vaultPackages, "access")}</article><article class="card full"><div class="card-header"><h3>Module Queue</h3><span class="badge warning">${knowledge.queuedModules}</span></div>${list(knowledgeOps.moduleQueue, "priority")}</article>${actionLogCard()}`;
  bindActions();
}

function renderRevenue() {
  const revenue = revenueMetrics();
  title.textContent = "Revenue";
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Revenue Optimization</p><h3>Revenue Command Center</h3></div><span class="badge warning">${revenue.queued} Queued</span></div><p class="metric">${revenue.score}%</p><p class="muted">${revenueOps.activeFunnel} • ${revenueOps.lastRun}</p>${progress(revenue.score)}<div class="action-row">${actionButton("Build Welcome Popup", "Build Welcome Popup", "Welcome popup workflow queued.")}${actionButton("Stage Discount Offer", "Stage Discount Offer", "Discount offer workflow queued.")}${actionButton("Create Capture Funnel", "Create Capture Funnel", "Email capture funnel queued.")}</div></article><article class="card large"><div class="card-header"><h3>Funnels</h3><span class="badge warning">${revenue.funnels}</span></div>${list(revenueOps.funnels, "impact")}</article><article class="card"><div class="card-header"><h3>Offers</h3><span class="badge warning">${revenue.offers}</span></div>${list(revenueOps.offers, "type")}</article><article class="card full"><div class="card-header"><h3>Analytics</h3><span class="badge">Phase 1</span></div>${list(revenueOps.analytics)}</article>${actionLogCard()}`;
  bindActions();
}

function renderCustomers() {
  const customer = customerMetrics();
  title.textContent = "Customers";
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Customer Operations</p><h3>Customer Command Center</h3></div><span class="badge warning">${customer.queues} Queued</span></div><p class="metric">${customer.score}%</p><p class="muted">${customerOps.activePortal} • ${customerOps.lastRun}</p>${progress(customer.score)}<div class="action-row">${actionButton("Map Customer Portal", "Map Customer Portal", "Customer portal access mapping queued.")}${actionButton("Create License Record", "Create License Record", "License record template queued.")}${actionButton("Build Download Center", "Build Download Center", "Download center structure queued.")}</div></article><article class="card large"><div class="card-header"><h3>Customer Queue</h3><span class="badge warning">${customer.queues}</span></div>${list(customerOps.queues, "priority")}</article><article class="card"><div class="card-header"><h3>Account Types</h3><span class="badge warning">${customer.accountTypes}</span></div>${list(customerOps.accountTypes, "access")}</article><article class="card full"><div class="card-header"><h3>Lifecycle</h3><span class="badge">${customer.lifecycle}</span></div>${list(customerOps.lifecycle, "stage")}</article>${actionLogCard()}`;
  bindActions();
}

function renderModule(moduleId) {
  renderNav(moduleId);
  const module = kairosState.modules.find(item => item.id === moduleId);
  title.textContent = module?.label || "Dashboard";
  if (moduleId === "dashboard") return renderDashboard();
  if (moduleId === "bundles") return renderBundles();
  if (moduleId === "website") return renderWebsite();
  if (moduleId === "shopify") return renderShopify();
  if (moduleId === "knowledge") return renderKnowledge();
  if (moduleId === "revenue") return renderRevenue();
  if (moduleId === "customers") return renderCustomers();
  const moduleCopy = kairosState.commandCenters[moduleId] || [];
  view.innerHTML = `<article class="card hero-panel"><div class="card-header"><div><p class="eyebrow">Command Center</p><h3>${module?.label}</h3></div><span class="badge warning">Build Queue</span></div><p class="muted">Kairos-managed workspace for ${module?.label} operations.</p><div class="action-row">${actionButton("Execute Next Task", `Execute ${module?.label} Task`, `${module?.label} execution task queued.`)}${actionButton("Create Backlog Item", `Create ${module?.label} Backlog Item`, `${module?.label} backlog item queued.`)}</div></article><article class="card full"><div class="card-header"><h3>Execution Queue</h3><span class="badge warning">Queued</span></div><div class="list">${moduleCopy.map(task => `<div class="list-item"><strong>${task}</strong><span class="badge warning">Queued</span></div>`).join("")}</div></article>${actionLogCard()}`;
  bindActions();
}

renderNav();
renderDashboard();
