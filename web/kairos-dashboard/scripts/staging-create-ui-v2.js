const BUILD = "kairos-kernel-20260712-7";

queueMicrotask(() => {
  const cards = [...document.querySelectorAll(".parent-card")];
  const shopifyCard = cards.find(card => card.textContent.includes("Shopify & Website"));
  const list = shopifyCard?.querySelector(".ability-list");
  if (!list) return;

  const oldRow = list.querySelector('[data-action="create-approved-staging"]')?.closest(".ability-row");
  if (oldRow) oldRow.remove();

  if (list.querySelector('[data-action="submit-approved-staging"]')) return;

  const row = document.createElement("section");
  row.className = "ability-row";
  row.innerHTML = `<div><strong>Create approved staging theme</strong><p>Submit the approved themeDuplicate request once, then verify the non-live theme in a separate resumable check.</p></div><div class="approval-actions"><button class="capability-action" type="button" data-action="submit-approved-staging">Submit Staging Creation</button><button class="secondary-action" type="button" data-action="verify-approved-staging">Verify Staging Theme</button></div>`;
  list.insertBefore(row, list.children[4] || null);
});

document.addEventListener("click", async event => {
  const submit = event.target.closest('[data-action="submit-approved-staging"]');
  const verify = event.target.closest('[data-action="verify-approved-staging"]');
  if ((!submit && !verify) || event.target.disabled) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const proposal = readSession("kairos.stagingProposal");
  const approval = readSession("kairos.stagingProposalApproval");
  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");

  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  if (!proposal || !approval) {
    title.textContent = "Staging-theme execution";
    status.textContent = "Approval Required";
    status.className = "status-pill blocked";
    result.innerHTML = '<p class="execution-error">Prepare and approve the staging proposal before submitting or verifying the non-live theme.</p>';
    return;
  }

  const button = submit || verify;
  const original = button.textContent;
  button.disabled = true;

  try {
    if (submit) {
      title.textContent = "Submit approved staging theme";
      status.textContent = "Working";
      status.className = "status-pill limited";
      result.innerHTML = '<p class="lead compact">Checking for an existing Kairos Staging theme and, only when absent, submitting one approved themeDuplicate request.</p>';
      button.textContent = "Submitting…";

      const response = await call("/api/shopify/staging/submit", { proposal, approval });
      const body = response.body;
      if (!response.ok && response.status !== 202) throw new Error(body?.error?.message || body?.summary || `Submission returned HTTP ${response.status}.`);

      sessionStorage.setItem("kairos.stagingSubmissionEvidence", JSON.stringify(body));
      status.textContent = body.status === "ready-for-verification" ? "Ready to Verify" : "Submitted";
      status.className = "status-pill limited";
      result.innerHTML = renderState(body, "Submission");
    } else {
      title.textContent = "Verify staging theme";
      status.textContent = "Working";
      status.className = "status-pill limited";
      result.innerHTML = '<p class="lead compact">Reading Shopify’s current theme list and verifying the non-live Kairos Staging theme without holding a long connection open.</p>';
      button.textContent = "Verifying…";

      const response = await call("/api/shopify/staging/verify", { proposal, approval });
      const body = response.body;
      if (!response.ok && response.status !== 202) throw new Error(body?.error?.message || body?.summary || `Verification returned HTTP ${response.status}.`);

      sessionStorage.setItem("kairos.stagingVerificationEvidence", JSON.stringify(body));
      const completed = body.status === "completed";
      status.textContent = completed ? "Completed" : "Processing";
      status.className = `status-pill ${completed ? "available" : "limited"}`;
      result.innerHTML = renderState(body, "Verification");
    }
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Staging execution failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}, true);

function renderState(body, label) {
  const evidence = body?.evidence || {};
  const main = evidence.mainTheme || {};
  const staging = evidence.stagingTheme || {};
  return `<div class="evidence-summary"><strong>${escapeHTML(body.summary || `${label} completed.`)}</strong><span>${escapeHTML(body.completedAt || "")}</span></div>
  <div class="evidence-grid">
    <article class="evidence-card"><span>Published theme</span><strong>${escapeHTML(main.name || "Rise")}</strong><p>${escapeHTML(main.role || "MAIN")}</p><small>${escapeHTML(main.id || "")}</small></article>
    <article class="evidence-card"><span>Staging theme</span><strong>${escapeHTML(staging.name || evidence.targetThemeName || "Kairos Staging")}</strong><p>${escapeHTML(staging.role || body.status || "Pending")}</p><small>${escapeHTML(staging.id || "")}</small></article>
  </div>
  ${body.status === "submitted" || body.status === "processing" || body.status === "pending" ? '<div class="execution-lock"><strong>Next step: verify.</strong><p>Use Verify Staging Theme. It is safe to repeat because verification performs no write.</p></div>' : ''}
  <details class="evidence-details" open><summary>View ${escapeHTML(label.toLowerCase())} evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>`;
}

async function call(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { summary: text }; }
  return { ok: response.ok, status: response.status, body };
}

function readSession(key) {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
