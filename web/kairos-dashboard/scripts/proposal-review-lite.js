import { getCommandCenterStore, nextRunnableWork, updateWorkItem } from "./executive-command-center-store.js";

const overlayId = "kairos-lightweight-proposal-review";

document.addEventListener("click", event => {
  const reviewButton = event.target.closest("[data-review-proposal]");
  if (reviewButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openReview(reviewButton.dataset.reviewProposal);
    return;
  }

  const centerButton = event.target.closest("[data-run-center]");
  if (centerButton && /review/i.test(centerButton.textContent || "")) {
    const item = nextRunnableWork(centerButton.dataset.runCenter);
    if (item?.status === "Proposal Ready") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openReview(item.id);
    }
  }
}, true);

function openReview(id) {
  const item = getCommandCenterStore().work.find(entry => entry.id === id);
  if (!item?.proposal) return;
  closeReview();

  const proposal = item.proposal;
  const mutation = proposal.mutationPlan || null;
  const files = Array.isArray(mutation?.files) ? mutation.files : [];
  const summary = text(proposal.summary || proposal.executiveSummary || proposal.message || "Kairos prepared this governed proposal for executive review.", 900);
  const changes = list(proposal.recommendedChanges || proposal.changes || files.map(file => `Update ${file.key}`), 6);
  const risks = list(proposal.risks || proposal.risk || ["Execution remains bounded by the approved scope and rollback controls."], 4);
  const affected = files.length ? files.map(file => `${file.key}${file.expectedSha256 ? ` · source verified ${String(file.expectedSha256).slice(0, 12)}…` : ""}`) : list(proposal.affectedFiles || proposal.affectedAssets || proposal.scope, 8);

  const overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="kairos-lite-card">
      <p class="kairos-lite-eyebrow">EXECUTIVE APPROVAL PACKAGE</p>
      <h2>${escapeHTML(item.title)}</h2>
      <p class="kairos-lite-summary">${escapeHTML(summary)}</p>
      ${section("Recommended changes", changes)}
      ${section("Files and assets affected", affected)}
      ${section("Risk and safeguards", risks)}
      <p class="kairos-lite-note">Full source-file contents are intentionally excluded from this screen to keep mobile review responsive. Source hashes and the approved mutation remain preserved for execution and rollback.</p>
      <div class="kairos-lite-actions">
        <button data-lite-approve>Approve & Execute Changes</button>
        <button data-lite-close>Close Review</button>
      </div>
    </div>`;
  overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(2,5,10,.96);overflow:auto;padding:20px";
  const card = overlay.querySelector(".kairos-lite-card");
  card.style.cssText = "max-width:760px;margin:24px auto;background:#10151d;border:1px solid #24566c;border-radius:28px;padding:24px;color:#eef4fa;font-family:system-ui";
  overlay.querySelectorAll("button").forEach(button => button.style.cssText = "width:100%;margin-top:12px;padding:16px;border-radius:999px;border:1px solid #2d718e;background:#15394a;color:#fff;font-size:16px;font-weight:800");
  overlay.querySelector("[data-lite-approve]").style.background = "#20aee8";
  overlay.querySelector("[data-lite-approve]").style.color = "#031018";
  overlay.querySelector("[data-lite-close]").addEventListener("click", closeReview);
  overlay.querySelector("[data-lite-approve]").addEventListener("click", () => approve(item, overlay.querySelector("[data-lite-approve]")));
  document.body.appendChild(overlay);
}

function approve(item, button) {
  button.disabled = true;
  button.textContent = "Executing…";
  const proposal = item.proposal || {};
  const lightweightProposal = proposal.mutationPlan
    ? { mutationPlan: proposal.mutationPlan, summary: text(proposal.summary || proposal.executiveSummary || "Approved Shopify mutation", 600) }
    : { summary: text(proposal.summary || proposal.executiveSummary || proposal.message || "Approved proposal", 1200), recommendedChanges: list(proposal.recommendedChanges || proposal.changes, 6) };

  updateWorkItem(item.id, {
    status: "Starting",
    progress: 10,
    error: "",
    updatedAt: "Executive approval recorded; executing governed changes",
  });
  closeReview();
  window.dispatchEvent(new CustomEvent("kairos:execute-approved-action", {
    detail: {
      id: item.id,
      center: item.center,
      actionType: item.executionActionType || item.actionType,
      objective: item.objective,
      phase: "execute",
      requiresReview: Boolean(item.requiresReview),
      proposal: lightweightProposal,
      approval: { approved: true, actor: "Executive", approvedAt: new Date().toISOString() },
    },
  }));
}

function closeReview() {
  document.getElementById(overlayId)?.remove();
}

function list(value, maximum) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|•/).filter(Boolean) : [];
  return values.slice(0, maximum).map(entry => text(typeof entry === "string" ? entry : entry?.key || entry?.title || "Approved item", 240));
}

function section(title, items) {
  if (!items?.length) return "";
  return `<section><h3>${escapeHTML(title)}</h3><ul>${items.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>`;
}

function text(value, maximum) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
