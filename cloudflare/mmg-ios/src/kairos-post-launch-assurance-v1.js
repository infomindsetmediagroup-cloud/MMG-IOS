export const KAIROS_POST_LAUNCH_ASSURANCE_BUILD = "kairos-post-launch-assurance-20260726-1";

const ASSURANCE_STATES = new Set(["watching", "stable", "degraded", "escalated", "closed"]);
const DECISIONS = new Set(["continue_watch", "certify_stable", "escalate", "close"]);
const SLO_RESULTS = new Set(["pending", "met", "missed", "waived"]);

export function createKairosPostLaunchAssurance(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    assuranceId: clean(input.assuranceId || `kassure_${crypto.randomUUID()}`, 180),
    authorizationId: clean(input.authorizationId, 180) || null,
    certificationId: clean(input.certificationId, 180) || null,
    releaseId: clean(input.releaseId, 180) || null,
    deploymentId: clean(input.deploymentId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    state: normalizeState(input.state || "watching"),
    decision: normalizeDecision(input.decision || "continue_watch"),
    watchWindow: normalizeWindow(input.watchWindow),
    slos: normalizeSlos(input.slos),
    escalation: normalizeEscalation(input.escalation),
    closure: normalizeClosure(input.closure),
    evidenceIds: normalizeIds(input.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds, 50),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    launchExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_POST_LAUNCH_ASSURANCE_BUILD,
  };
  if (!record.assuranceId.startsWith("kassure_")) throw assuranceError("ASSURANCE_ID_INVALID", "Assurance IDs must use the kassure_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosPostLaunchAssurance(record, input = {}) {
  const current = createKairosPostLaunchAssurance(record);
  const slos = normalizeSlos({ ...current.slos, ...(input.slos || {}) });
  const escalation = normalizeEscalation(input.escalation ?? current.escalation);
  const closure = normalizeClosure(input.closure ?? current.closure);
  const watchWindow = normalizeWindow(input.watchWindow ?? current.watchWindow);
  const values = Object.values(slos);
  const missed = values.some((value) => value === "missed");
  const complete = values.every((value) => value === "met" || value === "waived");
  let decision = "continue_watch";
  let state = normalizeState(input.state || current.state);
  if (missed || escalation.required) { decision = "escalate"; state = "escalated"; }
  else if (closure.certified && complete) { decision = "close"; state = "closed"; }
  else if (complete) { decision = "certify_stable"; state = "stable"; }
  return Object.freeze({
    ...current,
    watchWindow,
    slos,
    escalation,
    closure,
    decision,
    state,
    evidenceIds: normalizeIds(input.evidenceIds ?? current.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 50),
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    launchExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeSlos(value = {}) {
  return Object.freeze({
    availability: normalizeSlo(value.availability || "pending"),
    latency: normalizeSlo(value.latency || "pending"),
    errorRate: normalizeSlo(value.errorRate || "pending"),
    dependencyHealth: normalizeSlo(value.dependencyHealth || "pending"),
    customerExperience: normalizeSlo(value.customerExperience || "pending"),
  });
}
function normalizeEscalation(value = {}) { return Object.freeze({ required: value.required === true, severity: ["info", "warning", "critical"].includes(clean(value.severity, 20)) ? clean(value.severity, 20) : "warning", reason: clean(value.reason, 1000) || null, incidentId: clean(value.incidentId, 180) || null }); }
function normalizeClosure(value = {}) { return Object.freeze({ certified: value.certified === true, identityHash: clean(value.identityHash, 128) || null, certifiedAt: normalizeIso(value.certifiedAt), note: clean(value.note, 1000) || null, executionAuthorityGranted: false }); }
function normalizeWindow(value = {}) { const durationMinutes = Math.min(10080, Math.max(15, Number(value.durationMinutes) || 60)); return Object.freeze({ startedAt: normalizeIso(value.startedAt), endsAt: normalizeIso(value.endsAt), durationMinutes }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!ASSURANCE_STATES.has(result)) throw assuranceError("ASSURANCE_STATE_INVALID", "Post-launch assurance state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw assuranceError("ASSURANCE_DECISION_INVALID", "Post-launch assurance decision is not registered."); return result; }
function normalizeSlo(value) { const result = clean(value, 40); if (!SLO_RESULTS.has(result)) throw assuranceError("ASSURANCE_SLO_INVALID", "Post-launch SLO result is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function assuranceError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
