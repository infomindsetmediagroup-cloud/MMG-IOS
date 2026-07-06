import { kairosState } from "./state.js";

const nav = document.querySelector("#module-nav");
const view = document.querySelector("#dashboard-view");
const title = document.querySelector("#page-title");
const mode = document.querySelector("#runtime-mode");

mode.textContent = kairosState.mode;

function renderNav(active = "dashboard") {
  nav.innerHTML = kairosState.modules.map(module => `
    <button class="nav-button ${module.id === active ? "active" : ""}" data-module="${module.id}">${module.label}</button>
  `).join("");

  nav.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => renderModule(button.dataset.module));
  });
}

function badgeClass(value) {
  if (["Active", "Low"].includes(value)) return "badge";
  if (["Medium", "Queued"].includes(value)) return "badge warning";
  return "badge danger";
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
  title.textContent = "Dashboard";
  view.innerHTML = `
    <article class="card large">
      <div class="card-header">
        <div>
          <p class="eyebrow">Good evening, ${kairosState.operator}</p>
          <h3>${kairosState.activeBatch}</h3>
        </div>
        <span class="badge">Phase 1</span>
      </div>
      <p class="metric">${kairosState.health}%</p>
      <p class="muted">System health across website, Shopify, products, reviews, revenue, and knowledge operations.</p>
    </article>

    <article class="card">
      <div class="card-header"><h3>Operational Readiness</h3><span class="badge warning">Build</span></div>
      <p class="metric">${kairosState.readiness}%</p>
      <p class="muted">Dashboard shell is active. Live integrations remain queued.</p>
    </article>

    <article class="card large">
      <div class="card-header"><h3>Today's Priorities</h3><span class="badge">Active Queue</span></div>
      ${list(kairosState.priorities)}
    </article>

    <article class="card">
      <div class="card-header"><h3>Awaiting Approval</h3><span class="badge warning">${kairosState.approvals.length}</span></div>
      ${list(kairosState.approvals, "risk")}
    </article>

    <article class="card full">
      <div class="card-header"><h3>Managed Subsystems</h3><span class="badge">Kairos Managed</span></div>
      ${list(kairosState.systems)}
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

  const moduleCopy = {
    website: ["Run homepage audit", "Validate navigation", "Create production backlog", "Fix SEO and internal links"],
    shopify: ["Validate Judge.me widgets", "Create bundle structure", "Prepare product templates", "Audit checkout offers"],
    products: ["Create product health score", "Generate product guides", "Map vault access", "Package white-label deliverables"],
    knowledge: ["Build Free Vault", "Classify articles", "Map revenue modules", "Create MMG Passport entry"],
    revenue: ["Welcome popup", "Checkout discount", "Bundle engine", "Email capture"],
    customers: ["Customer portal", "Vault access", "License records", "Review follow-up"],
    ai: ["Model routing", "Research queue", "Writing tasks", "Code review tasks"],
    system: ["Integrations", "Runtime health", "Backups", "Golden Master"]
  }[moduleId] || [];

  view.innerHTML = `
    <article class="card full">
      <div class="card-header">
        <div>
          <p class="eyebrow">Command Center</p>
          <h3>${module?.label}</h3>
        </div>
        <span class="badge warning">Build Queue</span>
      </div>
      <div class="list">
        ${moduleCopy.map(task => `<div class="list-item"><strong>${task}</strong><span class="badge warning">Queued</span></div>`).join("")}
      </div>
    </article>
  `;
}

renderNav();
renderDashboard();
