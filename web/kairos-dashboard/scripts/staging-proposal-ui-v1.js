const BUILD = "kairos-kernel-20260712-4";
let stagingProposal = null;

queueMicrotask(() => {
  const cards = [...document.querySelectorAll(".parent-card")];
  const shopifyCard = cards.find(card => card.textContent.includes("Shopify & Website"));
  const list = shopifyCard?.querySelector(".ability-list");
  if (!list || list.querySelector('[data-action="prepare-staging-proposal"]')) return;

  const row = document.createElement("section");
  row.className = "ability-row";
  row.innerHTML = `<div><strong>Prepare staging-theme proposal</strong><p>Bind the published Rise theme to Shopify's live themeDuplicate contract and prepare an approval-ready non-live staging plan. No write is performed.</p></div><button class="capability-action" type="button" data-action="prepare-staging-proposal">Prepare Staging Proposal</button>`;
  list.insertBefore(row, list.children[3] || null);
});

document.addEventListener("click", async event => {
  const prepare = event.target.closest('[data-action="prepare-staging-proposal"]');
  if (prepare && !prepare.disabled) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await prepareProposal(prepare);
    return;
  }

  const approve = event.target.closest('[data-action="approve-staging-proposal"]');
  if (approve && stagingProposal) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const approval = {
      status: "approved",
      approvedAt: new Date().toISOString(),
      proposalID: stagingProposal.proposalID,
      build: BUILD,
      operation: stagingProposal?.proposal?.operation || "themeDuplicate",
      sourceThemeID: stagingProposal?.proposal?.sourceTheme?.gid || "",
      targetThemeName: stagingProposal?.proposal?.targetThemeName || "Kairos Staging",
    };
    sessionStorage.setItem("kairos.stagingProposalApproval", JSON.stringify(approval));
    const state = document.querySelector("#staging-proposal-approval-state");
    if (state) state.innerHTML = `<strong>Staging proposal approved.</strong><span>${escapeHTML(approval.approvedAt)}</span>`;
    const status = document.querySelector("#execution-status");
    status.textContent = "Approved";
    status.className = "status-pill available";
    approve.disabled = true;
    approve.textContent = "Approved";
    return;
  }

  const reject = event.target.closest('[data-action="reject-staging-proposal"]');
  if (reject) {
    event.preventDefault();
    event.stopImmediatePropagation();
    sessionStorage.removeItem("kairos.stagingProposalApproval");
    const state = document.querySelector("#staging-proposal-approval-state");
    if (state) state.innerHTML = "<strong>Staging proposal rejected.</strong><span>No Shopify write authority was granted.</span>";
    const status = document.querySelector("#execution-status");
    status.textContent = "Rejected";
    status.className = "status-pill blocked";
  }
}, true);

async function prepareProposal(button) {
  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");

  panel.hidden = false;
  title.textContent = "Prepare staging-theme proposal";
  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Reading the live Shopify schema and published theme to prepare a source-grounded staging proposal. No write is being performed.</p>';
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Preparing…";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const response = await fetch("/api/shopify/staging/proposal", {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
    });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Proposal returned HTTP ${response.status}.`);
    stagingProposal = body;
    sessionStorage.setItem("kairos.stagingProposal", JSON.stringify(body));
    status.textContent = "Ready for Approval";
    status.className = "status-pill limited";
    result.innerHTML = renderProposal(body);
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Staging proposal failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function renderProposal(body) {
  const proposal = body?.proposal || {};
  const operation = proposal?.mutationContract || {};
  const args = Array.isArray(operation.arguments) ? operation.arguments : [];
  const list = values => Array.isArray(values) && values.length
    ? `<ul>${values.map(value => `<li>${escapeHTML(String(value))}</li>`).join("")}</ul>`
    : "<p>None returned.</p>";

  return `<div class="plan-review">
    <div class="evidence-summary"><strong>${escapeHTML(body.summary || "Staging proposal prepared.")}</strong><span>Read-only proposal · ${escapeHTML(body.completedAt || "")}</span></div>
    <div class="evidence-grid">
      <article class="evidence-card"><span>Source theme</span><strong>${escapeHTML(proposal.sourceTheme?.name || "Not found")}</strong><p>${escapeHTML(proposal.sourceTheme?.role || "—")}</p><small>${escapeHTML(proposal.sourceTheme?.id || "No theme ID")}</small></article>
      <article class="evidence-card"><span>Target theme</span><strong>${escapeHTML(proposal.targetThemeName || "Kairos Staging")}</strong><p>Non-live staging target</p><small>No publish authority</small></article>
      <article class="evidence-card"><span>Operation</span><strong>${escapeHTML(proposal.operation || "themeDuplicate")}</strong><p>${escapeHTML(operation.description || "Duplicate the current theme.")}</p><small>${escapeHTML(operation.deprecated ? "Deprecated" : "Current schema operation")}</small></article>
      <article class="evidence-card"><span>Mutation arguments</span><strong>${escapeHTML(args.length)}</strong><p>${escapeHTML(args.length ? args.map(arg => `${arg.name}: ${arg.type}`).join(", ") : "No arguments returned.")}</p></article>
    </div>
    <div class="plan-grid">
      <section><h3>Scope</h3><p>${escapeHTML(proposal.scope || "")}</p></section>
      <section><h3>Expected result</h3><p>${escapeHTML(proposal.expectedResult || "")}</p></section>
      <section><h3>Risks</h3>${list(proposal.risks)}</section>
      <section><h3>Verification</h3>${list(proposal.verification)}</section>
      <section><h3>Rollback</h3>${list(proposal.rollback)}</section>
      <section><h3>Contract</h3><p>${escapeHTML(args.map(arg => `${arg.name}: ${arg.type}`).join(" · "))}</p></section>
    </div>
    <div id="staging-proposal-approval-state" class="approval-state"><strong>Awaiting executive approval.</strong><span>Approval authorizes only the future creation of one non-live Kairos Staging theme. It does not authorize publishing or live-theme modification.</span></div>
    <div class="approval-actions">
      <button class="secondary-action" type="button" data-action="reject-staging-proposal">Reject</button>
      <button class="capability-action" type="button" data-action="approve-staging-proposal">Approve Staging Proposal</button>
    </div>
    <details class="evidence-details"><summary>View full staging proposal evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>
  </div>`;
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { summary: text }; }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]);
}
