import { kairosState } from "./state.js";
import { bundlePackages, bundleMetrics } from "./bundles.js";

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
  if (["Active", "Ready", "Low", "P1"].includes(value)) return "badge good";
  if (["Medium", "Queued", "P2"].includes(value)) return "badge warning";
  return "badge danger";
}

function progress(value) {
  return `<div class="progress-shell"><div class="progress-bar" style="width:${value}%"></div></div>`;
}

function list(items, statusKey = "status") {
  return `<div class="list">${items.map(item => `
    <div class="list-item">
      <div>
        <strong>${item.title}</strong>
        <p class="muted">${item.lane || item.status || item.risk || "Kairos"}</p>
      </div>
      <span class="${badgeClass(item[statusKey])}">${item[statusKey]}</span>
    </div>
  `).join("")}</div>`;
}

function renderDashboard() {
  const metrics = bundleMetrics();
  title.textContent = "Dashboard";
  view.innerHTML = `
    <article class="card hero-panel">
      <div class="card-header">
        <div>
          <p class="eyebrow">Good evening, ${kairosState.operator}</p>
          <h3>${kairosState.activeBatch}</h3>
        </div>
        <span class="badge good">Live</span>
      </div>
      <p class="metric">${kairosState.health}%</p>
      <p class="muted">Kairos is online as the Phase 1 web operations command center.</p>
      <div class="action-row">
        <button class="action-button">Start Daily Ops</button>
        <button class="action-button">Package Bundles</button>
        <button class="action-button">Prepare Shopify Queue</button>
      </div>
    </article>

    <section class="kpi-grid">
      ${kairosState.kpis.map(kpi => `
        <article class="card kpi-card">
          <div class="card-header"><h3>${kpi.label}</h3><span class="trend ${kpi.tone}">${kpi.trend}</span></div>
          <p class="metric">${kpi.value}</p>
        </article>
      `).join("")}
    </section>

    <article class="card large">
      <div class="card-header"><h3>Bundle Packages</h3><span class="badge good">${metrics.projectedRevenue}</span></div>
      <div class="list">
        ${bundlePackages.map(bundle => `<div class="list-item"><div><strong>${bundle.title}</strong><p class="muted">${bundle.price} • ${bundle.destination}</p></div><span class="${badgeClass(bundle.status)}">${bundle.status}</span></div>`).join("")}
      </div>
    </article>

    <article class="card">
      <div class="card-header"><h3>Bundle Metrics</h3><span class="badge good">Active</span></div>
      <div class="list">
        <div class="list-item"><strong>Packages</strong><span class="badge">${metrics.activeBundles}</span></div>
        <div class="list-item"><strong>Ready</strong><span class="badge good">${metrics.ready}</span></div>
        <div class="list-item"><strong>Approvals</strong><span class="badge warning">${metrics.approvals}</span></div>
      </div>
    </article>

    <article class="card large">
      <div class="card-header"><h3>Today's Priorities</h3><span class="badge good">Active Queue</span></div>
      ${list(kairosState.priorities, "priority")}
    </article>

    <article class="card">
      <div class="card-header"><h3>Awaiting Approval</h3><span class="badge warning">${kairosState.approvals.length}</span></div>
      ${list(kairosState.approvals, "risk")}
    </article>

    <article class="card large">
      <div class="card-header"><h3>Operational Pipelines</h3><span class="badge">Runtime</span></div>
      <div class="list">
        ${kairosState.pipelines.map(item => `<div class="list-item"><div><strong>${item.label}</strong>${progress(item.complete)}</div><span class="badge">${item.complete}%</span></div>`).join("")}
      </div>
    </article>

    <article class="card">
      <div class="card-header"><h3>Activity Feed</h3><span class="badge">Now</span></div>
      <div class="list">${kairosState.activity.map(item => `<div class="list-item"><strong>${item}</strong></div>`).join("")}</div>
    </article>
  `;
}

function renderBundles() {
  const metrics = bundleMetrics();
  title.textContent = "Bundles";
  view.innerHTML = `
    <article class="card hero-panel">
      <div class="card-header"><div><p class="eyebrow">Package Engine</p><h3>Bundle Command Center</h3></div><span class="badge good">${metrics.activeBundles} Active</span></div>
      <p class="metric">${metrics.projectedRevenue}</p>
      <p class="muted">Projected package revenue across active bundle offers.</p>
      <div class="action-row"><button class="action-button">Package Next Bundle</button><button class="action-button">Create Shopify Listing</button><button class="action-button">Assign Vault Access</button></div>
    </article>
    <article class="card full">
      <div class="card-header"><h3>Bundle Queue</h3><span class="badge warning">Packaging</span></div>
      <div class="list">
        ${bundlePackages.map(bundle => `<div class="list-item"><div><strong>${bundle.title}</strong><p class="muted">${bundle.items.join(" • ")}</p><p class="muted">${bundle.value} value → ${bundle.price}</p></div><span class="${badgeClass(bundle.status)}">${bundle.status}</span></div>`).join("")}
      </div>
    </article>
  `;
}

function renderModule(moduleId) {
  renderNav(moduleId);
  const module = kairosState.modules.find(item => item.id === moduleId);
  title.textContent = module?.label || "Dashboard";

  if (moduleId === "dashboard") {
    renderDashboard();
    return;
  }

  if (moduleId === "bundles") {
    renderBundles();
    return;
  }

  const moduleCopy = kairosState.commandCenters[moduleId] || [];
  view.innerHTML = `
    <article class="card hero-panel">
      <div class="card-header"><div><p class="eyebrow">Command Center</p><h3>${module?.label}</h3></div><span class="badge warning">Build Queue</span></div>
      <p class="muted">Kairos-managed workspace for ${module?.label} operations.</p>
      <div class="action-row"><button class="action-button">Execute Next Task</button><button class="action-button">Create Backlog Item</button></div>
    </article>
    <article class="card full">
      <div class="card-header"><h3>Execution Queue</h3><span class="badge warning">Queued</span></div>
      <div class="list">${moduleCopy.map(task => `<div class="list-item"><strong>${task}</strong><span class="badge warning">Queued</span></div>`).join("")}</div>
    </article>
  `;
}

renderNav();
renderDashboard();
