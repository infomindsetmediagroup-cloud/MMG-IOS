export const KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_BUILD = "kairos-governance-effectiveness-verification-20260727-1";

const STATES = new Set(["draft", "observing", "at_risk", "effective", "ineffective", "certified", "closed"]);
const DECISIONS = new Set(["hold", "continue", "escalate", "confirm_effective", "confirm_ineffective", "certify", "close"]);
const EFFECTIVENESS = new Set(["unknown", "effective", "partially_effective", "ineffective"]);
const EVIDENCE_STATES = new Set(["pending", "current", "stale", "missing", "insufficient"]);

export function createKairosGovernanceEffectivenessVerification(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    verificationId: clean(input.verificationId || `keffectiveness_${crypto.randomUUID()}`, 180),
    remediationPlanId: clean(input.remediationPlanId, 180) || null,
    assurancePlanId: clean(input.assurancePlanId, 180) || null,
    portfolioId: clean(input.portfolioId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    title: clean(input.title || "Governance effectiveness verification", 240),
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    observationWindow: normalizeWindow(input.observationWindow),
    controlComparisons: normalizeComparisons(input.controlComparisons),
    regressionSignals: normalizeSignals(input.regressionSignals),
    sustainabilityAssessment: normalizeSustainability(input.sustainabilityAssessment),
    lessonsLearned: normalizeLessons(input.lessonsLearned),
    exceptionIds: normalizeIds(input.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds, 200),
    incidentIds: normalizeIds(input.incidentIds, 100),
    escalation: normalizeEscalation(input.escalation),
    executiveCertification: normalizeCertification(input.executiveCertification),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_BUILD,
  };
  if (!record.verificationId.startsWith("keffectiveness_")) throw verificationError("EFFECTIVENESS_VERIFICATION_ID_INVALID", "Effectiveness verification IDs must use the keffectiveness_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosGovernanceEffectivenessVerification(record, input = {}) {
  const current = createKairosGovernanceEffectivenessVerification(record);
  const controlComparisons = normalizeComparisons(input.controlComparisons ?? current.controlComparisons);
  const regressionSignals = normalizeSignals(input.regressionSignals ?? current.regressionSignals);
  const sustainabilityAssessment = normalizeSustainability(input.sustainabilityAssessment ?? current.sustainabilityAssessment);
  const escalation = normalizeEscalation(input.escalation ?? current.escalation);
  const executiveCertification = normalizeCertification(input.executiveCertification ?? current.executiveCertification);
  const evidenceGap = controlComparisons.some((item) => ["stale", "missing", "insufficient"].includes(item.evidenceState));
  const ineffective = controlComparisons.some((item) => item.effectiveness === "ineffective");
  const partial = controlComparisons.some((item) => item.effectiveness === "partially_effective");
  const regression = regressionSignals.some((item) => item.active === true);
  const windowComplete = sustainabilityAssessment.windowComplete === true;
  let state = normalizeState(input.state || current.state);
  let decision = "continue";
  if (executiveCertification.closed) { state = "closed"; decision = "close"; }
  else if (executiveCertification.certified && windowComplete && !evidenceGap && !ineffective && !partial && !regression) { state = "certified"; decision = "certify"; }
  else if (ineffective) { state = "ineffective"; decision = "confirm_ineffective"; }
  else if (evidenceGap || regression || escalation.active) { state = "at_risk"; decision = "escalate"; }
  else if (windowComplete && !partial) { state = "effective"; decision = "confirm_effective"; }
  else if (state === "draft") decision = "hold";
  return Object.freeze({
    ...current,
    state,
    decision,
    observationWindow: normalizeWindow(input.observationWindow ?? current.observationWindow),
    controlComparisons,
    regressionSignals,
    sustainabilityAssessment,
    lessonsLearned: normalizeLessons(input.lessonsLearned ?? current.lessonsLearned),
    exceptionIds: normalizeIds(input.exceptionIds ?? current.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds ?? current.obligationIds, 200),
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

function normalizeWindow(value = {}) { return Object.freeze({ startedAt: normalizeIso(value.startedAt), endsAt: normalizeIso(value.endsAt), minimumDays: boundedNumber(value.minimumDays, 1, 365, 30), completedAt: normalizeIso(value.completedAt) }); }
function normalizeComparisons(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 200).map((item) => { const effectiveness = clean(item.effectiveness || "unknown", 40); const evidenceState = clean(item.evidenceState || "pending", 40); if (!EFFECTIVENESS.has(effectiveness)) throw verificationError("CONTROL_EFFECTIVENESS_INVALID", "Control effectiveness is not registered."); if (!EVIDENCE_STATES.has(evidenceState)) throw verificationError("EFFECTIVENESS_EVIDENCE_STATE_INVALID", "Evidence state is not registered."); return Object.freeze({ controlId: clean(item.controlId, 180) || null, baseline: clean(item.baseline, 1600) || null, current: clean(item.current, 1600) || null, effectiveness, evidenceState, evidenceIds: normalizeIds(item.evidenceIds, 100), measuredAt: normalizeIso(item.measuredAt) }); })); }
function normalizeSignals(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({ signalId: clean(item.signalId || `signal_${crypto.randomUUID()}`, 180), category: clean(item.category, 120) || null, active: item.active === true, severity: clean(item.severity || "medium", 40), detectedAt: normalizeIso(item.detectedAt), evidenceIds: normalizeIds(item.evidenceIds, 50), summary: clean(item.summary, 1200) || null }))); }
function normalizeSustainability(value = {}) { return Object.freeze({ windowComplete: value.windowComplete === true, assessmentAt: normalizeIso(value.assessmentAt), recurrenceObserved: value.recurrenceObserved === true, trend: clean(value.trend || "unknown", 40), rationale: clean(value.rationale, 2000) || null }); }
function normalizeLessons(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({ lessonId: clean(item.lessonId || `lesson_${crypto.randomUUID()}`, 180), summary: clean(item.summary, 1200) || null, policyImpact: clean(item.policyImpact, 1200) || null, controlImpact: clean(item.controlImpact, 1200) || null, ownerRole: clean(item.ownerRole, 160) || null }))); }
function normalizeEscalation(value = {}) { return Object.freeze({ active: value.active === true, severity: clean(value.severity || "medium", 40), escalatedAt: normalizeIso(value.escalatedAt), ownerRole: clean(value.ownerRole, 160) || null, rationale: clean(value.rationale, 1600) || null, executionAuthorityGranted: false }); }
function normalizeCertification(value = {}) { return Object.freeze({ certified: value.certified === true, certifiedAt: normalizeIso(value.certifiedAt), closed: value.closed === true, closedAt: normalizeIso(value.closedAt), identityHash: clean(value.identityHash, 128) || null, rationale: clean(value.rationale, 1600) || null, executionAuthorityGranted: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw verificationError("EFFECTIVENESS_STATE_INVALID", "Effectiveness-verification state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw verificationError("EFFECTIVENESS_DECISION_INVALID", "Effectiveness-verification decision is not registered."); return result; }
function boundedNumber(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function verificationError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
