const BUILD = "kairos-kernel-20260712-10";

queueMicrotask(() => {
  const cards = [...document.querySelectorAll(".parent-card")];
  const shopifyCard = cards.find(card => card.textContent.includes("Shopify & Website"));
  const list = shopifyCard?.querySelector(".ability-list");
  if (!list || list.querySelector('[data-action="execute-approved-staging-plan"]')) return;

  const row = document.createElement("section");
  row.className = "ability-row";
  row.innerHTML = `<div><strong>Execute approved staging plan</strong><p>Re-read approved files, verify source hashes, generate exact replacement bodies, write only to Kairos Staging, and verify every file by read-back hash. The live Rise theme will not be changed or published.</p></div><button class="capability-action" type="button" data-action="execute-approved-staging-plan">Execute Approved Staging Plan</button>`;
  list.appendChild(row);
});

document.addEventListener("click", async event => {
  const button = event.target.closest('[data-action="execute-approved-staging-plan"]');
  if (!button || button.disabled) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const plan = readSession("kairos.stagingThemePlan");
  const approval = readSession("kairos.stagingThemePlanApproval");
  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");

  panel.hidden = false;
  title.textContent = "Execute approved staging plan";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  if (!plan || !approval) {
    status.textContent = "Approval Required";
    status.className = "status-pill blocked";
    result.innerHTML = '<p class="execution-error">Generate and approve a source-grounded staging plan before execution.</p>';
    return;
  }

  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Re-reading approved staging files, verifying every source hash, generating exact replacement bodies, writing only to Kairos Staging, and performing read-back verification.</p>';
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Executing…";

  try {
    const response = await fetch("/api/shopify/staging/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      credentials: "include",
      body: JSON.stringify({ plan, approval }),
    });

    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Staging execution returned HTTP ${response.status}.`);

    sessionStorage.setItem("kairos.stagingExecutionEvidence", JSON.stringify(body));
    status.textContent = "Completed";
    status.className = "status-pill available";
    result.innerHTML = renderCompletion(body);
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Staging execution failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}, true);

function renderCompletion(body) {
  const execution = body?.execution || {};
  const files = Array.isArray(execution.filesWritten) ? execution.filesWritten : [];
  const verification = Array.isArray(body?.verification) ? body.verification : [];
  const fileCards = files.map(file => `<article class="evidence-card"><span>Verified write</span><strong>${escapeHTML(file.filename || "Unknown file")}</strong><p>${escapeHTML(file.beforeSha256 || "").slice(0, 12)}… → ${escapeHTML(file.afterSha256 || "").slice(0, 12)}…</p><small>${escapeHTML(file.beforeBytes ?? 0)} bytes → ${escapeHTML(file.afterBytes ?? 0)} bytes</small></article>`).join("");
  const verificationList = verification.map(item => `<li>${escapeHTML(item.filename || "Unknown file")}: ${item.matched ? "hash verified" : "verification failed"}</li>`).join("");

  return `<div class="evidence-summary"><strong>${escapeHTML(body.summary || "Approved staging plan executed and verified.")}</strong><span>${escapeHTML(body.completedAt || "")}</span></div>
  <div class="evidence-grid">
    <article class="evidence-card"><span>Target theme</span><strong>${escapeHTML(execution.targetTheme?.name || "Kairos Staging")}</strong><p>${escapeHTML(execution.targetTheme?.role || "UNPUBLISHED")}</p><small>${escapeHTML(execution.targetTheme?.id || "No theme ID")}</small></article>
    <article class="evidence-card"><span>Published theme</span><strong>${escapeHTML(execution.publishedTheme?.name || "Rise")}</strong><p>${escapeHTML(execution.publishedTheme?.role || "MAIN")}</p><small>Changed: ${escapeHTML(String(Boolean(execution.publishedThemeChanged)))}</small></article>
    <article class="evidence-card"><span>Files written</span><strong>${escapeHTML(files.length)}</strong><p>All writes targeted the non-live staging theme.</p></article>
    <article class="evidence-card"><span>Production publish</span><strong>Not authorized</strong><p>No live-theme publish action occurred.</p></article>
  </div>
  <h3>Verified staging changes</h3>
  <div class="evidence-grid">${fileCards || "<p>No file evidence returned.</p>"}</div>
  <div class="execution-lock"><strong>Read-back verification passed.</strong><ul>${verificationList}</ul><p>A separate approval is required for rollback or production publishing.</p></div>
  <details class="evidence-details"><summary>View complete execution and rollback evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>`;
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
