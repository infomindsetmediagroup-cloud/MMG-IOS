const productOpsKey = "kairos.productOps.workflow.v1";

const defaultProductWorkflows = [
  {
    id: "PROD-001",
    title: "Digital Download Product Pipeline",
    lane: "Product Operations",
    status: "Ready",
    priority: "P1",
    steps: ["Product record", "Digital file package", "Cover image", "Asset validation", "Shopify draft", "Publish approval"]
  },
  {
    id: "PROD-002",
    title: "Service Product Pipeline",
    lane: "Publishing Services",
    status: "Queued",
    priority: "P1",
    steps: ["Service scope", "Variant setup", "Onboarding PDF", "Fulfillment notes", "Customer intake", "Publish approval"]
  },
  {
    id: "PROD-003",
    title: "Product QA Checklist",
    lane: "Quality",
    status: "Ready",
    priority: "P2",
    steps: ["Pricing", "Description", "SEO", "Images", "Digital delivery", "Mobile check"]
  }
];

function readWorkflows() {
  try {
    const stored = JSON.parse(localStorage.getItem(productOpsKey) || "null");
    return Array.isArray(stored) && stored.length ? stored : defaultProductWorkflows;
  } catch {
    return defaultProductWorkflows;
  }
}

function writeWorkflows(workflows) {
  localStorage.setItem(productOpsKey, JSON.stringify(workflows));
  return workflows;
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[character]));
}

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["ready", "active", "complete", "p1"].includes(normalized)) return "badge good";
  if (["queued", "review", "p2"].includes(normalized)) return "badge warning";
  if (["blocked", "failed", "critical"].includes(normalized)) return "badge danger";
  return "badge";
}

function renderWorkflowRows(workflows) {
  return workflows.map(workflow => `
    <div class="list-item">
      <div>
        <strong>${escapeHTML(workflow.id)} • ${escapeHTML(workflow.title)}</strong>
        <p class="muted">${escapeHTML(workflow.lane)} • ${workflow.steps.map(escapeHTML).join(" → ")}</p>
      </div>
      <div class="action-row" style="margin-top:0;">
        <span class="${badgeClass(workflow.priority)}">${escapeHTML(workflow.priority)}</span>
        <span class="${badgeClass(workflow.status)}">${escapeHTML(workflow.status)}</span>
      </div>
    </div>
  `).join("");
}

function addProductWorkflow() {
  const workflows = readWorkflows();
  const id = `PROD-${String(workflows.length + 1).padStart(3, "0")}`;
  workflows.unshift({
    id,
    title: "New Product Work Item",
    lane: "Product Operations",
    status: "Queued",
    priority: "P2",
    steps: ["Intake", "Assets", "Listing", "QA", "Approval"]
  });
  writeWorkflows(workflows);
  window.dispatchEvent(new CustomEvent("kairos:product-ops-updated", { detail: { count: workflows.length } }));
}

function renderProductOpsWorkflowPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-product-ops-workflow-panel]")) return;

  const workflows = readWorkflows();
  const readyCount = workflows.filter(item => item.status === "Ready").length;

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.productOpsWorkflowPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Product Operations</p>
        <h3>Product Publishing Workflow Center</h3>
      </div>
      <span class="badge warning">${readyCount} Ready</span>
    </div>
    <p class="muted">Tracks the two canonical MMG publishing pipelines: digital-download products and service products. This keeps product work inside dashboard setup mode until Build Mode is approved.</p>
    <div class="action-row" style="margin-top:16px;">
      <button class="action-button" data-add-product-workflow>Add Product Work Item</button>
      <button class="action-button" data-reset-product-workflows>Reset Product Pipelines</button>
    </div>
    <div class="list" data-product-workflow-list style="margin-top:16px;">${renderWorkflowRows(workflows)}</div>
  `;

  const modeGate = view.querySelector("[data-dashboard-mode-gate-panel]");
  if (modeGate?.nextSibling) {
    view.insertBefore(card, modeGate.nextSibling);
  } else {
    view.appendChild(card);
  }

  card.querySelector("[data-add-product-workflow]").addEventListener("click", () => {
    addProductWorkflow();
    card.querySelector("[data-product-workflow-list]").innerHTML = renderWorkflowRows(readWorkflows());
  });

  card.querySelector("[data-reset-product-workflows]").addEventListener("click", () => {
    writeWorkflows(defaultProductWorkflows);
    card.querySelector("[data-product-workflow-list]").innerHTML = renderWorkflowRows(readWorkflows());
  });
}

const observer = new MutationObserver(() => renderProductOpsWorkflowPanel());

window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderProductOpsWorkflowPanel();
});

window.addEventListener("kairos:auth", renderProductOpsWorkflowPanel);
