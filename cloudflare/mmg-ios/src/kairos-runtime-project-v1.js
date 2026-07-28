export const KAIROS_RUNTIME_PROJECT_BUILD = "kairos-runtime-project-20260727-1";

const STATES = new Set(["initialized","intake","objective_analysis","planning","awaiting_approval","queued","executing","quality_review","packaging","delivery","follow_up","archived","blocked","failed","cancelled"]);
const EVENTS = new Set(["project_created","asset_received","objective_submitted","objective_analyzed","plan_created","approval_requested","approval_granted","approval_rejected","execution_queued","execution_started","execution_completed","qa_started","qa_passed","qa_failed","package_created","delivery_started","delivered","follow_up_started","archived","blocked","unblocked","failed","cancelled"]);
const TRANSITIONS = Object.freeze({
  initialized: ["intake","cancelled"],
  intake: ["objective_analysis","blocked","cancelled"],
  objective_analysis: ["planning","blocked","failed","cancelled"],
  planning: ["awaiting_approval","blocked","failed","cancelled"],
  awaiting_approval: ["queued","planning","blocked","cancelled"],
  queued: ["executing","blocked","cancelled"],
  executing: ["quality_review","blocked","failed","cancelled"],
  quality_review: ["packaging","executing","blocked","failed","cancelled"],
  packaging: ["delivery","blocked","failed","cancelled"],
  delivery: ["follow_up","blocked","failed"],
  follow_up: ["archived","blocked"],
  blocked: ["intake","objective_analysis","planning","awaiting_approval","queued","executing","quality_review","packaging","delivery","follow_up","cancelled"],
  failed: ["queued","cancelled"],
  cancelled: [],
  archived: [],
});

export function createKairosRuntimeProject(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const project = {
    projectId: clean(input.projectId || `kproject_${crypto.randomUUID()}`, 180),
    customerId: clean(input.customerId, 180) || null,
    orderId: clean(input.orderId, 180) || null,
    department: clean(input.department || "publishing", 80),
    projectType: clean(input.projectType || "publishing_project", 120),
    title: clean(input.title || "Untitled Kairos project", 240),
    state: normalizeState(input.state || "initialized"),
    progress: normalizeProgress(input.progress),
    objective: normalizeObjective(input.objective),
    assets: normalizeAssets(input.assets),
    approvals: normalizeApprovals(input.approvals),
    queue: normalizeQueue(input.queue),
    deliverables: normalizeDeliverables(input.deliverables),
    events: normalizeEvents(input.events),
    blockedReason: clean(input.blockedReason, 1000) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
    build: KAIROS_RUNTIME_PROJECT_BUILD,
  };
  if (!project.projectId.startsWith("kproject_")) throw runtimeError("PROJECT_ID_INVALID", "Project IDs must use the kproject_ prefix.");
  return Object.freeze(project);
}

export function transitionKairosRuntimeProject(record, input = {}) {
  const current = createKairosRuntimeProject(record);
  const nextState = normalizeState(input.state || current.state);
  if (nextState !== current.state && !(TRANSITIONS[current.state] || []).includes(nextState)) {
    throw runtimeError("PROJECT_TRANSITION_INVALID", `Transition from ${current.state} to ${nextState} is not allowed.`);
  }
  const event = input.event ? normalizeEvent(input.event) : null;
  const approvals = normalizeApprovals(input.approvals ?? current.approvals);
  if (["queued","executing"].includes(nextState) && !hasRequiredApproval(approvals)) {
    throw runtimeError("PROJECT_APPROVAL_REQUIRED", "Required approval must be granted before execution can begin.");
  }
  const events = event ? Object.freeze([...current.events, event].slice(-500)) : current.events;
  return Object.freeze({
    ...current,
    state: nextState,
    progress: normalizeProgress(input.progress ?? current.progress),
    objective: normalizeObjective(input.objective ?? current.objective),
    assets: normalizeAssets(input.assets ?? current.assets),
    approvals,
    queue: normalizeQueue(input.queue ?? current.queue),
    deliverables: normalizeDeliverables(input.deliverables ?? current.deliverables),
    events,
    blockedReason: clean(input.blockedReason ?? current.blockedReason, 1000) || null,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
  });
}

function hasRequiredApproval(approvals) { return approvals.some((item) => item.required && item.status === "approved"); }
function normalizeObjective(value = {}) { return Object.freeze({ summary: clean(value.summary, 2000) || null, classification: clean(value.classification, 120) || null, deliverableTypes: normalizeIds(value.deliverableTypes, 50), requiredAssetTypes: normalizeIds(value.requiredAssetTypes, 50), complexity: clean(value.complexity || "unclassified", 40), approved: value.approved === true }); }
function normalizeAssets(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 500).map((item) => Object.freeze({ assetId: clean(item.assetId || `asset_${crypto.randomUUID()}`, 180), type: clean(item.type, 120) || "unknown", status: clean(item.status || "received", 40), version: Number.isFinite(item.version) ? Math.max(1, Math.floor(item.version)) : 1, checksum: clean(item.checksum, 180) || null, sourceReference: clean(item.sourceReference, 500) || null, receivedAt: normalizeIso(item.receivedAt) }))); }
function normalizeApprovals(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({ approvalId: clean(item.approvalId || `approval_${crypto.randomUUID()}`, 180), gate: clean(item.gate || "production_plan", 80), required: item.required !== false, status: clean(item.status || "pending", 40), decidedAt: normalizeIso(item.decidedAt), identityHash: clean(item.identityHash, 128) || null, rationale: clean(item.rationale, 1600) || null, executionAuthorityGranted: false }))); }
function normalizeQueue(value = {}) { return Object.freeze({ status: clean(value.status || "not_queued", 40), priority: clean(value.priority || "normal", 40), queuedAt: normalizeIso(value.queuedAt), startedAt: normalizeIso(value.startedAt), completedAt: normalizeIso(value.completedAt), attempt: Number.isFinite(value.attempt) ? Math.max(0, Math.floor(value.attempt)) : 0, retryAuthorized: value.retryAuthorized === true }); }
function normalizeDeliverables(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 300).map((item) => Object.freeze({ deliverableId: clean(item.deliverableId || `deliverable_${crypto.randomUUID()}`, 180), type: clean(item.type, 120) || "unknown", status: clean(item.status || "planned", 40), version: Number.isFinite(item.version) ? Math.max(1, Math.floor(item.version)) : 1, assetIds: normalizeIds(item.assetIds, 100), approved: item.approved === true }))); }
function normalizeEvents(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(-500).map(normalizeEvent)); }
function normalizeEvent(value = {}) { const type = clean(value.type, 80); if (!EVENTS.has(type)) throw runtimeError("PROJECT_EVENT_INVALID", "Runtime event type is not registered."); return Object.freeze({ eventId: clean(value.eventId || `kevent_${crypto.randomUUID()}`, 180), type, state: normalizeState(value.state || "initialized"), occurredAt: normalizeIso(value.occurredAt) || new Date().toISOString(), actorIdentityHash: clean(value.actorIdentityHash, 128) || null, evidenceIds: normalizeIds(value.evidenceIds, 100), summary: clean(value.summary, 1200) || null }); }
function normalizeProgress(value = {}) { const percent = Number(value.percent); return Object.freeze({ percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0, stage: clean(value.stage || "initialized", 80), completedUnits: Number.isFinite(value.completedUnits) ? Math.max(0, Math.floor(value.completedUnits)) : 0, totalUnits: Number.isFinite(value.totalUnits) ? Math.max(0, Math.floor(value.totalUnits)) : 0 }); }
function normalizeState(value) { const state = clean(value, 40); if (!STATES.has(state)) throw runtimeError("PROJECT_STATE_INVALID", "Runtime project state is not registered."); return state; }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function runtimeError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
