export const KAIROS_GOVERNANCE_OBLIGATION_TRACKING_BUILD = "kairos-governance-obligation-tracking-20260726-1";

const STATES = new Set(["draft", "active", "at_risk", "overdue", "fulfilled", "closed"]);
const DECISIONS = new Set(["hold", "continue", "escalate", "fulfill", "close"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const EVIDENCE_STATES = new Set(["pending", "current", "stale", "missing", "not_applicable"]);

export function createKairosGovernanceObligation(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    obligationId: clean(input.obligationId || `kobligation_${crypto.randomUUID()}`, 180),
    exceptionId: clean(input.exceptionId, 180) || null,
    reviewId: clean(input.reviewId, 180) || null,
    continuityId: clean(input.continuityId, 180) || null,
    policyReference: clean(input.policyReference, 300) || null,
    controlReference: clean(input.controlReference, 300) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    title: clean(input.title, 300) || null,
    description: clean(input.description, 1600) || null,
    ownerRole: clean(input.ownerRole, 160) || null,
    ownerIdentityHash: clean(input.ownerIdentityHash, 128) || null,
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    priority: normalizePriority(input.priority || "medium"),
    schedule: normalizeSchedule(input.schedule),
    evidence: normalizeEvidence(input.evidence),
    escalation: normalizeEscalation(input.escalation),
    closure: normalizeClosure(input.closure),
    evidenceIds: normalizeIds(input.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds, 50),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_GOVERNANCE_OBLIGATION_TRACKING_BUILD,
  };
  if (!record.obligationId.startsWith("kobligation_")) throw obligationError("OBLIGATION_ID_INVALID", "Governance obligation IDs must use the kobligation_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosGovernanceObligation(record, input = {}) {
  const current = createKairosGovernanceObligation(record);
  const schedule = normalizeSchedule(input.schedule ?? current.schedule);
  const evidence = normalizeEvidence(input.evidence ?? current.evidence);
  const escalation = normalizeEscalation(input.escalation ?? current.escalation);
  const closure = normalizeClosure(input.closure ?? current.closure);
  const now = Date.now();
  const dueAt = schedule.dueAt ? new Date(schedule.dueAt).getTime() : null;
  const overdue = dueAt !== null && dueAt <= now && !closure.closed;
  const evidenceBlocked = ["stale", "missing"].includes(evidence.state);
  let state = normalizeState(input.state || current.state);
  let decision = "continue";
  if (closure.closed) { state = "closed"; decision = "close"; }
  else if (input.fulfill === true && evidence.state === "current") { state = "fulfilled"; decision = "fulfill"; }
  else if (overdue) { state = "overdue"; decision = "escalate"; }
  else if (evidenceBlocked || escalation.active) { state = "at_risk"; decision = "escalate"; }
  else if (state === "draft") decision = "hold";
  return Object.freeze({
    ...current,
    title: clean(input.title ?? current.title, 300) || null,
    description: clean(input.description ?? current.description, 1600) || null,
    ownerRole: clean(input.ownerRole ?? current.ownerRole, 160) || null,
    ownerIdentityHash: clean(input.ownerIdentityHash ?? current.ownerIdentityHash, 128) || null,
    state,
    decision,
    priority: normalizePriority(input.priority ?? current.priority),
    schedule,
    evidence,
    escalation,
    closure,
    evidenceIds: normalizeIds(input.evidenceIds ?? current.evidenceIds, 100),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 50),
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeSchedule(value = {}) { return Object.freeze({ dueAt: normalizeIso(value.dueAt), reviewAt: normalizeIso(value.reviewAt), evidenceRefreshAt: normalizeIso(value.evidenceRefreshAt), cadence: clean(value.cadence || "monthly", 80), graceDays: Math.min(Math.max(Number(value.graceDays) || 0, 0), 90) }); }
function normalizeEvidence(value = {}) { return Object.freeze({ state: normalizeEvidenceState(value.state || "pending"), summary: clean(value.summary, 800) || null, lastRefreshedAt: normalizeIso(value.lastRefreshedAt), sourceCount: Math.min(Math.max(Number(value.sourceCount) || 0, 0), 500), bounded: true }); }
function normalizeEscalation(value = {}) { return Object.freeze({ active: value.active === true, severity: normalizePriority(value.severity || "medium"), escalatedAt: normalizeIso(value.escalatedAt), ownerRole: clean(value.ownerRole, 160) || null, rationale: clean(value.rationale, 1200) || null, incidentId: clean(value.incidentId, 180) || null, executionAuthorityGranted: false }); }
function normalizeClosure(value = {}) { return Object.freeze({ closed: value.closed === true, closedAt: normalizeIso(value.closedAt), identityHash: clean(value.identityHash, 128) || null, rationale: clean(value.rationale, 1200) || null, evidenceAccepted: value.evidenceAccepted === true, executionAuthorityGranted: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw obligationError("OBLIGATION_STATE_INVALID", "Governance obligation state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw obligationError("OBLIGATION_DECISION_INVALID", "Governance obligation decision is not registered."); return result; }
function normalizePriority(value) { const result = clean(value, 20); if (!PRIORITIES.has(result)) throw obligationError("OBLIGATION_PRIORITY_INVALID", "Governance obligation priority is not registered."); return result; }
function normalizeEvidenceState(value) { const result = clean(value, 40); if (!EVIDENCE_STATES.has(result)) throw obligationError("OBLIGATION_EVIDENCE_STATE_INVALID", "Governance obligation evidence state is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function obligationError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
