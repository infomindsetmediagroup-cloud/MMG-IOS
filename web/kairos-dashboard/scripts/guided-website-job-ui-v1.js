const BUILD = "kairos-kernel-20260712-11";
let activePlan = readSession("kairos.stagingThemePlan");
let running = false;

queueMicrotask(() => {
  installGuidedJob();
  suppressInternalControls();
  const observer = new MutationObserver(() => suppressInternalControls());
  observer.observe(document.querySelector("#reset-dashboard"), { childList: true, subtree: true });
});

function installGuidedJob() {
  if (document.querySelector("#guided-website-job")) return;
  const executionPanel = document.querySelector("#execution-panel");
  if (!executionPanel) return;

  const panel = document.createElement("section");
  panel.id = "guided-website-job";
  panel.className = "reset-panel guided-job-panel";
  panel.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Guided Website Job</p>
        <h2>Tell Kairos what to change</h2>
      </div>
      <span id="guided-job-status" class="status-pill limited">Ready</span>
    </div>
    <p class="lead compact">Kairos will validate prerequisites, inspect the non-live staging source, prepare one clear plan for approval, then execute and verify automatically after approval.</p>
    <label class="objective-label" for="guided-job-objective">Website objective</label>
    <textarea id="guided-job-objective" rows="6" maxlength="2000" placeholder="Example: Improve the homepage hierarchy so visitors immediately understand MMG's books, AI, business, and creator education ecosystem while preserving the approved premium black-and-blue design."></textarea>
    <div class="approval-actions">
      <button id="start-guided-job" class="capability-action" type="button">Start Website Job</button>
    </div>
    <div id="guided-job-progress" class="approval-state" hidden></div>`;

  executionPanel.parentNode.insertBefore(panel, executionPanel);
  panel.querySelector("#start-guided-job").addEventListener("click", startJob);
}

function suppressInternalControls() {
  const internalActions = new Set([
    "validate-shopify",
    "inspect-staging-readiness",
    "prepare-staging-proposal",
    "create-approved-staging",
    "submit-staging-creation",
    "verify-staging-theme",
    "inspect-staging-source",
    "generate-staging-plan",
    "execute-approved-staging-plan",
  ]);

  for (const button of document.querySelectorAll("[data-action]")) {
    if (!internalActions.has(button.dataset.action)) continue;
    const row = button.closest(".ability-row");
    if (row) row.hidden = true;
  }
}

async function startJob() {
  if (running) return;
  const objective = document.querySelector("#guided-job-objective")?.value.trim() || "";
  if (objective.length < 8) {
    setGuidedStatus("Needs Input", "blocked");
    showProgress("Enter a specific website objective before starting the job.", true);
    return;
  }

  running = true;
  activePlan = null;
  sessionStorage.removeItem("kairos.stagingThemePlan");
  sessionStorage.removeItem("kairos.stagingThemePlanApproval");
  setGuidedStatus("Preparing Plan", "limited");
  showProgress("Kairos is validating Shopify, confirming the non-live staging theme, reading the current source, verifying hashes, and preparing one bounded plan for your approval.");
  setStartDisabled(true, "Preparing…");

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

    activePlan = body;
    sessionStorage.setItem("kairos.stagingThemePlan", JSON.stringify(body));
    renderApproval(body);
  } catch (error) {
    setGuidedStatus("Needs Attention", "blocked");
    showProgress(error instanceof Error ? error.message : "Kairos could not prepare the website plan.", true);
    setStartDisabled(false, "Start Website Job");
  } finally {
    running = false;
  }
}

function renderApproval(body) {
  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");
  const plan = body?.plan || {};
  const changes = Array.isArray(plan.changes) ? plan.changes.filter(change => change.changeType !== "no-change") : [];

  panel.hidden = false;
  title.textContent = "Review website job";
  status.textContent = "Approval Required";
  status.className = "status-pill limited";
  setGuidedStatus("Approval Required", "limited");

  const changeCards = changes.map(change => `
    <article class="evidence-card">
      <span>${escapeHTML(change.changeType || "modify")}</span>
      <strong>${escapeHTML(change.filename || "Unknown file")}</strong>
      <p>${escapeHTML(change.purpose || "")}</p>
      ${renderList(change.instructions)}
      <small>${escapeHTML(change.expectedOutcome || "")}</small>
    </article>`).join("");

  result.innerHTML = `
    <div class="plan-review">
      <div class="evidence-summary"><strong>${escapeHTML(body.summary || "Website plan prepared.")}</strong><span>${escapeHTML(body.completedAt || "")}</span></div>
      <div class="evidence-grid">
        <article class="evidence-card"><span>Objective</span><strong>Requested change</strong><p>${escapeHTML(body.objective || "")}</p></article>
        <article class="evidence-card"><span>Target</span><strong>${escapeHTML(plan.targetTheme?.name || "Kairos Staging")}</strong><p>${escapeHTML(plan.targetTheme?.role || "UNPUBLISHED")}</p><small>Live theme untouched</small></article>
        <article class="evidence-card"><span>Strategy</span><strong>Bounded staging change</strong><p>${escapeHTML(plan.strategy || "")}</p></article>
        <article class="evidence-card"><span>Files</span><strong>${escapeHTML(changes.length)}</strong><p>Only verified staging files may be changed.</p></article>
      </div>
      <h3>What Kairos will do</h3>
      <div class="evidence-grid">${changeCards || "<p>No modifications were proposed.</p>"}</div>
      <div class="plan-grid">
        <section><h3>Risks</h3>${renderList(plan.risks)}</section>
        <section><h3>Acceptance criteria</h3>${renderList(plan.acceptanceCriteria)}</section>
        <section><h3>Rollback</h3>${renderList(plan.rollbackPlan)}</section>
      </div>
      <div class="approval-state"><strong>Executive approval required.</strong><span>Approve to execute automatically against Kairos Staging, verify the result, and return completion evidence.</span></div>
      <div class="approval-actions">
        <button id="reject-guided-job" class="secondary-action" type="button">Reject</button>
        <button id="approve-guided-job" class="capability-action" type="button">Approve and Execute</button>
      </div>
      <details class="evidence-details"><summary>View full plan evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>
    </div>`;

  result.querySelector("#reject-guided-job").addEventListener("click", rejectJob);
  result.querySelector("#approve-guided-job").addEventListener("click", approveAndExecute);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function rejectJob() {
  sessionStorage.removeItem("kairos.stagingThemePlanApproval");
  setGuidedStatus("Rejected", "blocked");
  const status = document.querySelector("#execution-status");
  status.textContent = "Rejected";
  status.className = "status-pill blocked";
  const result = document.querySelector("#execution-result");
  result.innerHTML = '<div class="approval-state"><strong>Website job rejected.</strong><span>No Shopify write authority was granted and no files were changed.</span></div>';
  setStartDisabled(false, "Start Website Job");
}

async function approveAndExecute(event) {
  if (running || !activePlan) return;
  running = true;
  const button = event.currentTarget;
  const approval = {
    status: "approved",
    approvedAt: new Date().toISOString(),
    build: BUILD,
    planID: activePlan.planID,
    actionID: activePlan.actionID,
    targetThemeID: activePlan?.plan?.targetTheme?.gid || "",
    sourceHashes: activePlan?.plan?.sourceHashes || {},
    objective: activePlan.objective || "",
  };
  sessionStorage.setItem("kairos.stagingThemePlanApproval", JSON.stringify(approval));

  button.disabled = true;
  button.textContent = "Executing…";
  setGuidedStatus("Executing", "limited");
  const status = document.querySelector("#execution-status");
  const title = document.querySelector("#execution-title");
  const result = document.querySelector("#execution-result");
  title.textContent = "Executing approved website job";
  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Kairos is verifying approved hashes, generating exact file bodies, writing only to Kairos Staging, reading the files back, and validating the result.</p>';

  try {
    const response = await fetch("/api/shopify/staging/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      credentials: "include",
      body: JSON.stringify({ plan: activePlan, approval }),
    });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Execution returned HTTP ${response.status}.`);

    sessionStorage.setItem("kairos.stagingExecutionEvidence", JSON.stringify(body));
    setGuidedStatus("Completed", "available");
    status.textContent = "Completed";
    status.className = "status-pill available";
    title.textContent = "Website job completed";
    result.innerHTML = renderCompletion(body);
    showProgress("Completed. Kairos executed the approved staging job and verified the result.");
    setStartDisabled(false, "Start Another Website Job");
  } catch (error) {
    setGuidedStatus("Needs Attention", "blocked");
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Website job execution failed.")}</p>`;
    setStartDisabled(false, "Retry Website Job");
  } finally {
    running = false;
  }
}

function renderCompletion(body) {
  const execution = body?.execution || {};
  const files = Array.isArray(execution.filesWritten) ? execution.filesWritten : [];
  const verification = Array.isArray(body?.verification) ? body.verification : [];
  const fileCards = files.map(file => `
    <article class="evidence-card">
      <span>Verified change</span>
      <strong>${escapeHTML(file.filename || "Unknown file")}</strong>
      <p>${escapeHTML(file.beforeSha256 || "").slice(0, 12)}… → ${escapeHTML(file.afterSha256 || "").slice(0, 12)}…</p>
      <small>${escapeHTML(file.beforeBytes ?? 0)} bytes → ${escapeHTML(file.afterBytes ?? 0)} bytes</small>
    </article>`).join("");
  return `
    <div class="evidence-summary"><strong>${escapeHTML(body.summary || "Approved website job executed and verified.")}</strong><span>${escapeHTML(body.completedAt || "")}</span></div>
    <div class="evidence-grid">
      <article class="evidence-card"><span>Target</span><strong>${escapeHTML(execution.targetTheme?.name || "Kairos Staging")}</strong><p>${escapeHTML(execution.targetTheme?.role || "UNPUBLISHED")}</p></article>
      <article class="evidence-card"><span>Live theme</span><strong>${escapeHTML(execution.publishedTheme?.name || "Rise")}</strong><p>Changed: ${escapeHTML(String(Boolean(execution.publishedThemeChanged)))}</p></article>
      <article class="evidence-card"><span>Files changed</span><strong>${escapeHTML(files.length)}</strong><p>All writes were staging-only.</p></article>
      <article class="evidence-card"><span>Verification</span><strong>${verification.every(item => item.matched) ? "Passed" : "Needs review"}</strong><p>Read-back hashes checked.</p></article>
    </div>
    <h3>Completed actions</h3>
    <div class="evidence-grid">${fileCards || "<p>No file evidence returned.</p>"}</div>
    <div class="execution-lock"><strong>Execution verified.</strong><p>The live Rise theme remained unchanged. Rollback evidence is preserved in the complete execution record.</p></div>
    <details class="evidence-details"><summary>Inspect complete execution and rollback evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>`;
}

function setGuidedStatus(text, tone) {
  const status = document.querySelector("#guided-job-status");
  if (!status) return;
  status.textContent = text;
  status.className = `status-pill ${tone}`;
}

function showProgress(message, isError = false) {
  const progress = document.querySelector("#guided-job-progress");
  if (!progress) return;
  progress.hidden = false;
  progress.className = isError ? "execution-error" : "approval-state";
  progress.innerHTML = `<strong>${escapeHTML(message)}</strong>`;
}

function setStartDisabled(disabled, label) {
  const button = document.querySelector("#start-guided-job");
  if (!button) return;
  button.disabled = disabled;
  button.textContent = label;
}

function renderList(values) {
  return Array.isArray(values) && values.length
    ? `<ul>${values.map(value => `<li>${escapeHTML(String(value))}</li>`).join("")}</ul>`
    : "<p>None.</p>";
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
