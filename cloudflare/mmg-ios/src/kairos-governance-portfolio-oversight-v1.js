export const KAIROS_GOVERNANCE_PORTFOLIO_OVERSIGHT_BUILD = "kairos-governance-portfolio-oversight-20260727-1";

const STATES = new Set(["draft", "review", "attested", "at_risk", "closed"]);
const DECISIONS = new Set(["hold", "continue", "attest", "escalate", "close"]);
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);

export function createKairosGovernancePortfolio(input = {}) {
  const now = normalizeIso(input.createdAt) || new Date().toISOString();
  const record = {
    portfolioId: clean(input.portfolioId || `kportfolio_${crypto.randomUUID()}`, 180),
    environment: clean(input.environment || "production", 80),
    commitSha: clean(input.commitSha, 80) || null,
    state: normalizeState(input.state || "draft"),
    decision: normalizeDecision(input.decision || "hold"),
    reportingWindow: normalizeWindow(input.reportingWindow),
    summary: normalizeSummary(input.summary),
    riskConcentrations: normalizeRisks(input.riskConcentrations),
    controlHealth: normalizeControls(input.controlHealth),
    exceptionIds: normalizeIds(input.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds, 200),
    reviewIds: normalizeIds(input.reviewIds, 100),
    continuityIds: normalizeIds(input.continuityIds, 100),
    assuranceIds: normalizeIds(input.assuranceIds, 100),
    incidentIds: normalizeIds(input.incidentIds, 100),
    executiveDecision: normalizeExecutiveDecision(input.executiveDecision),
    operatorIdentityHash: clean(input.operatorIdentityHash, 128) || null,
    createdAt: now,
    updatedAt: normalizeIso(input.updatedAt) || now,
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
    build: KAIROS_GOVERNANCE_PORTFOLIO_OVERSIGHT_BUILD,
  };
  if (!record.portfolioId.startsWith("kportfolio_")) throw portfolioError("PORTFOLIO_ID_INVALID", "Governance portfolio IDs must use the kportfolio_ prefix.");
  return Object.freeze(record);
}

export function evaluateKairosGovernancePortfolio(record, input = {}) {
  const current = createKairosGovernancePortfolio(record);
  const summary = normalizeSummary(input.summary ?? current.summary);
  const riskConcentrations = normalizeRisks(input.riskConcentrations ?? current.riskConcentrations);
  const controlHealth = normalizeControls(input.controlHealth ?? current.controlHealth);
  const executiveDecision = normalizeExecutiveDecision(input.executiveDecision ?? current.executiveDecision);
  const criticalRisk = riskConcentrations.some((item) => item.level === "critical" && item.status !== "closed");
  const overdue = summary.overdueObligations > 0;
  const ineffective = controlHealth.some((item) => item.effectiveness === "ineffective");
  let state = normalizeState(input.state || current.state);
  let decision = "continue";
  if (executiveDecision.closed) { state = "closed"; decision = "close"; }
  else if (criticalRisk || overdue || ineffective) { state = "at_risk"; decision = "escalate"; }
  else if (executiveDecision.attested) { state = "attested"; decision = "attest"; }
  else if (state === "draft") decision = "hold";
  return Object.freeze({
    ...current,
    state,
    decision,
    reportingWindow: normalizeWindow(input.reportingWindow ?? current.reportingWindow),
    summary,
    riskConcentrations,
    controlHealth,
    exceptionIds: normalizeIds(input.exceptionIds ?? current.exceptionIds, 200),
    obligationIds: normalizeIds(input.obligationIds ?? current.obligationIds, 200),
    reviewIds: normalizeIds(input.reviewIds ?? current.reviewIds, 100),
    continuityIds: normalizeIds(input.continuityIds ?? current.continuityIds, 100),
    assuranceIds: normalizeIds(input.assuranceIds ?? current.assuranceIds, 100),
    incidentIds: normalizeIds(input.incidentIds ?? current.incidentIds, 100),
    executiveDecision,
    operatorIdentityHash: clean(input.operatorIdentityHash || current.operatorIdentityHash, 128) || null,
    updatedAt: normalizeIso(input.updatedAt) || new Date().toISOString(),
    deploymentExecutionAllowed: false,
    rollbackExecutionAllowed: false,
    automaticRemediationAllowed: false,
  });
}

function normalizeWindow(value = {}) { return Object.freeze({ startsAt: normalizeIso(value.startsAt), endsAt: normalizeIso(value.endsAt), cadence: clean(value.cadence || "monthly", 80) }); }
function normalizeSummary(value = {}) { return Object.freeze({ openExceptions: boundedNumber(value.openExceptions, 10000), overdueObligations: boundedNumber(value.overdueObligations, 10000), activeIncidents: boundedNumber(value.activeIncidents, 10000), atRiskControls: boundedNumber(value.atRiskControls, 10000), evidenceCoveragePercent: Math.min(Math.max(Number(value.evidenceCoveragePercent) || 0, 0), 100), bounded: true }); }
function normalizeRisks(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({ riskId: clean(item.riskId || `risk_${crypto.randomUUID()}`, 180), domain: clean(item.domain, 160) || null, level: normalizeRisk(item.level || "medium"), status: clean(item.status || "open", 40), summary: clean(item.summary, 800) || null, ownerRole: clean(item.ownerRole, 160) || null, evidenceIds: normalizeIds(item.evidenceIds, 50) }))); }
function normalizeControls(value) { return Object.freeze((Array.isArray(value) ? value : []).slice(0, 100).map((item) => Object.freeze({ controlReference: clean(item.controlReference, 300) || null, ownerRole: clean(item.ownerRole, 160) || null, effectiveness: clean(item.effectiveness || "unknown", 40), evidenceCurrent: item.evidenceCurrent === true, exceptionCount: boundedNumber(item.exceptionCount, 1000), obligationCount: boundedNumber(item.obligationCount, 1000) }))); }
function normalizeExecutiveDecision(value = {}) { return Object.freeze({ attested: value.attested === true, closed: value.closed === true, decidedAt: normalizeIso(value.decidedAt), identityHash: clean(value.identityHash, 128) || null, rationale: clean(value.rationale, 1600) || null, acceptedResidualRisk: clean(value.acceptedResidualRisk, 1200) || null, executionAuthorityGranted: false }); }
function normalizeIds(value, max) { return Object.freeze([...new Set((Array.isArray(value) ? value : []).map((item) => clean(item, 180)).filter(Boolean))].slice(0, max)); }
function normalizeState(value) { const result = clean(value, 40); if (!STATES.has(result)) throw portfolioError("PORTFOLIO_STATE_INVALID", "Governance portfolio state is not registered."); return result; }
function normalizeDecision(value) { const result = clean(value, 40); if (!DECISIONS.has(result)) throw portfolioError("PORTFOLIO_DECISION_INVALID", "Governance portfolio decision is not registered."); return result; }
function normalizeRisk(value) { const result = clean(value, 20); if (!RISK_LEVELS.has(result)) throw portfolioError("PORTFOLIO_RISK_INVALID", "Governance portfolio risk level is not registered."); return result; }
function boundedNumber(value, max) { return Math.min(Math.max(Number(value) || 0, 0), max); }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function portfolioError(code, message) { const error = new Error(message); error.code = code; error.status = 400; return error; }
