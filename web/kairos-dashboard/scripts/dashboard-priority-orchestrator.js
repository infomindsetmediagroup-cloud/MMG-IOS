import { getRuntimeStore } from "./runtime-store.js";

const selectors = {
  approval: "[data-approval-panel]",
  pipeline: "[data-execution-pipeline-panel]",
  readiness: "[data-execution-readiness-panel]",
  validation: "[data-validation-checklist-panel]",
  hero: ".hero-panel"
};

const priorityRanks = {
  critical: -50,
  decision: -40,
  ready: -30,
  active: -20,
  queued: -10,
  support: 20
};

function classifyPipelineState() {
  const store = getRuntimeStore();
  const pipeline = store.executionPipeline || [];
  const approvals = store.approvals || [];
  const pendingApprovals = approvals.filter(item => item.status === "Pending");
  const readyWork = pipeline.filter(item => item.status === "Ready");
  const activeWork = pipeline.filter(item => item.status === "In Progress");
  const queuedWork = pipeline.filter(item => item.status === "Queued");
  const completedWork = pipeline.filter(item => item.status === "Completed");

  return {
    pendingApprovals,
    readyWork,
    activeWork,
    queuedWork,
    completedWork,
    hasPendingApprovals: pendingApprovals.length > 0,
    hasReadyWork: readyWork.length > 0,
    hasActiveWork: activeWork.length > 0,
    hasQueuedWork: queuedWork.length > 0
  };
}

function tagCard(selector, priority, rankOffset = 0) {
  document.querySelectorAll(selector).forEach(card => {
    card.dataset.priorityCard = priority;
    card.style.order = String((priorityRanks[priority] || 0) + rankOffset);
  });
}

function addSuccessionLabels(root, state) {
  root.querySelectorAll("[data-succession-label]").forEach(label => label.remove());
  const chain = [
    { selector: selectors.approval, label: state.hasPendingApprovals ? "01 Decision Required" : "04 Approval Watch" },
    { selector: selectors.pipeline, label: state.hasReadyWork ? "02 Ready to Execute" : state.hasActiveWork ? "02 Work in Motion" : "03 Queue Control" },
    { selector: selectors.readiness, label: "03 Readiness Gate" },
    { selector: selectors.validation, label: "04 Validation Gate" }
  ];

  chain.forEach(item => {
    root.querySelectorAll(item.selector).forEach(card => {
      const header = card.querySelector(".card-header");
      if (!header) return;
      const marker = document.createElement("span");
      marker.className = "badge succession-label";
      marker.dataset.successionLabel = "true";
      marker.textContent = item.label;
      header.appendChild(marker);
    });
  });
}

function orchestrateDashboardPriority() {
  const root = document.querySelector("#dashboard-view");
  if (!root) return;

  const state = classifyPipelineState();
  root.querySelectorAll("[data-priority-card]").forEach(card => {
    delete card.dataset.priorityCard;
    card.style.order = "";
  });

  tagCard(selectors.approval, state.hasPendingApprovals ? "critical" : "support", 0);
  tagCard(selectors.pipeline, state.hasReadyWork ? "ready" : state.hasActiveWork || state.hasQueuedWork ? "decision" : "support", 1);
  tagCard(selectors.readiness, state.hasReadyWork ? "decision" : state.hasActiveWork ? "active" : "queued", 2);
  tagCard(selectors.validation, state.hasPendingApprovals || state.hasReadyWork ? "decision" : "support", 3);
  tagCard(selectors.hero, "active", 8);

  root.querySelectorAll(".kpi-card").forEach((card, index) => {
    card.dataset.priorityCard = "support";
    card.style.order = String(30 + index);
  });

  addSuccessionLabels(root, state);
}

let observerStarted = false;
function startPriorityObserver() {
  const root = document.querySelector("#dashboard-view");
  if (!root || observerStarted) return;
  observerStarted = true;
  const observer = new MutationObserver(() => orchestrateDashboardPriority());
  observer.observe(root, { childList: true, subtree: false });
}

document.addEventListener("DOMContentLoaded", () => {
  orchestrateDashboardPriority();
  startPriorityObserver();
});
document.addEventListener("kairos:rendered", orchestrateDashboardPriority);
document.addEventListener("click", event => {
  if (event.target.closest("button")) requestAnimationFrame(orchestrateDashboardPriority);
});
