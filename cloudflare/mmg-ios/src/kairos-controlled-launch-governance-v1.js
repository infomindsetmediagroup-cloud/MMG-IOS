export const KAIROS_CONTROLLED_LAUNCH_GOVERNANCE_BUILD = "kairos-controlled-launch-governance-20260725-1";

const AUTHORIZATION_STATES = new Set(["draft", "review", "authorized", "held", "completed", "cancelled"]);
const DECISIONS = new Set(["hold", "conditional_authorize", "authorize", "cancel"]);
const APPROVAL_STATES = new Set(["pending", "approved", "rejected"]);

export function createKairosLaunchAuthorization(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    authorizationId: clean(input.authorizationId || `klauth_${crypto.randomUUID()}`, 180),
    certificationId: clean(input.certificationId, 180) || null,
    releaseId: clean(input.releaseId, 180) || null,
    deploymentId: clean(input.deploymentId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    changeWindow: normalizeWindow(input.changeWindow),
    prerequisites: normalizePrerequisites(input.prerequisites),
    stakeholders: normalizeStakeholders(input.stakeholders),
    communications: normalizeCommunications(input.communications),
    postLaunchWatch: normalizeWatch(input.postLaunchWatch),
    incidentIds: normalizeIds(input.incidentIds, 50),
    evidenceIds: normalizeIds(input.evidenceIds, 100),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    launchExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_CONTROLLED_LAUNCH_GOVERNANCE_BUILD,
  };
  if (!record.authorizationId.startsWith("klauth_")) throw governanceError("AUTHORIZATION_ID_INVALID", "Launch authorization IDs must use the klauth_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosLaunchAuthorization(record, input = {}) {
  const current = createKairosLaunchAuthorization(record);
  const prerequisites = normalizePrerequisites({ ...current.prerequisites, ...(input.prerequisites || {}) });
  const stakeholders = normalizeStakeholders(input.stakeholders ?? current.stakeholders);
  const communications = normalizeCommunications(input.communications ?? current.communications);
  const changeWindow = normalizeWindow(input.changeWindow ?? current.changeWindow);
  const postLaunchWatch = normalizeWatch(input.postLaunchWatch ?? current.postLaunchWatch);
  const requiredPrerequisites = [prerequisites.certificationApproved, prerequisites.releaseReady, prerequisites.noCriticalIncidents, prerequisites.recoveryPlanReady];
  const rejected = stakeholders.some((item) => item.status === "rejected");
  const allApproved = stakeholders.length > 0 && stakeholders.every((item) => item.status === "approved");
  const windowValid = Boolean(changeWindow.startAt && changeWindow.endAt && Date.parse(changeWindow.endAt) > Date.parse(changeWindow.startAt));
  let decision = "hold";
  if (rejected) decision = "cancel";
  else if (requiredPrerequisites.every(Boolean) && allApproved && communications.ready && windowValid) decision = "authorize";
  else if (requiredPrerequisites.every(Boolean) && !rejected) decision = "conditional_authorize";
  return Object.freeze({
    ...current,
    prerequisites,
    stakeholders,
    communications,
    changeWindow,
    postLaunchWatch,
    decision,
    state: normalizeState(input.state || current.state),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 50),
    evidenceIds: normalizeIds(input.evidenceIds ?? current.evidenceIds, 100),
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    launchExecutionAllowed: false,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizePrerequisites(value = {}) {
  return Object.freeze({
    certificationApproved: value.certificationApproved === true,
    releaseReady: value.releaseReady === true,
    noCriticalIncidents: value.noCriticalIncidents === true,
    recoveryPlanReady: value.recoveryPlanReady === true,
  });
}
function normalizeStakeholders(value = []) {
  return Object.freeze((Array.isArray(value) ? value : []).slice(0, 25).map((item) => Object.freeze({
    role: clean(item?.role, 120),
    identityHash: clean(item?.identityHash, 128) || null,
    status: APPROVAL_STATES.has(clean(item?.status, 30)) ? clean(item.status, 30) : "pending",
    decidedAt: normalizeIso(item?.decidedAt),
    note: clean(item?.note, 500) || null,
  })).filter((item) => item.role));
}
function normalizeCommunications(value = {}) { return Object.freeze({ ready: value.ready === true, statusPagePrepared: value.statusPagePrepared === true, supportBriefed: value.supportBriefed === true, stakeholderNoticePrepared: value.stakeholderNoticePrepared === true }); }
function normalizeWindow(value = {}) { return Object.freeze({ startAt: normalizeIso(value.startAt), endAt: normalizeIso(value.endAt), timezone: clean(value.timezone || "UTC", 80), freezeExceptionsApproved: value.freezeExceptionsApproved === true }); }
function normalizeWatch(value = {}) { const minutes = Math.min(1440, Math.max(15, Number(value.durationMinutes) || 60)); return Object.freeze({ durationMinutes: minutes, ownerIdentityHash: clean(value.ownerIdentityHash, 128) || null, successCriteria: clean(value.successCriteria, 1000) || null, escalationCriteria: clean(value.escalationCriteria, 1000) || null }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!AUTHORIZATION_STATES.has(result)) throw governanceError("AUTHORIZATION_STATE_INVALID", "Launch authorization state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw governanceError("AUTHORIZATION_DECISION_INVALID", "Launch authorization decision is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function governanceError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
