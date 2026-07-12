import { getCommandCenterStore, nextRunnableWork, updateWorkItem } from "./executive-command-center-store.js";

const REVIEW_ID = "kairos-safe-proposal-review";

function targetElement(event) {
  return event.target instanceof Element ? event.target : event.target?.parentElement || null;
}

document.addEventListener("click", event => {
  try {
    const target = targetElement(event);
    if (!target) return;

    const direct = target.closest("[data-review-proposal]");
    if (direct) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openReview(direct.getAttribute("data-review-proposal"));
      return;
    }

    const centerButton = target.closest("[data-run-center]");
    if (!centerButton || !/review/i.test(centerButton.textContent || "")) return;
    const item = nextRunnableWork(centerButton.getAttribute("data-run-center"));
    if (item?.status !== "Proposal Ready") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openReview(item.id);
  } catch (error) {
    console.error("Safe proposal review click failed", error);
  }
}, true);

function openReview(id) {
  const item = getCommandCenterStore().work.find(entry => entry.id === id);
  if (!item?.proposal) return;

  closeReview();
  const proposal = item.proposal;
  const files = Array.isArray(proposal?.mutationPlan?.files) ? proposal.mutationPlan.files : [];
  const executable = files.length > 0 && files.every(file =>
    typeof file?.key === "string" &&
    typeof file?.value === "string" &&
    /^[a-f0-9]{64}$/i.test(String(file?.expectedSha256 || ""))
  );

  const overlay = document.createElement("div");
  overlay.id = REVIEW_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="kairos-safe-review-card">
      <p class="eyebrow">Executive Approval Package</p>
      <h2>${escapeHTML(item.title)}</h2>
      <p>${escapeHTML(bounded(proposal.summary || proposal.executiveSummary || proposal.message || "Kairos prepared this proposal for executive review.", 1000))}</p>
      ${renderList("Recommended changes", proposal.recommendedChanges || proposal.changes, 6)}
      ${renderList("Expected benefits", proposal.expectedBenefits || proposal.benefits, 5)}
      ${renderList("Risk and safeguards", proposal.risks || proposal.risk, 5)}
      ${renderList("Rollback plan", proposal.rollbackPlan || proposal.rollback, 5)}
      ${files.length ? `<section><h3>Files affected</h3><ul>${files.slice(0, 8).map(file => `<li>${escapeHTML(file.key)}${file.expectedSha256 ? ` · ${escapeHTML(String(file.expectedSha256).slice(0, 12))}…` : ""}</li>`).join("")}</ul></section>` : ""}
      <p class="muted">Full replacement source remains in protected runtime memory and is not rendered in this review.</p>
      ${executable ? "" : '<p class="execution-error">This proposal is missing its executable payload. Regenerate it in this browser session.</p>'}
      <div class="kairos-safe-review-actions">
        ${executable ? '<button class="action-button primary" data-safe-approve>Approve & Execute Changes</button>' : '<button class="action-button primary" data-safe-regenerate>Regenerate Proposal</button>'}
        <button class="action-button" data-safe-revise>Request Revision</button>
        <button class="action-button" data-safe-close>Close Review</button>
      </div>
    </div>`;

  overlay.style.cssText = "position:fixed;inset:0;z-index:20000;background:rgba(2,5,10,.97);overflow:auto;-webkit-overflow-scrolling:touch;padding:max(18px,env(safe-area-inset-top)) 16px max(28px,env(safe-area-inset-bottom));";
  const card = overlay.querySelector(".kairos-safe-review-card");
  card.style.cssText = "max-width:760px;margin:0 auto;background:#10151d;border:1px solid #24566c;border-radius:24px;padding:22px;color:#eef4fa;font-family:system-ui;overflow-wrap:anywhere;";
  overlay.querySelectorAll("section").forEach(node => node.style.marginTop = "20px");
  overlay.querySelectorAll("h3").forEach(node => node.style.cssText = "font-size:16px;color:#65d6ff;margin:0 0 8px;");
  overlay.querySelectorAll("ul").forEach(node => node.style.cssText = "padding-left:20px;display:grid;gap:8px;");
  overlay.querySelector(".kairos-safe-review-actions").style.cssText = "display:grid;gap:10px;margin-top:22px;";

  overlay.querySelector("[data-safe-close]").addEventListener("click", closeReview);
  overlay.querySelector("[data-safe-approve]")?.addEventListener("click", () => approve(item, proposal));
  overlay.querySelector("[data-safe-regenerate]")?.addEventListener("click", () => regenerate(item));
  overlay.querySelector("[data-safe-revise]").addEventListener("click", () => revise(item));
  overlay.addEventListener("click", event => { if (event.target === overlay) closeReview(); });

  document.body.appendChild(overlay);
  document.documentElement.style.overflow = "hidden";
}

function approve(item, proposal) {
  closeReview();
  updateWorkItem(item.id, { status: "Starting", progress: 10, error: "", updatedAt: "Executive approval recorded; executing governed changes" });
  window.dispatchEvent(new CustomEvent("kairos:execute-approved-action", { detail: {
    id: item.id,
    center: item.center,
    actionType: item.executionActionType || item.actionType,
    objective: item.objective,
    phase: "execute",
    requiresReview: Boolean(item.requiresReview),
    proposal,
    approval: { approved: true, actor: "Executive", approvedAt: new Date().toISOString() },
  } }));
}

function regenerate(item) {
  closeReview();
  updateWorkItem(item.id, { status: "Revision Requested", progress: 0, proposal: null, error: "", updatedAt: "Regenerating executable proposal" });
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("kairos:execute-approved-action", { detail: {
    id: item.id, center: item.center, actionType: item.actionType, objective: item.objective, phase: "prepare", requiresReview: true,
  } })));
}

function revise(item) {
  const note = window.prompt("What should Kairos revise in this proposal?");
  if (note === null) return;
  closeReview();
  updateWorkItem(item.id, { status: "Revision Requested", progress: 0, proposal: null, error: "", revisionNote: note.trim(), updatedAt: note.trim() ? `Revision requested: ${note.trim()}` : "Revision requested" });
}

function closeReview() {
  document.getElementById(REVIEW_ID)?.remove();
  document.documentElement.style.overflow = "";
}

function renderList(title, value, maximum) {
  const items = normalizeList(value).slice(0, maximum);
  if (!items.length) return "";
  return `<section><h3>${escapeHTML(title)}</h3><ul>${items.map(item => `<li>${escapeHTML(bounded(item, 320))}</li>`).join("")}</ul></section>`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item : item?.title || item?.key || "Proposal item");
  if (typeof value === "string") return value.split(/\n|•/).map(item => item.trim()).filter(Boolean);
  return [];
}

function bounded(value, maximum) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
