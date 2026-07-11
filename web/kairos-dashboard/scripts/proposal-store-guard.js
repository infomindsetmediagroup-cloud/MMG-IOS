const STORE_KEY = "kairos.executive.command-center.v4";
const MAX_PERSISTED_STORE_BYTES = 180000;

window.__kairosFullProposals = window.__kairosFullProposals || new Map();

try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw && raw.length > MAX_PERSISTED_STORE_BYTES) {
    localStorage.removeItem(STORE_KEY);
    sessionStorage.setItem("kairos.proposal.reset.reason", "oversized-proposal");
  }
} catch {
  // Storage access failures are handled by the dashboard's normal fallback path.
}

window.addEventListener("kairos:approved-action-status", event => {
  const detail = event.detail || {};
  const proposalReady = detail.status === "Proposal Ready" || (detail.phase === "prepare" && detail.status === "Completed");
  if (!proposalReady || !detail.id || !detail.result || typeof detail.result !== "object") return;

  window.__kairosFullProposals.set(detail.id, detail.result);
  detail.result = compactProposal(detail.result);
}, true);

export function fullProposalFor(id, fallback = null) {
  return window.__kairosFullProposals?.get(id) || fallback;
}

export function compactProposal(proposal) {
  const mutation = proposal?.mutationPlan;
  const files = Array.isArray(mutation?.files)
    ? mutation.files.map(file => ({
        key: file?.key,
        expectedSha256: file?.expectedSha256,
        bytes: typeof file?.value === "string" ? new Blob([file.value]).size : undefined,
      }))
    : [];

  return {
    summary: bounded(proposal?.summary || proposal?.executiveSummary || proposal?.message, 1200),
    recommendedChanges: boundedList(proposal?.recommendedChanges || proposal?.changes, 8),
    expectedBenefits: boundedList(proposal?.expectedBenefits || proposal?.benefits, 5),
    risks: boundedList(proposal?.risks || proposal?.risk, 5),
    rollbackPlan: boundedList(proposal?.rollbackPlan || proposal?.rollback, 5),
    mutationPlan: mutation ? { themeId: mutation.themeId, files, compact: true } : undefined,
    sourceEvidence: proposal?.sourceEvidence ? {
      themeId: proposal.sourceEvidence.themeId,
      themeName: proposal.sourceEvidence.themeName,
      role: proposal.sourceEvidence.role,
      files: Array.isArray(proposal.sourceEvidence.files) ? proposal.sourceEvidence.files.slice(0, 12) : [],
    } : undefined,
    actionID: proposal?.actionID,
    auditId: proposal?.auditId,
    requestId: proposal?.requestId,
  };
}

function bounded(value, maximum) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

function boundedList(value, maximum) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.slice(0, maximum).map(item => bounded(typeof item === "string" ? item : item?.title || item?.key || JSON.stringify(item), 260));
}
