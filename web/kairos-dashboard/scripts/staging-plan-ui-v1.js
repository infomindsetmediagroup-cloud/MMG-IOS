const BUILD = "kairos-kernel-20260712-9";
let currentStagingPlan = readSession("kairos.stagingThemePlan");

queueMicrotask(() => {
  const cards = [...document.querySelectorAll(".parent-card")];
  const shopifyCard = cards.find(card => card.textContent.includes("Shopify & Website"));
  const list = shopifyCard?.querySelector(".ability-list");
  if (!list || list.querySelector('[data-action="generate-staging-plan"]')) return;

  const row = document.createElement("section");
  row.className = "ability-row staging-plan-control";
  row.innerHTML = `<div class="ability-control-copy"><strong>Generate source-grounded staging plan</strong><p>Describe the website change. Kairos will read the verified non-live source, bind the plan to exact files and hashes, and return it for approval. No write is performed.</p><label class="objective-label" for="staging-plan-objective">Website objective</label><textarea id="staging-plan-objective" rows="5" maxlength="2000" placeholder="Example: Improve the homepage hierarchy so visitors immediately understand MMG's books, AI, business, and creator education ecosystem, while preserving the approved premium black-and-blue design."></textarea></div><button class="capability-action" type="button" data-action="generate-staging-plan">Generate Staging Plan</button>`;
  list.appendChild(row);
});

document.addEventListener("click", async event => {
  const generate = event.target.closest('[data-action="generate-staging-plan"]');
  if (generate && !generate.disabled) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await generatePlan(generate);
    return;
  }

  const approve = event.target.closest('[data-action="approve-staging-plan"]');
  if (approve && currentStagingPlan) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const approval = {
      status: "approved",
      approvedAt: new Date().toISOString(),
      build: BUILD,
      planID: currentStagingPlan.planID,
      actionID: currentStagingPlan.actionID,
      targetThemeID: currentStagingPlan?.plan?.targetTheme?.gid || "",
      sourceHashes: currentStagingPlan?.plan?.sourceHashes || {},
      objective: currentStagingPlan.objective || "",
    };
    sessionStorage.setItem("kairos.stagingThemePlanApproval", JSON.stringify(approval));
    const state = document.querySelector("#staging-plan-approval-state");
    if (state) state.innerHTML = `<strong>Staging plan approved.</strong><span>${escapeHTML(approval.approvedAt)} · No write has occurred.</span>`;
    setExecutionStatus("Approved", "available");
    approve.disabled = true;
    approve.textContent = "Approved";
    return;
  }

  const reject = event.target.closest('[data-action="reject-staging-plan"]');
  if (reject) {
    event.preventDefault();
    event.stopImmediatePropagation();
    sessionStorage.removeItem("kairos.stagingThemePlanApproval");
    const state = document.querySelector("#staging-plan-approval-state");
    if (state) state.innerHTML = "<strong>Staging plan rejected.</strong><span>No Shopify write authority was granted.</span>";
    setExecutionStatus("Rejected", "blocked");
  }
}, true);

async function generatePlan(button) {
  const objective = document.querySelector("#staging-plan-objective")?.value.trim() || "";
  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");

  panel.hidden = false;
  title.textContent = "Generate source-grounded staging plan";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  if (objective.length < 8) {
    status.textContent = "Needs Input";
    status.className = "status-pill blocked";
    result.innerHTML = '<p class="execution-error">Enter a specific website objective before generating the plan.</p>';
    return;
  }

  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Reading the verified Kairos Staging files, binding their hashes, and generating a bounded implementation plan. No Shopify write is being performed.</p>';
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Generating…";

  try {
    const response = await fetch("/api/shopify/staging/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      credentials: "include",
      body: JSON.stringify({ objective }),
    });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Planning returned HTTP ${response.status}.`);

    currentStagingPlan = body;
    sessionStorage.setItem("kairos.stagingThemePlan", JSON.stringify(body));
    sessionStorage.removeItem("kairos.stagingThemePlanApproval");
    status.textContent = "Ready for Approval";
    status.className = "status-pill limited";
    result.innerHTML = renderPlan(body);
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Staging plan generation failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function renderPlan(body) {
  const plan = body?.plan || {};
  const changes = Array.isArray(plan.changes) ? plan.changes : [];
  const list = values => Array.isArray(values) && values.length
    ? `<ul>${values.map(value => `<li>${escapeHTML(String(value))}</li>`).join("")}</ul>`
    : "<p>None returned.</p>";

  const changeCards = changes.map(change => `<article class="evidence-card"><span>${escapeHTML(change.changeType || "modify")}</span><strong>${escapeHTML(change.filename || "Unknown file")}</strong><p>${escapeHTML(change.purpose || "")}</p>${list(change.instructions)}<small>${escapeHTML(change.expectedOutcome || "")}</small></article>`).join("");

  return `<div class="plan-review">
    <div class="evidence-summary"><strong>${escapeHTML(body.summary || "Source-grounded staging plan prepared.")}</strong><span>Read-only · ${escapeHTML(body.completedAt || "")}</span></div>
    <div class="evidence-grid">
      <article class="evidence-card"><span>Target theme</span><strong>${escapeHTML(plan.targetTheme?.name || "Kairos Staging")}</strong><p>${escapeHTML(plan.targetTheme?.role || "UNPUBLISHED")}</p><small>${escapeHTML(plan.targetTheme?.id || "No theme ID")}</small></article>
      <article class="evidence-card"><span>Published theme</span><strong>${escapeHTML(plan.publishedTheme?.name || "Rise")}</strong><p>${escapeHTML(plan.publishedTheme?.role || "MAIN")}</p><small>Live writes: not authorized</small></article>
      <article class="evidence-card"><span>Files supplied</span><strong>${escapeHTML(body?.evidence?.readableFileCount ?? 0)}</strong><p>Every target must match verified source evidence.</p></article>
      <article class="evidence-card"><span>Strategy</span><strong>Bounded staging change</strong><p>${escapeHTML(plan.strategy || "")}</p></article>
    </div>
    <h3>Proposed file changes</h3>
    <div class="evidence-grid">${changeCards || "<p>No file changes returned.</p>"}</div>
    <div class="plan-grid">
      <section><h3>Risks</h3>${list(plan.risks)}</section>
      <section><h3>Acceptance criteria</h3>${list(plan.acceptanceCriteria)}</section>
      <section><h3>Rollback</h3>${list(plan.rollbackPlan)}</section>
      <section><h3>Authority boundary</h3><p>No live-theme write or production publish is authorized. A later execution build must re-read and match every approved source hash before writing to Kairos Staging.</p></section>
    </div>
    <div id="staging-plan-approval-state" class="approval-state"><strong>Awaiting executive approval.</strong><span>Approval authorizes only a future, hash-verified write to the non-live Kairos Staging theme.</span></div>
    <div class="approval-actions">
      <button class="secondary-action" type="button" data-action="reject-staging-plan">Reject</button>
      <button class="capability-action" type="button" data-action="approve-staging-plan">Approve Staging Plan</button>
    </div>
    <details class="evidence-details"><summary>View complete source and plan evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>
  </div>`;
}

function setExecutionStatus(text, tone) {
  const status = document.querySelector("#execution-status");
  if (!status) return;
  status.textContent = text;
  status.className = `status-pill ${tone}`;
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { summary: text }; }
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
