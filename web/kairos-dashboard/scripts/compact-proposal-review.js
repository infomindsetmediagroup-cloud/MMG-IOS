import { getCommandCenterStore, nextRunnableWork, updateWorkItem } from "./executive-command-center-store.js";

const OVERLAY_ID = "kairos-compact-proposal-review";

// Capture review actions before the dashboard expands the complete proposal into the DOM.
document.addEventListener("click", event => {
  const direct = event.target.closest("[data-review-proposal]");
  if (direct) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openReview(direct.dataset.reviewProposal);
    return;
  }

  const center = event.target.closest("[data-run-center]");
  if (center && /review/i.test(center.textContent || "")) {
    const item = nextRunnableWork(center.dataset.runCenter);
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
  const mutation = proposal?.mutationPlan;
  const files = Array.isArray(mutation?.files) ? mutation.files : [];
  const executable = Boolean(
    mutation &&
    !mutation.compact &&
    files.length &&
    files.every(file => typeof file?.key === "string" && typeof file?.value === "string" && /^[a-f0-9]{64}$/i.test(file?.expectedSha256 || ""))
  );

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "kairos-review-title");
  overlay.innerHTML = `
    <div class="kairos-compact-review-card">
      <p class="eyebrow">Executive Approval Package</p>
      <h2 id="kairos-review-title">${escapeHTML(item.title)}</h2>
      <p class="kairos-review-summary">${escapeHTML(text(proposal.summary || proposal.executiveSummary || proposal.message || "Kairos prepared this governed proposal for executive review.", 1200))}</p>
      ${section("Recommended changes", proposal.recommendedChanges || proposal.changes, 6)}
      ${section("Expected benefits", proposal.expectedBenefits || proposal.benefits, 5)}
      ${section("Risk and safeguards", proposal.risks || proposal.risk, 5)}
      ${section("Rollback plan", proposal.rollbackPlan || proposal.rollback, 5)}
      ${files.length ? `<section><h3>Files and assets affected</h3><ul>${files.slice(0, 8).map(file => `<li>${escapeHTML(file.key)}${file.expectedSha256 ? ` · source ${escapeHTML(String(file.expectedSha256).slice(0, 12))}…` : ""}</li>`).join("")}</ul></section>` : ""}
      <p class="kairos-review-note">Complete replacement contents remain secured in runtime memory and are not rendered on this mobile review screen.</p>
      ${executable ? "" : '<p class="kairos-review-warning">The executable proposal payload is unavailable in this browser session. Regenerate the proposal before approval.</p>'}
      <div class="kairos-review-actions">
        ${executable ? '<button class="action-button primary" data-compact-approve>Approve & Execute Changes</button>' : '<button class="action-button primary" data-compact-regenerate>Regenerate Proposal</button>'}
        <button class="action-button" data-compact-revise>Request Revision</button>
        <button class="action-button" data-compact-close>Close Review</button>
      </div>
    </div>`;

  overlay.style.cssText = "position:fixed;inset:0;z-index:12000;background:rgba(2,5,10,.97);overflow:auto;-webkit-overflow-scrolling:touch;padding:max(20px,env(safe-area-inset-top)) 18px max(28px,env(safe-area-inset-bottom));";
  const card = overlay.querySelector(".kairos-compact-review-card");
  card.style.cssText = "max-width:760px;margin:0 auto;background:#10151d;border:1px solid #24566c;border-radius:28px;padding:24px;color:#eef4fa;font-family:system-ui;overflow-wrap:anywhere;";
  overlay.querySelectorAll("section").forEach(sectionNode => sectionNode.style.cssText = "margin-top:22px;");
  overlay.querySelectorAll("h3").forEach(heading => heading.style.cssText = "font-size:16px;margin:0 0 10px;color:#65d6ff;");
  overlay.querySelectorAll("ul").forEach(list => list.style.cssText = "padding-left:20px;margin:0;display:grid;gap:8px;");
  overlay.querySelector(".kairos-review-actions").style.cssText = "display:grid;gap:12px;margin-top:24px;";

  overlay.querySelector("[data-compact-close]").addEventListener("click", closeReview);
  overlay.querySelector("[data-compact-approve]")?.addEventListener("click", buttonEvent => approve(item, proposal, buttonEvent.currentTarget));
  overlay.querySelector("[data-compact-regenerate]")?.addEventListener("click", () => regenerate(item));
  overlay.querySelector("[data-compact-revise]").addEventListener("click", () => requestRevision(item));
  overlay.addEventListener("click", event => { if (event.target === overlay) closeReview(); });
  document.body.appendChild(overlay);
  document.documentElement.style.overflow = "hidden";
}

function approve(item, proposal, button) {
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
    status: "Revision Requested",
    progress: 0,
    proposal: null,
    error: "",
    updatedAt: "Executable proposal payload unavailable; regeneration required",
  });
  closeReview();
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent("kairos:execute-approved-action", {
      detail: {
        id: item.id,
        center: item.center,
        actionType: item.actionType,
        objective: item.objective,
        phase: "prepare",
        requiresReview: true,
      },
    }));
  });
}

function requestRevision(item) {
  const note = window.prompt("What should Kairos revise in this proposal?");
  if (note === null) return;
  updateWorkItem(item.id, {
    status: "Revision Requested",
    progress: 0,
    proposal: null,
    error: "",
    revisionNote: note.trim(),
    updatedAt: note.trim() ? `Revision requested: ${note.trim()}` : "Revision requested",
  });
  closeReview();
}

function closeReview() {
  document.getElementById(OVERLAY_ID)?.remove();
  document.documentElement.style.overflow = "";
}

function section(title, value, maximum) {
  const items = normalizeList(value).slice(0, maximum);
  if (!items.length) return "";
  return `<section><h3>${escapeHTML(title)}</h3><ul>${items.map(item => `<li>${escapeHTML(text(item, 320))}</li>`).join("")}</ul></section>`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item : item?.title || item?.key || JSON.stringify(item));
  if (typeof value === "string") return value.split(/\n|•/).map(item => item.trim()).filter(Boolean);
  return value ? [String(value)] : [];
}

function text(value, maximum) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
