export const KAIROS_OPERATIONAL_CONTINUITY_BUILD = "kairos-operational-continuity-20260726-1";

const STATES = new Set(["draft", "review", "attested", "at_risk", "closed"]);
const DECISIONS = new Set(["hold", "continue", "attest", "escalate", "close"]);
const RISK_LEVELS = new Set(["info", "warning", "critical"]);

export function createKairosOperationalContinuity(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    continuityId: clean(input.continuityId || `kcontinuity_${crypto.randomUUID()}`, 180),
    assuranceId: clean(input.assuranceId, 180) || null,
    authorizationId: clean(input.authorizationId, 180) || null,
    certificationId: clean(input.certificationId, 180) || null,
    releaseId: clean(input.releaseId, 180) || null,
    deploymentId: clean(input.deploymentId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    ownership: normalizeOwnership(input.ownership),
    onCall: normalizeOnCall(input.onCall),
    maintenance: normalizeMaintenance(input.maintenance),
    handoff: normalizeHandoff(input.handoff),
    risks: normalizeRisks(input.risks),
    evidenceIds: normalizeIds(input.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds, 50),
    executiveSummary: clean(input.executiveSummary, 2000) || null,
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_OPERATIONAL_CONTINUITY_BUILD,
  };
  if (!record.continuityId.startsWith("kcontinuity_")) throw continuityError("CONTINUITY_ID_INVALID", "Continuity IDs must use the kcontinuity_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosOperationalContinuity(record, input = {}) {
  const current = createKairosOperationalContinuity(record);
  const ownership = normalizeOwnership(input.ownership ?? current.ownership);
  const onCall = normalizeOnCall(input.onCall ?? current.onCall);
  const maintenance = normalizeMaintenance(input.maintenance ?? current.maintenance);
  const handoff = normalizeHandoff(input.handoff ?? current.handoff);
  const risks = normalizeRisks(input.risks ?? current.risks);
  const criticalRisk = risks.some((risk) => risk.level === "critical" && risk.resolved !== true);
  const ready = ownership.accountableOwnerHash && onCall.coverageReady && maintenance.runbookReady && handoff.attested;
  let state = normalizeState(input.state || current.state);
  let decision = "hold";
  if (criticalRisk) { state = "at_risk"; decision = "escalate"; }
  else if (ready && state === "closed") decision = "close";
  else if (ready) { state = "attested"; decision = "attest"; }
  else if (state === "review") decision = "continue";
  return Object.freeze({
    ...current,
    ownership,
    onCall,
    maintenance,
    handoff,
    risks,
    state,
    decision,
    evidenceIds: normalizeIds(input.evidenceIds ?? current.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 50),
    executiveSummary: clean(input.executiveSummary ?? current.executiveSummary, 2000) || null,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeOwnership(value = {}) { return Object.freeze({ accountableOwnerHash: clean(value.accountableOwnerHash, 128) || null, serviceOwnerRole: clean(value.serviceOwnerRole, 120) || null, escalationOwnerRole: clean(value.escalationOwnerRole, 120) || null }); }
function normalizeOnCall(value = {}) { return Object.freeze({ coverageReady: value.coverageReady === true, scheduleReference: clean(value.scheduleReference, 300) || null, escalationPathReady: value.escalationPathReady === true, contactDataStored: false }); }
function normalizeMaintenance(value = {}) { return Object.freeze({ runbookReady: value.runbookReady === true, nextWindowStart: normalizeIso(value.nextWindowStart), nextWindowEnd: normalizeIso(value.nextWindowEnd), timezone: clean(value.timezone || "UTC", 80), executionAuthorityGranted: false }); }
function normalizeHandoff(value = {}) { return Object.freeze({ attested: value.attested === true, identityHash: clean(value.identityHash, 128) || null, attestedAt: normalizeIso(value.attestedAt), note: clean(value.note, 1000) || null, executionAuthorityGranted: false }); }
function normalizeRisks(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 50).map((risk) => Object.freeze({ riskId: clean(risk.riskId || `krisk_${crypto.randomUUID()}`, 180), level: normalizeRiskLevel(risk.level || "warning"), summary: clean(risk.summary, 500) || null, resolved: risk.resolved === true, incidentId: clean(risk.incidentId, 180) || null }))); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw continuityError("CONTINUITY_STATE_INVALID", "Operational continuity state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw continuityError("CONTINUITY_DECISION_INVALID", "Operational continuity decision is not registered."); return result; }
function normalizeRiskLevel(value) { const result = clean(value, 20); if (!RISK_LEVELS.has(result)) throw continuityError("CONTINUITY_RISK_LEVEL_INVALID", "Operational continuity risk level is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function continuityError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
