export const KAIROS_PRODUCTION_READINESS_CERTIFICATION_BUILD = "kairos-production-readiness-certification-20260725-1";

const GATE_RESULTS = new Set(["pending", "passed", "failed", "waived"]);
const RECOMMENDATIONS = new Set(["hold", "conditional_go", "go", "no_go"]);

export function createKairosReadinessCertification(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const certification = {
    certificationId: clean(input.certificationId || `kcert_${crypto.randomUUID()}`, 180),
    releaseId: clean(input.releaseId, 180) || null,
    deploymentId: clean(input.deploymentId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    gates: normalizeGates(input.gates),
    blockers: normalizeBlockers(input.blockers),
    evidenceIds: normalizeIds(input.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds, 50),
    recommendation: normalizeRecommendation(input.recommendation || "hold"),
    signoff: normalizeSignoff(input.signoff),
    launchExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_PRODUCTION_READINESS_CERTIFICATION_BUILD,
  };
  if (!certification.certificationId.startsWith("kcert_")) throw certificationError("CERTIFICATION_ID_INVALID", "Certification IDs must use the kcert_ prefix.");
  return Object.freeze(certification);
}

export function evaluateKairosReadinessCertification(record, input = {}) {
  const current = createKairosReadinessCertification(record);
  const gates = normalizeGates({ ...current.gates, ...(input.gates || {}) });
  const blockers = normalizeBlockers(input.blockers ?? current.blockers);
  const required = [gates.runtime, gates.health, gates.contracts, gates.experience, gates.incidentResponse, gates.releaseRecovery];
  const failed = required.some((value) => value === "failed");
  const complete = required.every((value) => value === "passed" || value === "waived");
  const unresolvedBlockers = blockers.filter((item) => item.status !== "resolved");
  let recommendation = "hold";
  if (failed || unresolvedBlockers.some((item) => item.severity === "critical")) recommendation = "no_go";
  else if (complete && unresolvedBlockers.length === 0) recommendation = "go";
  else if (complete) recommendation = "conditional_go";
  return Object.freeze({
    ...current,
    gates,
    blockers,
    recommendation,
    evidenceIds: normalizeIds(input.evidenceIds ?? current.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 50),
    signoff: normalizeSignoff(input.signoff ?? current.signoff),
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    launchExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeGates(value = {}) {
  return Object.freeze({
    runtime: normalizeGate(value.runtime || "pending"),
    health: normalizeGate(value.health || "pending"),
    contracts: normalizeGate(value.contracts || "pending"),
    experience: normalizeGate(value.experience || "pending"),
    incidentResponse: normalizeGate(value.incidentResponse || "pending"),
    releaseRecovery: normalizeGate(value.releaseRecovery || "pending"),
  });
}

function normalizeBlockers(value = []) {
  return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({
    code: clean(item?.code, 120),
    summary: clean(item?.summary, 500),
    severity: ["info", "warning", "critical"].includes(clean(item?.severity, 20)) ? clean(item.severity, 20) : "warning",
    status: clean(item?.status, 30) === "resolved" ? "resolved" : "open",
  })).filter((item) => item.code && item.summary));
}

function normalizeSignoff(value = {}) {
  return Object.freeze({
    status: ["pending", "approved", "rejected"].includes(clean(value.status, 30)) ? clean(value.status, 30) : "pending",
    identityHash: clean(value.identityHash, 128) || null,
    signedAt: normalizeIso(value.signedAt),
    note: clean(value.note, 1000) || null,
    executionAuthorityGranted: false,
  });
}

function normalizeIds(value, max) {
  return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max));
}
function normalizeGate(value) { const result = clean(value, 40); if (!GATE_RESULTS.has(result)) throw certificationError("CERTIFICATION_GATE_INVALID", "Readiness gate result is not registered."); return result; }
function normalizeRecommendation(value) { const result = clean(value, 40); if (!RECOMMENDATIONS.has(result)) throw certificationError("CERTIFICATION_RECOMMENDATION_INVALID", "Readiness recommendation is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function certificationError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
