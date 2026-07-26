export const KAIROS_INCIDENT_LIFECYCLE_BUILD = "kairos-incident-lifecycle-20260725-2-release-correlation";

const STATUSES = new Set(["open", "acknowledged", "mitigated", "resolved", "closed"]);
const SEVERITIES = new Set(["info", "warning", "critical"]);
const TRANSITIONS = Object.freeze({
  open: new Set(["acknowledged", "mitigated", "resolved"]),
  acknowledged: new Set(["mitigated", "resolved"]),
  mitigated: new Set(["resolved"]),
  resolved: new Set(["closed", "open"]),
  closed: new Set(["open"]),
});

export function createKairosIncident(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const status = normalizeStatus(input.status || "open");
  const severity = normalizeSeverity(input.severity || "warning");
  const incidentId = clean(input.incidentId || `kinc_${crypto.randomUUID()}`, 180);
  if (!incidentId.startsWith("kinc_")) throw incidentError("INCIDENT_ID_INVALID", "Incident IDs must use the kinc_ prefix.");
  const record = {
    incidentId,
    title: clean(input.title, 240),
    summary: clean(input.summary, 1200),
    sourceAlertCode: clean(input.sourceAlertCode, 180) || null,
    requestId: clean(input.requestId, 180) || null,
    approvalId: clean(input.approvalId, 180) || null,
    releaseId: clean(input.releaseId, 180) || null,
    deploymentId: clean(input.deploymentId, 180) || null,
    environment: clean(input.environment, 80) || null,
    commitSha: normalizeCommitSha(input.commitSha),
    severity,
    status,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    acknowledgedAt: normalizeIso(input.acknowledgedAt),
    mitigatedAt: normalizeIso(input.mitigatedAt),
    resolvedAt: normalizeIso(input.resolvedAt),
    closedAt: normalizeIso(input.closedAt),
    ownerIdentityHash: clean(input.ownerIdentityHash, 128) || null,
    resolutionCode: clean(input.resolutionCode, 180) || null,
    notes: boundedNotes(input.notes),
    automaticRemediationAllowed: false,
    build: KAIROS_INCIDENT_LIFECYCLE_BUILD,
  };
  if (!record.title) throw incidentError("INCIDENT_TITLE_REQUIRED", "An incident title is required.");
  return Object.freeze(record);
}

export function transitionKairosIncident(incident, input = {}) {
  const current = createKairosIncident(incident);
  const nextStatus = normalizeStatus(input.status);
  if (nextStatus === current.status) return current;
  if (!TRANSITIONS[current.status]?.has(nextStatus)) throw incidentError("INCIDENT_TRANSITION_INVALID", `Cannot transition an incident from ${current.status} to ${nextStatus}.`);
  const timestamp = normalizeIso(input.timestamp) || new Date().toISOString();
  const updated = {
    ...current,
    status: nextStatus,
    updatedAt: timestamp,
    ownerIdentityHash: clean(input.ownerIdentityHash || current.ownerIdentityHash, 128) || null,
    resolutionCode: nextStatus === "resolved" || nextStatus === "closed" ? clean(input.resolutionCode || current.resolutionCode, 180) || null : current.resolutionCode,
    notes: boundedNotes([...(current.notes || []), ...(input.note ? [{ at: timestamp, text: input.note, identityHash: input.ownerIdentityHash }] : [])]),
    acknowledgedAt: nextStatus === "acknowledged" ? timestamp : current.acknowledgedAt,
    mitigatedAt: nextStatus === "mitigated" ? timestamp : current.mitigatedAt,
    resolvedAt: nextStatus === "resolved" ? timestamp : nextStatus === "open" ? null : current.resolvedAt,
    closedAt: nextStatus === "closed" ? timestamp : nextStatus === "open" ? null : current.closedAt,
    automaticRemediationAllowed: false,
  };
  if ((nextStatus === "resolved" || nextStatus === "closed") && !updated.resolutionCode) throw incidentError("INCIDENT_RESOLUTION_CODE_REQUIRED", "Resolved and closed incidents require a resolution code.");
  return Object.freeze(updated);
}

function boundedNotes(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.slice(-100).map((item) => Object.freeze({
    at: normalizeIso(item?.at) || new Date().toISOString(),
    text: clean(item?.text, 1200),
    identityHash: clean(item?.identityHash, 128) || null,
  })).filter((item) => item.text));
}

function normalizeStatus(value) {
  const status = clean(value, 40);
  if (!STATUSES.has(status)) throw incidentError("INCIDENT_STATUS_INVALID", "Incident status is not registered.");
  return status;
}

function normalizeSeverity(value) {
  const severity = clean(value, 40);
  if (!SEVERITIES.has(severity)) throw incidentError("INCIDENT_SEVERITY_INVALID", "Incident severity is not registered.");
  return severity;
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeCommitSha(value) {
  const sha = clean(value, 64).toLowerCase();
  if (!sha) return null;
  if (!/^[a-f0-9]{7,64}$/.test(sha)) throw incidentError("INCIDENT_COMMIT_SHA_INVALID", "Commit correlation must be a hexadecimal Git commit SHA.");
  return sha;
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function incidentError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}
