export const KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD = "kairos-customer-runtime-projection-20260727-1";

const CUSTOMER_STATES = Object.freeze({
  initialized: "Order received",
  intake: "Preparing your project",
  objective_analysis: "Analyzing your goals",
  planning: "Building your production plan",
  awaiting_approval: "Waiting for your approval",
  queued: "Queued for production",
  executing: "Production in progress",
  quality_review: "Quality review",
  packaging: "Packaging deliverables",
  delivery: "Preparing delivery",
  follow_up: "Delivered",
  archived: "Completed",
  blocked: "Action required",
  failed: "Needs attention",
  cancelled: "Cancelled",
});

export function createKairosCustomerRuntimeProjection(project = {}, input = {}) {
  const customerId = clean(input.customerId || project.customerId, 180);
  if (!customerId) throw projectionError("CUSTOMER_ID_REQUIRED", "Customer runtime projection requires a customer ID.");
  if (project.customerId && clean(project.customerId, 180) !== customerId) throw projectionError("CUSTOMER_SCOPE_MISMATCH", "Project does not belong to the authenticated customer.", 403);
  const state = clean(project.state || "initialized", 40);
  const deliverables = (Array.isArray(project.deliverables) ? project.deliverables : []).filter((item) => item.approved === true || ["packaged","delivered"].includes(clean(item.status, 40))).slice(0, 100).map((item) => Object.freeze({ deliverableId: clean(item.deliverableId, 180), type: clean(item.type, 120), status: clean(item.status, 40), version: Number.isFinite(item.version) ? Math.max(1, Math.floor(item.version)) : 1 }));
  const approvals = (Array.isArray(project.approvals) ? project.approvals : []).filter((item) => item.required).slice(0, 20).map((item) => Object.freeze({ gate: clean(item.gate, 80), status: clean(item.status, 40), rationale: clean(item.rationale, 500) || null }));
  const events = (Array.isArray(project.events) ? project.events : []).filter((item) => isCustomerVisibleEvent(item.type)).slice(-100).map((item) => Object.freeze({ type: clean(item.type, 80), state: clean(item.state, 40), occurredAt: normalizeIso(item.occurredAt), summary: clean(item.summary, 500) || null }));
  return Object.freeze({
    projectId: clean(project.projectId, 180),
    customerId,
    title: clean(project.title, 240),
    state,
    statusLabel: CUSTOMER_STATES[state] || "Project in progress",
    progress: Object.freeze({ percent: clampPercent(project.progress?.percent), stage: clean(project.progress?.stage || state, 80) }),
    nextAction: deriveNextAction(state, approvals, project.blockedReason),
    approvals: Object.freeze(approvals),
    deliverables: Object.freeze(deliverables),
    timeline: Object.freeze(events),
    blockedReason: state === "blocked" ? clean(project.blockedReason, 500) || "Additional information is required." : null,
    customerMutationAllowed: false,
    deploymentExecutionAllowed: false,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
    build: KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD,
  });
}

function deriveNextAction(state, approvals, blockedReason) {
  if (state === "awaiting_approval") return Object.freeze({ type: "review_approval", label: "Review and approve the production plan" });
  if (state === "blocked") return Object.freeze({ type: "resolve_blocker", label: clean(blockedReason, 240) || "Provide the requested information" });
  if (state === "follow_up" || state === "archived") return Object.freeze({ type: "download_deliverables", label: "Download approved deliverables" });
  if (approvals.some((item) => item.status === "pending")) return Object.freeze({ type: "review_approval", label: "Review pending approval" });
  return null;
}
function isCustomerVisibleEvent(type) { return new Set(["project_created","asset_received","objective_analyzed","plan_created","approval_requested","approval_granted","execution_queued","execution_started","execution_completed","qa_started","qa_passed","package_created","delivery_started","delivered","follow_up_started","archived","blocked","unblocked"]).has(clean(type, 80)); }
function clampPercent(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0; }
function normalizeIso(value) { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function projectionError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
