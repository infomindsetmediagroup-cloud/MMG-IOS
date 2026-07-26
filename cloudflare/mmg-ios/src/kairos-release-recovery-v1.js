export const KAIROS_RELEASE_RECOVERY_BUILD = "kairos-release-recovery-20260725-1";

const RELEASE_STATUSES = new Set(["planned", "verifying", "ready", "released", "degraded", "rolled_back", "closed"]);
const VERIFICATION_RESULTS = new Set(["pending", "passed", "failed", "not_applicable"]);
const RECOVERY_ACTIONS = new Set(["observe", "hold", "prepare_rollback", "rollback_recommended", "close"]);

export function createKairosReleaseRecord(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    releaseId: clean(input.releaseId || `krel_${crypto.randomUUID()}`, 180),
    deploymentId: clean(input.deploymentId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    status: normalizeReleaseStatus(input.status || "planned"),
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    verification: normalizeVerification(input.verification),
    recoveryPlan: normalizeRecoveryPlan(input.recoveryPlan),
    rollbackExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_RELEASE_RECOVERY_BUILD,
  };
  if (!record.releaseId.startsWith("krel_")) throw releaseError("RELEASE_ID_INVALID", "Release IDs must use the krel_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosRelease(record, input = {}) {
  const current = createKairosReleaseRecord(record);
  const timestamp = normalizeIso(input.timestamp) || new Date().toISOString();
  const verification = normalizeVerification({ ...current.verification, ...(input.verification || {}) });
  const failed = Object.values(verification).some((item) => item === "failed");
  const allRequiredPassed = [verification.runtime, verification.health, verification.contracts, verification.experience].every((item) => item === "passed" || item === "not_applicable");
  let status = current.status;
  if (failed) status = "degraded";
  else if (allRequiredPassed && new Set(["planned", "verifying", "ready"]).has(status)) status = "ready";
  else if (status === "planned") status = "verifying";
  const recoveryAction = failed ? "rollback_recommended" : allRequiredPassed ? "observe" : "hold";
  return Object.freeze({
    ...current,
    status,
    verification,
    recoveryPlan: normalizeRecoveryPlan({ ...current.recoveryPlan, action: input.recoveryAction || recoveryAction, reasonCode: input.reasonCode || current.recoveryPlan.reasonCode, incidentId: input.incidentId || current.recoveryPlan.incidentId }),
    updatedAt: timestamp,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    rollbackExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeVerification(value = {}) {
  const result = {
    runtime: normalizeVerificationResult(value.runtime || "pending"),
    health: normalizeVerificationResult(value.health || "pending"),
    contracts: normalizeVerificationResult(value.contracts || "pending"),
    experience: normalizeVerificationResult(value.experience || "pending"),
  };
  return Object.freeze(result);
}

function normalizeRecoveryPlan(value = {}) {
  const action = clean(value.action || "observe", 60);
  if (!RECOVERY_ACTIONS.has(action)) throw releaseError("RECOVERY_ACTION_INVALID", "Recovery action is not registered.");
  return Object.freeze({
    action,
    reasonCode: clean(value.reasonCode, 180) || null,
    incidentId: clean(value.incidentId, 180) || null,
    requiresNewApproval: action === "prepare_rollback" || action === "rollback_recommended",
    automaticExecution: false,
  });
}

function normalizeReleaseStatus(value) {
  const status = clean(value, 60);
  if (!RELEASE_STATUSES.has(status)) throw releaseError("RELEASE_STATUS_INVALID", "Release status is not registered.");
  return status;
}

function normalizeVerificationResult(value) {
  const result = clean(value, 40);
  if (!VERIFICATION_RESULTS.has(result)) throw releaseError("VERIFICATION_RESULT_INVALID", "Verification result is not registered.");
  return result;
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function releaseError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}
