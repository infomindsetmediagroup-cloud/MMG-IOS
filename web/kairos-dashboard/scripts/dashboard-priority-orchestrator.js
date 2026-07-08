import { getRuntimeStore } from "./runtime-store.js";

const selectors = {
  approval: "[data-approval-panel]",
  pipeline: "[data-execution-pipeline-panel]",
  readiness: "[data-execution-readiness-panel]",
  validation: "[data-validation-checklist-panel]"
};

function classifyPipelineState() {
  const store = getRuntimeStore();
  const pipeline = store.executionPipeline || [];
  const approvals = store.approvals || [];
  return {
    hasPendingApprovals: approvals.some(item => item.status === "Pending"),
    hasReadyWork: pipeline.some(item => item.status === "Ready"),
    hasActiveWork: pipeline.some(item => item.status === "In Progress"),
    hasQueuedWork: pipeline.some(item => item.status === "Queued")
  };
}

function tagCard(selector, priority) {
  document.querySelectorAll(selector).forEach(card => {
    card.dataset.priorityCard = priority;
  });
}

function orchestrateDashboardPriority() {
  const root = document.querySelector("#dashboard-view");
  if (!root) return;

  const state = classifyPipelineState();
  root.querySelectorAll("[data-priority-card]").forEach(card => delete card.dataset.priorityCard);

  tagCard(selectors.approval, state.hasPendingApprovals ? "critical" : "support");
  tagCard(selectors.pipeline, state.hasReadyWork || state.hasActiveWork || state.hasQueuedWork ? "decision" : "support");
  tagCard(selectors.readiness, state.hasReadyWork ? "ready" : "active");
  tagCard(selectors.validation, state.hasPendingApprovals || state.hasReadyWork ? "decision" : "support");

  root.querySelector(".hero-panel")?.setAttribute("data-priority-card", "active");
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
