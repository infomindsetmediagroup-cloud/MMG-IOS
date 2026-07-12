import { getCommandCenterStore, nextRunnableWork, updateWorkItem } from "./executive-command-center-store.js";
import { fullProposalFor } from "./proposal-store-guard.js";

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

  const persistedProposal = item.proposal;
  const proposal = fullProposalFor(id, persistedProposal);
  const mutation = proposal?.mutationPlan || null;
  const files = Array.isArray(mutation?.files) ? mutation.files : [];
  const hasExecutablePayload = mutation
    ? !mutation.compact && files.length > 0 && files.every(file =>
        typeof file?.key === "string" && file.key &&
        typeof file?.value === "string" && file.value.length > 0 &&
        typeof file?.expectedSha256 === "string" && file.expectedSha256.length >= 32
      )
    : true;
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
      <p class="kairos-lite-note">Full source-file contents are intentionally excluded from this screen to keep mobile review responsive. Source hashes and rollback controls remain preserved.</p>
      ${hasExecutablePayload ? "" : '<p class="kairos-lite-warning">This saved proposal no longer contains the complete executable mutation payload. Regenerate it once to restore the current Shopify source and file contents.</p>'}
      <div class="kairos-lite-actions">
        ${hasExecutablePayload ? '<button type="button" data-lite-approve>Approve & Execute Changes</button>' : '<button type="button" data-lite-regenerate>Regenerate Proposal Now</button>'}
        <button type="button" data-lite-close>Close Review</button>
      </div>
    </div>`;
  overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(2,5,10,.96);overflow:auto;padding:20px";
  const card = overlay.querySelector(".kairos-lite-card");
  card.style.cssText = "max-width:760px;margin:24px auto;background:#10151d;border:1px solid #24566c;border-radius:28px;padding:24px;color:#eef4fa;font-family:system-ui";
  overlay.querySelectorAll("button").forEach(button => button.style.cssText = "width:100%;margin-top:12px;padding:16px;border-radius:999px;border:1px solid #2d718e;background:#15394a;color:#fff;font-size:16px;font-weight:800");
  const primary = overlay.querySelector("[data-lite-approve],[data-lite-regenerate]");
  if (primary) {
    primary.style.background = "#20aee8";
    primary.style.color = "#031018";
  }
  overlay.querySelector("[data-lite-close]").addEventListener("click", closeReview);
  overlay.querySelector("[data-lite-approve]")?.addEventListener("click", () => approve(item, proposal, overlay.querySelector("[data-lite-approve]")));
  overlay.querySelector("[data-lite-regenerate]")?.addEventListener("click", () => regenerate(item));
  document.body.appendChild(overlay);
}

function approve(item, proposal, button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = "Executing…";
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
      proposal,
      approval: { approved: true, actor: "Executive", approvedAt: new Date().toISOString() },
    },
  }));
}

function regenerate(item) {
  updateWorkItem(item.id, {
    status: "Starting",
    progress: 10,
    proposal: null,
    error: "",
    updatedAt: "Regenerating current governed proposal",
  });
  closeReview();
  window.dispatchEvent(new CustomEvent("kairos:execute-approved-action", {
    detail: {
      id: item.id,
      center: item.center,
      actionType: item.actionType,
      objective: item.objective,
      phase: "prepare",
      requiresReview: Boolean(item.requiresReview),
      proposal: null,
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
