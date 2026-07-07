const completionCriteria = [
  { title: "Command intake", status: "Active", detail: "Natural-language work intake is available at the top of the dashboard." },
  { title: "Work queue", status: "Active", detail: "Dashboard work can be captured, categorized, and tracked." },
  { title: "Navigation", status: "Active", detail: "Modules are reachable through the primary dashboard navigation and jump controls." },
  { title: "Panel layout", status: "Active", detail: "Dashboard modules can be collapsed, expanded, and displayed full-width on mobile." },
  { title: "Operations modules", status: "In Progress", detail: "Commerce, publishing, customer, knowledge, marketing, and system modules continue expanding." },
  { title: "Completion acknowledgement", status: "Gate", detail: "When all dashboard-critical modules are active, Kairos stops and requests approval before switching to Build Mode." }
];

function badgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (["active", "ready", "complete"].includes(value)) return "badge good";
  if (["in progress", "gate", "review"].includes(value)) return "badge warning";
  return "badge";
}

function dashboardCompletionPercent() {
  const complete = completionCriteria.filter(item => item.status === "Active").length;
  return Math.round((complete / completionCriteria.length) * 100);
}

function renderCompletionGatePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-completion-gate-panel]")) return;

  const percent = dashboardCompletionPercent();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.completionGatePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Phase Gate</p>
        <h3>Dashboard Completion Gate</h3>
      </div>
      <span class="badge warning">${percent}%</span>
    </div>
    <p class="muted">Kairos remains in dashboard setup mode until the dashboard is functionally complete. At completion, execution pauses for acknowledgment before moving into website, product, Shopify, and business Build Mode.</p>
    <div class="list" style="margin-top:16px;">
      ${completionCriteria.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.detail}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
    </div>
  `;

  const commandPanel = view.querySelector("[data-command-block-panel]");
  if (commandPanel?.nextSibling) {
    view.insertBefore(card, commandPanel.nextSibling);
  } else {
    view.prepend(card);
  }
}

const observer = new MutationObserver(() => renderCompletionGatePanel());

window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCompletionGatePanel();
});

window.addEventListener("kairos:auth", renderCompletionGatePanel);
