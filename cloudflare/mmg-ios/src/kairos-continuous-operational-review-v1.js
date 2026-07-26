export const KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_BUILD = "kairos-continuous-operational-review-20260726-1";

const STATES = new Set(["draft", "review", "attested", "improvement_required", "closed"]);
const DECISIONS = new Set(["hold", "continue", "attest", "require_improvement", "close"]);
const CONTROL_RESULTS = new Set(["pending", "effective", "partially_effective", "ineffective", "not_applicable"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);

export function createKairosContinuousOperationalReview(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    reviewId: clean(input.reviewId || `koreview_${crypto.randomUUID()}`, 180),
    continuityId: clean(input.continuityId, 180) || null,
    assuranceId: clean(input.assuranceId, 180) || null,
    authorizationId: clean(input.authorizationId, 180) || null,
    certificationId: clean(input.certificationId, 180) || null,
    releaseId: clean(input.releaseId, 180) || null,
    deploymentId: clean(input.deploymentId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    reviewPeriod: normalizePeriod(input.reviewPeriod),
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    controls: normalizeControls(input.controls),
    improvementActions: normalizeActions(input.improvementActions),
    evidenceIds: normalizeIds(input.evidenceIds, 150),
    incidentIds: normalizeIds(input.incidentIds, 50),
    carriedRisks: normalizeRisks(input.carriedRisks),
    executiveSummary: clean(input.executiveSummary, 2400) || null,
    attestation: normalizeAttestation(input.attestation),
    retention: normalizeRetention(input.retention),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_BUILD,
  };
  if (!record.reviewId.startsWith("koreview_")) throw reviewError("REVIEW_ID_INVALID", "Operational review IDs must use the koreview_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosContinuousOperationalReview(record, input = {}) {
  const current = createKairosContinuousOperationalReview(record);
  const controls = normalizeControls(input.controls ?? current.controls);
  const improvementActions = normalizeActions(input.improvementActions ?? current.improvementActions);
  const carriedRisks = normalizeRisks(input.carriedRisks ?? current.carriedRisks);
  const attestation = normalizeAttestation(input.attestation ?? current.attestation);
  const failedControl = controls.some((control) => control.result === "ineffective");
  const criticalAction = improvementActions.some((action) => action.priority === "critical" && action.status !== "completed");
  const criticalRisk = carriedRisks.some((risk) => risk.priority === "critical" && risk.resolved !== true);
  const allControlsResolved = controls.length > 0 && controls.every((control) => control.result !== "pending");
  let state = normalizeState(input.state || current.state);
  let decision = "hold";
  if (failedControl || criticalAction || criticalRisk) { state = "improvement_required"; decision = "require_improvement"; }
  else if (attestation.attested && state === "closed") decision = "close";
  else if (attestation.attested && allControlsResolved) { state = "attested"; decision = "attest"; }
  else if (state === "review") decision = "continue";
  return Object.freeze({
    ...current,
    reviewPeriod: normalizePeriod(input.reviewPeriod ?? current.reviewPeriod),
    controls,
    improvementActions,
    carriedRisks,
    attestation,
    retention: normalizeRetention(input.retention ?? current.retention),
    state,
    decision,
    evidenceIds: normalizeIds(input.evidenceIds ?? current.evidenceIds, 150),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 50),
    executiveSummary: clean(input.executiveSummary ?? current.executiveSummary, 2400) || null,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizePeriod(value = {}) { return Object.freeze({ startedAt: normalizeIso(value.startedAt), endedAt: normalizeIso(value.endedAt), cadence: clean(value.cadence || "monthly", 40) }); }
function normalizeControls(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((control) => Object.freeze({ controlId: clean(control.controlId || `kcontrol_${crypto.randomUUID()}`, 180), name: clean(control.name, 200) || null, result: normalizeControlResult(control.result || "pending"), evidenceIds: normalizeIds(control.evidenceIds, 25), note: clean(control.note, 800) || null }))); }
function normalizeActions(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((action) => Object.freeze({ actionId: clean(action.actionId || `kaction_${crypto.randomUUID()}`, 180), summary: clean(action.summary, 500) || null, ownerRole: clean(action.ownerRole, 120) || null, priority: normalizePriority(action.priority || "medium"), dueAt: normalizeIso(action.dueAt), status: clean(action.status || "open", 40) }))); }
function normalizeRisks(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 50).map((risk) => Object.freeze({ riskId: clean(risk.riskId || `krisk_${crypto.randomUUID()}`, 180), summary: clean(risk.summary, 500) || null, priority: normalizePriority(risk.priority || "medium"), resolved: risk.resolved === true, incidentId: clean(risk.incidentId, 180) || null }))); }
function normalizeAttestation(value = {}) { return Object.freeze({ attested: value.attested === true, identityHash: clean(value.identityHash, 128) || null, attestedAt: normalizeIso(value.attestedAt), rationale: clean(value.rationale, 1200) || null, executionAuthorityGranted: false }); }
function normalizeRetention(value = {}) { return Object.freeze({ retainUntil: normalizeIso(value.retainUntil), policyReference: clean(value.policyReference, 300) || null, rawCustomerContentStored: false, credentialsStored: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw reviewError("REVIEW_STATE_INVALID", "Operational review state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw reviewError("REVIEW_DECISION_INVALID", "Operational review decision is not registered."); return result; }
function normalizeControlResult(value) { const result = clean(value, 40); if (!CONTROL_RESULTS.has(result)) throw reviewError("CONTROL_RESULT_INVALID", "Control result is not registered."); return result; }
function normalizePriority(value) { const result = clean(value, 20); if (!PRIORITIES.has(result)) throw reviewError("PRIORITY_INVALID", "Priority is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function reviewError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
