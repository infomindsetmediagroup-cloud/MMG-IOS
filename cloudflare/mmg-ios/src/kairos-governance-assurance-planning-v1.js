export const KAIROS_GOVERNANCE_ASSURANCE_PLANNING_BUILD = "kairos-governance-assurance-planning-20260727-1";

const STATES = new Set(["draft", "scheduled", "in_review", "at_risk", "certified", "closed"]);
const DECISIONS = new Set(["hold", "continue", "escalate", "certify", "close"]);
const CADENCES = new Set(["monthly", "quarterly", "semiannual", "annual", "event_driven"]);
const EVIDENCE_STATES = new Set(["pending", "current", "aging", "stale", "missing", "not_applicable"]);

export function createKairosGovernanceAssurancePlan(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    assurancePlanId: clean(input.assurancePlanId || `kassuranceplan_${crypto.randomUUID()}`, 180),
    portfolioId: clean(input.portfolioId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    title: clean(input.title || "Governance assurance cycle", 240),
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    schedule: normalizeSchedule(input.schedule),
    evidencePolicy: normalizeEvidencePolicy(input.evidencePolicy),
    ownerCommitments: normalizeCommitments(input.ownerCommitments),
    controlAssessments: normalizeControls(input.controlAssessments),
    exceptionIds: normalizeIds(input.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds, 200),
    reviewIds: normalizeIds(input.reviewIds, 100),
    incidentIds: normalizeIds(input.incidentIds, 100),
    escalation: normalizeEscalation(input.escalation),
    executiveCertification: normalizeCertification(input.executiveCertification),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_GOVERNANCE_ASSURANCE_PLANNING_BUILD,
  };
  if (!record.assurancePlanId.startsWith("kassuranceplan_")) throw assuranceError("ASSURANCE_PLAN_ID_INVALID", "Governance assurance plan IDs must use the kassuranceplan_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosGovernanceAssurancePlan(record, input = {}) {
  const current = createKairosGovernanceAssurancePlan(record);
  const schedule = normalizeSchedule(input.schedule ?? current.schedule);
  const evidencePolicy = normalizeEvidencePolicy(input.evidencePolicy ?? current.evidencePolicy);
  const ownerCommitments = normalizeCommitments(input.ownerCommitments ?? current.ownerCommitments);
  const controlAssessments = normalizeControls(input.controlAssessments ?? current.controlAssessments);
  const escalation = normalizeEscalation(input.escalation ?? current.escalation);
  const executiveCertification = normalizeCertification(input.executiveCertification ?? current.executiveCertification);
  const now = Date.now();
  const overdue = Boolean(schedule.dueAt && new Date(schedule.dueAt).getTime() < now && !executiveCertification.closed);
  const evidenceRisk = controlAssessments.some((item) => ["stale", "missing"].includes(item.evidenceState) || item.effectiveness === "ineffective");
  const ownerGap = ownerCommitments.some((item) => item.required && item.status !== "complete");
  let state = normalizeState(input.state || current.state);
  let decision = "continue";
  if (executiveCertification.closed) { state = "closed"; decision = "close"; }
  else if (overdue || evidenceRisk || ownerGap || escalation.active) { state = "at_risk"; decision = "escalate"; }
  else if (executiveCertification.certified) { state = "certified"; decision = "certify"; }
  else if (state === "draft") decision = "hold";
  return Object.freeze({
    ...current,
    state,
    decision,
    schedule,
    evidencePolicy,
    ownerCommitments,
    controlAssessments,
    exceptionIds: normalizeIds(input.exceptionIds ?? current.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds ?? current.obligationIds, 200),
    reviewIds: normalizeIds(input.reviewIds ?? current.reviewIds, 100),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 100),
    escalation,
    executiveCertification,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeSchedule(value = {}) { const cadence = clean(value.cadence || "quarterly", 40); if (!CADENCES.has(cadence)) throw assuranceError("ASSURANCE_CADENCE_INVALID", "Governance assurance cadence is not registered."); return Object.freeze({ cadence, startsAt: normalizeIso(value.startsAt), dueAt: normalizeIso(value.dueAt), reviewAt: normalizeIso(value.reviewAt), nextCycleAt: normalizeIso(value.nextCycleAt), graceDays: boundedNumber(value.graceDays, 90) }); }
function normalizeEvidencePolicy(value = {}) { return Object.freeze({ maximumAgeDays: Math.max(1, boundedNumber(value.maximumAgeDays || 90, 730)), warningAgeDays: Math.max(1, boundedNumber(value.warningAgeDays || 60, 729)), requireCurrentEvidence: value.requireCurrentEvidence !== false, bounded: true }); }
function normalizeCommitments(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({ commitmentId: clean(item.commitmentId || `commitment_${crypto.randomUUID()}`, 180), ownerRole: clean(item.ownerRole, 160) || null, description: clean(item.description, 800) || null, required: item.required !== false, status: clean(item.status || "pending", 40), dueAt: normalizeIso(item.dueAt), completedAt: normalizeIso(item.completedAt) }))); }
function normalizeControls(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 150).map((item) => { const evidenceState = clean(item.evidenceState || "pending", 40); if (!EVIDENCE_STATES.has(evidenceState)) throw assuranceError("ASSURANCE_EVIDENCE_STATE_INVALID", "Governance assurance evidence state is not registered."); return Object.freeze({ controlReference: clean(item.controlReference, 300) || null, ownerRole: clean(item.ownerRole, 160) || null, effectiveness: clean(item.effectiveness || "unknown", 40), evidenceState, evidenceAgeDays: boundedNumber(item.evidenceAgeDays, 10000), evidenceIds: normalizeIds(item.evidenceIds, 50), exceptionCount: boundedNumber(item.exceptionCount, 1000), obligationCount: boundedNumber(item.obligationCount, 1000) }); })); }
function normalizeEscalation(value = {}) { return Object.freeze({ active: value.active === true, severity: clean(value.severity || "medium", 40), escalatedAt: normalizeIso(value.escalatedAt), ownerRole: clean(value.ownerRole, 160) || null, rationale: clean(value.rationale, 1600) || null, executionAuthorityGranted: false }); }
function normalizeCertification(value = {}) { return Object.freeze({ certified: value.certified === true, closed: value.closed === true, certifiedAt: normalizeIso(value.certifiedAt), closedAt: normalizeIso(value.closedAt), identityHash: clean(value.identityHash, 128) || null, rationale: clean(value.rationale, 1600) || null, residualRisk: clean(value.residualRisk, 1200) || null, executionAuthorityGranted: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw assuranceError("ASSURANCE_PLAN_STATE_INVALID", "Governance assurance plan state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw assuranceError("ASSURANCE_PLAN_DECISION_INVALID", "Governance assurance plan decision is not registered."); return result; }
function boundedNumber(value, max) { return Math.min(Math.max(Number(value) || 0, 0), max); }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function assuranceError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
