export const KAIROS_GOVERNANCE_REMEDIATION_PLANNING_BUILD = "kairos-governance-remediation-planning-20260727-1";

const STATES = new Set(["draft", "planned", "in_progress", "at_risk", "validated", "closed"]);
const DECISIONS = new Set(["hold", "continue", "escalate", "validate", "close"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const ACTION_STATUSES = new Set(["pending", "in_progress", "blocked", "complete", "cancelled"]);
const EVIDENCE_STATES = new Set(["pending", "current", "insufficient", "stale", "missing", "not_applicable"]);

export function createKairosGovernanceRemediationPlan(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    remediationPlanId: clean(input.remediationPlanId || `kremediation_${crypto.randomUUID()}`, 180),
    assurancePlanId: clean(input.assurancePlanId, 180) || null,
    portfolioId: clean(input.portfolioId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    title: clean(input.title || "Governance remediation plan", 240),
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    priority: normalizePriority(input.priority || "medium"),
    rootCause: normalizeRootCause(input.rootCause),
    correctiveActions: normalizeActions(input.correctiveActions),
    validation: normalizeValidation(input.validation),
    exceptionIds: normalizeIds(input.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds, 200),
    incidentIds: normalizeIds(input.incidentIds, 100),
    reviewIds: normalizeIds(input.reviewIds, 100),
    escalation: normalizeEscalation(input.escalation),
    executiveClosure: normalizeClosure(input.executiveClosure),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_GOVERNANCE_REMEDIATION_PLANNING_BUILD,
  };
  if (!record.remediationPlanId.startsWith("kremediation_")) throw remediationError("REMEDIATION_PLAN_ID_INVALID", "Governance remediation plan IDs must use the kremediation_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosGovernanceRemediationPlan(record, input = {}) {
  const current = createKairosGovernanceRemediationPlan(record);
  const correctiveActions = normalizeActions(input.correctiveActions ?? current.correctiveActions);
  const validation = normalizeValidation(input.validation ?? current.validation);
  const escalation = normalizeEscalation(input.escalation ?? current.escalation);
  const executiveClosure = normalizeClosure(input.executiveClosure ?? current.executiveClosure);
  const now = Date.now();
  const overdue = correctiveActions.some((item) => item.dueAt && new Date(item.dueAt).getTime() < now && item.status !== "complete" && item.status !== "cancelled");
  const blockedCritical = correctiveActions.some((item) => item.priority === "critical" && item.status === "blocked");
  const evidenceGap = validation.evidenceState === "insufficient" || validation.evidenceState === "stale" || validation.evidenceState === "missing";
  const incompleteRequired = correctiveActions.some((item) => item.required && item.status !== "complete");
  let state = normalizeState(input.state || current.state);
  let decision = "continue";
  if (executiveClosure.closed) { state = "closed"; decision = "close"; }
  else if (overdue || blockedCritical || evidenceGap || escalation.active) { state = "at_risk"; decision = "escalate"; }
  else if (validation.validated && !incompleteRequired) { state = "validated"; decision = "validate"; }
  else if (state === "draft") decision = "hold";
  return Object.freeze({
    ...current,
    state,
    decision,
    priority: normalizePriority(input.priority || current.priority),
    rootCause: normalizeRootCause(input.rootCause ?? current.rootCause),
    correctiveActions,
    validation,
    exceptionIds: normalizeIds(input.exceptionIds ?? current.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds ?? current.obligationIds, 200),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 100),
    reviewIds: normalizeIds(input.reviewIds ?? current.reviewIds, 100),
    escalation,
    executiveClosure,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeRootCause(value = {}) { return Object.freeze({ category: clean(value.category, 120) || null, summary: clean(value.summary, 1600) || null, analysis: clean(value.analysis, 3000) || null, evidenceIds: normalizeIds(value.evidenceIds, 100), bounded: true }); }
function normalizeActions(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 150).map((item) => { const status = clean(item.status || "pending", 40); const priority = normalizePriority(item.priority || "medium"); if (!ACTION_STATUSES.has(status)) throw remediationError("REMEDIATION_ACTION_STATUS_INVALID", "Corrective-action status is not registered."); return Object.freeze({ actionId: clean(item.actionId || `action_${crypto.randomUUID()}`, 180), description: clean(item.description, 1200) || null, ownerRole: clean(item.ownerRole, 160) || null, priority, required: item.required !== false, status, targetAt: normalizeIso(item.targetAt), dueAt: normalizeIso(item.dueAt), completedAt: normalizeIso(item.completedAt), validationEvidenceIds: normalizeIds(item.validationEvidenceIds, 50) }); })); }
function normalizeValidation(value = {}) { const evidenceState = clean(value.evidenceState || "pending", 40); if (!EVIDENCE_STATES.has(evidenceState)) throw remediationError("REMEDIATION_EVIDENCE_STATE_INVALID", "Remediation evidence state is not registered."); return Object.freeze({ validated: value.validated === true, validatedAt: normalizeIso(value.validatedAt), validatorRole: clean(value.validatorRole, 160) || null, evidenceState, evidenceIds: normalizeIds(value.evidenceIds, 100), effectiveness: clean(value.effectiveness || "unknown", 40), residualRisk: clean(value.residualRisk, 1600) || null, rationale: clean(value.rationale, 1600) || null, executionAuthorityGranted: false }); }
function normalizeEscalation(value = {}) { return Object.freeze({ active: value.active === true, severity: normalizePriority(value.severity || "medium"), escalatedAt: normalizeIso(value.escalatedAt), ownerRole: clean(value.ownerRole, 160) || null, rationale: clean(value.rationale, 1600) || null, executionAuthorityGranted: false }); }
function normalizeClosure(value = {}) { return Object.freeze({ closed: value.closed === true, closedAt: normalizeIso(value.closedAt), identityHash: clean(value.identityHash, 128) || null, rationale: clean(value.rationale, 1600) || null, acceptedResidualRisk: clean(value.acceptedResidualRisk, 1600) || null, executionAuthorityGranted: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw remediationError("REMEDIATION_PLAN_STATE_INVALID", "Governance remediation-plan state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw remediationError("REMEDIATION_PLAN_DECISION_INVALID", "Governance remediation-plan decision is not registered."); return result; }
function normalizePriority(value) { const result = clean(value, 20); if (!PRIORITIES.has(result)) throw remediationError("REMEDIATION_PRIORITY_INVALID", "Governance remediation priority is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function remediationError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
