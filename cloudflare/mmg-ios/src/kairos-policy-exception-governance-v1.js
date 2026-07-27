export const KAIROS_POLICY_EXCEPTION_GOVERNANCE_BUILD = "kairos-policy-exception-governance-20260726-1";

const STATES = new Set(["draft", "review", "approved", "expired", "revoked", "closed"]);
const DECISIONS = new Set(["hold", "continue_review", "approve", "renew", "revoke", "close"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const CONTROL_RESULTS = new Set(["pending", "effective", "partially_effective", "ineffective", "not_applicable"]);

export function createKairosPolicyException(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    exceptionId: clean(input.exceptionId || `kexcept_${crypto.randomUUID()}`, 180),
    reviewId: clean(input.reviewId, 180) || null,
    continuityId: clean(input.continuityId, 180) || null,
    policyReference: clean(input.policyReference, 300) || null,
    controlReference: clean(input.controlReference, 300) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    severity: normalizeSeverity(input.severity || "medium"),
    businessJustification: clean(input.businessJustification, 1800) || null,
    scope: normalizeScope(input.scope),
    compensatingControls: normalizeControls(input.compensatingControls),
    approvals: normalizeApprovals(input.approvals),
    evidenceIds: normalizeIds(input.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds, 50),
    validity: normalizeValidity(input.validity),
    riskAcceptance: normalizeRiskAcceptance(input.riskAcceptance),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_POLICY_EXCEPTION_GOVERNANCE_BUILD,
  };
  if (!record.exceptionId.startsWith("kexcept_")) throw exceptionError("EXCEPTION_ID_INVALID", "Policy exception IDs must use the kexcept_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosPolicyException(record, input = {}) {
  const current = createKairosPolicyException(record);
  const controls = normalizeControls(input.compensatingControls ?? current.compensatingControls);
  const approvals = normalizeApprovals(input.approvals ?? current.approvals);
  const validity = normalizeValidity(input.validity ?? current.validity);
  const riskAcceptance = normalizeRiskAcceptance(input.riskAcceptance ?? current.riskAcceptance);
  const now = Date.now();
  const expired = validity.expiresAt ? new Date(validity.expiresAt).getTime() <= now : true;
  const ineffectiveControl = controls.some((control) => control.result === "ineffective");
  const controlsReady = controls.length > 0 && controls.every((control) => ["effective", "not_applicable"].includes(control.result));
  const approvalsReady = approvals.length > 0 && approvals.every((approval) => approval.decision === "approved");
  let state = normalizeState(input.state || current.state);
  let decision = "hold";
  if (input.revoke === true || ineffectiveControl) { state = "revoked"; decision = "revoke"; }
  else if (expired && state !== "closed") { state = "expired"; decision = "hold"; }
  else if (state === "closed") decision = "close";
  else if (riskAcceptance.accepted && approvalsReady && controlsReady) { state = "approved"; decision = current.state === "expired" ? "renew" : "approve"; }
  else if (state === "review") decision = "continue_review";
  return Object.freeze({
    ...current,
    state,
    decision,
    severity: normalizeSeverity(input.severity ?? current.severity),
    businessJustification: clean(input.businessJustification ?? current.businessJustification, 1800) || null,
    scope: normalizeScope(input.scope ?? current.scope),
    compensatingControls: controls,
    approvals,
    evidenceIds: normalizeIds(input.evidenceIds ?? current.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 50),
    validity,
    riskAcceptance,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeScope(value = {}) { return Object.freeze({ service: clean(value.service, 160) || null, component: clean(value.component, 160) || null, operation: clean(value.operation, 160) || null, bounded: true }); }
function normalizeControls(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 50).map((control) => Object.freeze({ controlId: clean(control.controlId || `kcontrol_${crypto.randomUUID()}`, 180), summary: clean(control.summary, 500) || null, ownerRole: clean(control.ownerRole, 120) || null, result: normalizeControlResult(control.result || "pending"), evidenceIds: normalizeIds(control.evidenceIds, 25) }))); }
function normalizeApprovals(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 20).map((approval) => Object.freeze({ role: clean(approval.role, 120) || null, identityHash: clean(approval.identityHash, 128) || null, decision: approval.decision === "approved" ? "approved" : approval.decision === "rejected" ? "rejected" : "pending", decidedAt: normalizeIso(approval.decidedAt), rationale: clean(approval.rationale, 1000) || null, executionAuthorityGranted: false }))); }
function normalizeValidity(value = {}) { return Object.freeze({ startsAt: normalizeIso(value.startsAt), expiresAt: normalizeIso(value.expiresAt), reviewAt: normalizeIso(value.reviewAt), renewable: value.renewable === true, maximumDays: Math.min(Math.max(Number(value.maximumDays) || 30, 1), 365) }); }
function normalizeRiskAcceptance(value = {}) { return Object.freeze({ accepted: value.accepted === true, identityHash: clean(value.identityHash, 128) || null, acceptedAt: normalizeIso(value.acceptedAt), rationale: clean(value.rationale, 1200) || null, residualRisk: clean(value.residualRisk, 800) || null, executionAuthorityGranted: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw exceptionError("EXCEPTION_STATE_INVALID", "Policy exception state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw exceptionError("EXCEPTION_DECISION_INVALID", "Policy exception decision is not registered."); return result; }
function normalizeSeverity(value) { const result = clean(value, 20); if (!SEVERITIES.has(result)) throw exceptionError("EXCEPTION_SEVERITY_INVALID", "Policy exception severity is not registered."); return result; }
function normalizeControlResult(value) { const result = clean(value, 40); if (!CONTROL_RESULTS.has(result)) throw exceptionError("CONTROL_RESULT_INVALID", "Compensating-control result is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function exceptionError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
