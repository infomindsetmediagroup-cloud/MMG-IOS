const LEGACY_ACTIONS = new Set([
  "prepare-staging-proposal",
  "approve-staging-proposal",
  "reject-staging-proposal",
  "create-approved-staging",
  "submit-approved-staging",
  "verify-approved-staging",
  "submit-staging-creation",
  "verify-staging-theme",
]);

const LEGACY_SESSION_KEYS = [
  "kairos.stagingProposal",
  "kairos.stagingProposalApproval",
  "kairos.stagingSubmissionEvidence",
];

queueMicrotask(cleanLegacyStagingFlow);

const observer = new MutationObserver(cleanLegacyStagingFlow);
const root = document.querySelector("#reset-dashboard");
if (root) observer.observe(root, { childList: true, subtree: true });

function cleanLegacyStagingFlow() {
  for (const button of document.querySelectorAll("[data-action]")) {
    if (!LEGACY_ACTIONS.has(button.dataset.action)) continue;
    const row = button.closest(".ability-row");
    if (row) row.remove();
    else button.remove();
  }

  try {
    for (const key of LEGACY_SESSION_KEYS) sessionStorage.removeItem(key);
  } catch {}
}
