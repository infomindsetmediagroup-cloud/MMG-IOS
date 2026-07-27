export const KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_BUILD = "kairos-governance-lessons-institutionalization-20260727-1";

const STATES = new Set(["draft", "proposed", "in_adoption", "at_risk", "adopted", "certified", "closed"]);
const DECISIONS = new Set(["hold", "continue", "escalate", "adopt", "certify", "close"]);
const CHANGE_TYPES = new Set(["policy", "control", "training", "operating_standard", "documentation"]);
const ADOPTION_STATES = new Set(["pending", "in_progress", "complete", "blocked", "not_applicable"]);
const EVIDENCE_STATES = new Set(["pending", "current", "stale", "missing", "insufficient"]);

export function createKairosGovernanceLessonsInstitutionalization(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    institutionalizationId: clean(input.institutionalizationId || `kinstitution_${crypto.randomUUID()}`, 180),
    effectivenessVerificationId: clean(input.effectivenessVerificationId, 180) || null,
    remediationPlanId: clean(input.remediationPlanId, 180) || null,
    assurancePlanId: clean(input.assurancePlanId, 180) || null,
    portfolioId: clean(input.portfolioId, 180) || null,
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    title: clean(input.title || "Governance lessons institutionalization", 240),
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    lessons: normalizeLessons(input.lessons),
    changeProposals: normalizeChangeProposals(input.changeProposals),
    adoptionCommitments: normalizeAdoptionCommitments(input.adoptionCommitments),
    adoptionEvidence: normalizeAdoptionEvidence(input.adoptionEvidence),
    effectivenessReview: normalizeEffectivenessReview(input.effectivenessReview),
    escalation: normalizeEscalation(input.escalation),
    executiveCertification: normalizeCertification(input.executiveCertification),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticChangeExecutionAllowed: false,
    build: KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_BUILD,
  };
  if (!record.institutionalizationId.startsWith("kinstitution_")) throw institutionalizationError("INSTITUTIONALIZATION_ID_INVALID", "Institutionalization IDs must use the kinstitution_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosGovernanceLessonsInstitutionalization(record, input = {}) {
  const current = createKairosGovernanceLessonsInstitutionalization(record);
  const changeProposals = normalizeChangeProposals(input.changeProposals ?? current.changeProposals);
  const adoptionCommitments = normalizeAdoptionCommitments(input.adoptionCommitments ?? current.adoptionCommitments);
  const adoptionEvidence = normalizeAdoptionEvidence(input.adoptionEvidence ?? current.adoptionEvidence);
  const effectivenessReview = normalizeEffectivenessReview(input.effectivenessReview ?? current.effectivenessReview);
  const escalation = normalizeEscalation(input.escalation ?? current.escalation);
  const executiveCertification = normalizeCertification(input.executiveCertification ?? current.executiveCertification);
  const blockedRequiredCommitment = adoptionCommitments.some((item) => item.required && item.state === "blocked");
  const incompleteRequiredCommitment = adoptionCommitments.some((item) => item.required && item.state !== "complete");
  const evidenceGap = adoptionEvidence.some((item) => ["stale", "missing", "insufficient"].includes(item.evidenceState));
  const allChangesApproved = changeProposals.length > 0 && changeProposals.every((item) => item.approved === true);
  const adoptionComplete = adoptionCommitments.length > 0 && !incompleteRequiredCommitment;
  let state = normalizeState(input.state || current.state);
  let decision = "continue";
  if (executiveCertification.closed) { state = "closed"; decision = "close"; }
  else if (executiveCertification.certified && adoptionComplete && allChangesApproved && effectivenessReview.effective && !evidenceGap && !escalation.active) { state = "certified"; decision = "certify"; }
  else if (blockedRequiredCommitment || evidenceGap || escalation.active || effectivenessReview.regressionObserved) { state = "at_risk"; decision = "escalate"; }
  else if (adoptionComplete && allChangesApproved) { state = "adopted"; decision = "adopt"; }
  else if (state === "draft") decision = "hold";
  return Object.freeze({
    ...current,
    state,
    decision,
    lessons: normalizeLessons(input.lessons ?? current.lessons),
    changeProposals,
    adoptionCommitments,
    adoptionEvidence,
    effectivenessReview,
    escalation,
    executiveCertification,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticChangeExecutionAllowed: false,
  });
}

function normalizeLessons(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({ lessonId: clean(item.lessonId || `lesson_${crypto.randomUUID()}`, 180), summary: clean(item.summary, 1600) || null, sourceEvidenceIds: normalizeIds(item.sourceEvidenceIds, 100), ownerRole: clean(item.ownerRole, 160) || null, priority: clean(item.priority || "medium", 40) }))); }
function normalizeChangeProposals(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 200).map((item) => { const changeType = clean(item.changeType || "documentation", 40); if (!CHANGE_TYPES.has(changeType)) throw institutionalizationError("CHANGE_TYPE_INVALID", "Institutionalization change type is not registered."); return Object.freeze({ proposalId: clean(item.proposalId || `proposal_${crypto.randomUUID()}`, 180), changeType, targetReference: clean(item.targetReference, 240) || null, summary: clean(item.summary, 1600) || null, ownerRole: clean(item.ownerRole, 160) || null, dueAt: normalizeIso(item.dueAt), approved: item.approved === true, approvalIdentityHash: clean(item.approvalIdentityHash, 128) || null, executionAuthorityGranted: false }); })); }
function normalizeAdoptionCommitments(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 200).map((item) => { const state = clean(item.state || "pending", 40); if (!ADOPTION_STATES.has(state)) throw institutionalizationError("ADOPTION_STATE_INVALID", "Adoption state is not registered."); return Object.freeze({ commitmentId: clean(item.commitmentId || `commitment_${crypto.randomUUID()}`, 180), proposalId: clean(item.proposalId, 180) || null, ownerRole: clean(item.ownerRole, 160) || null, required: item.required !== false, state, dueAt: normalizeIso(item.dueAt), completedAt: normalizeIso(item.completedAt), evidenceIds: normalizeIds(item.evidenceIds, 100) }); })); }
function normalizeAdoptionEvidence(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 200).map((item) => { const evidenceState = clean(item.evidenceState || "pending", 40); if (!EVIDENCE_STATES.has(evidenceState)) throw institutionalizationError("ADOPTION_EVIDENCE_STATE_INVALID", "Adoption evidence state is not registered."); return Object.freeze({ evidenceId: clean(item.evidenceId || `evidence_${crypto.randomUUID()}`, 180), proposalId: clean(item.proposalId, 180) || null, evidenceState, measuredAt: normalizeIso(item.measuredAt), sourceReference: clean(item.sourceReference, 400) || null, summary: clean(item.summary, 1200) || null }); })); }
function normalizeEffectivenessReview(value = {}) { return Object.freeze({ reviewedAt: normalizeIso(value.reviewedAt), effective: value.effective === true, regressionObserved: value.regressionObserved === true, evidenceIds: normalizeIds(value.evidenceIds, 100), rationale: clean(value.rationale, 2000) || null }); }
function normalizeEscalation(value = {}) { return Object.freeze({ active: value.active === true, severity: clean(value.severity || "medium", 40), escalatedAt: normalizeIso(value.escalatedAt), ownerRole: clean(value.ownerRole, 160) || null, rationale: clean(value.rationale, 1600) || null, executionAuthorityGranted: false }); }
function normalizeCertification(value = {}) { return Object.freeze({ certified: value.certified === true, certifiedAt: normalizeIso(value.certifiedAt), closed: value.closed === true, closedAt: normalizeIso(value.closedAt), identityHash: clean(value.identityHash, 128) || null, rationale: clean(value.rationale, 1600) || null, executionAuthorityGranted: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw institutionalizationError("INSTITUTIONALIZATION_STATE_INVALID", "Institutionalization state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw institutionalizationError("INSTITUTIONALIZATION_DECISION_INVALID", "Institutionalization decision is not registered."); return result; }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function institutionalizationError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
