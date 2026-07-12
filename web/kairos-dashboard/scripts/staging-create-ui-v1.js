const BUILD = "kairos-kernel-20260712-5";

queueMicrotask(() => {
  const cards = [...document.querySelectorAll(".parent-card")];
  const shopifyCard = cards.find(card => card.textContent.includes("Shopify & Website"));
  const list = shopifyCard?.querySelector(".ability-list");
  if (!list || list.querySelector('[data-action="create-approved-staging"]')) return;

  const row = document.createElement("section");
  row.className = "ability-row";
  row.innerHTML = `<div><strong>Create approved staging theme</strong><p>Execute the approved themeDuplicate proposal, verify the resulting non-live theme, and confirm the published Rise theme remains unchanged.</p></div><button class="capability-action" type="button" data-action="create-approved-staging">Create Approved Staging Theme</button>`;
  list.insertBefore(row, list.children[4] || null);
});

document.addEventListener("click", async event => {
  const button = event.target.closest('[data-action="create-approved-staging"]');
  if (!button || button.disabled) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const proposal = readSession("kairos.stagingProposal");
  const approval = readSession("kairos.stagingProposalApproval");

  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");

  panel.hidden = false;
  title.textContent = "Create approved staging theme";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  if (!proposal || !approval) {
    status.textContent = "Approval Required";
    status.className = "status-pill blocked";
    result.innerHTML = '<p class="execution-error">Prepare and approve the staging proposal before creating the non-live theme.</p>';
    return;
  }

  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Revalidating the approved source theme, executing themeDuplicate once, and verifying the new non-live theme. The published theme will not be changed.</p>';

  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Creating…";

  try {
    const response = await fetch("/api/shopify/staging/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      credentials: "include",
      body: JSON.stringify({ proposal, approval }),
    });

    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Staging creation returned HTTP ${response.status}.`);

    sessionStorage.setItem("kairos.stagingCreationEvidence", JSON.stringify(body));
    status.textContent = "Completed";
    status.className = "status-pill available";
    result.innerHTML = renderCompletion(body);
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Staging-theme creation failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}, true);

function renderCompletion(body) {
  const evidence = body?.evidence || {};
  const main = evidence.mainTheme || {};
  const staging = evidence.stagingTheme || {};
  const execution = body?.execution || {};
  return `<div class="evidence-summary"><strong>${escapeHTML(body.summary || "Staging theme created and verified.")}</strong><span>${escapeHTML(body.completedAt || "")}</span></div>
  <div class="evidence-grid">
    <article class="evidence-card"><span>Published theme</span><strong>${escapeHTML(main.name || "Not found")}</strong><p>${escapeHTML(main.role || "—")}</p><small>${escapeHTML(main.id || "No theme ID")}</small></article>
    <article class="evidence-card"><span>Staging theme</span><strong>${escapeHTML(staging.name || "Not found")}</strong><p>${escapeHTML(staging.role || "—")}</p><small>${escapeHTML(staging.id || "No theme ID")}</small></article>
    <article class="evidence-card"><span>Operation</span><strong>${escapeHTML(execution.operation || "themeDuplicate")}</strong><p>${execution.reusedExisting ? "Existing non-live theme verified" : "New non-live copy created"}</p></article>
    <article class="evidence-card"><span>Production publish</span><strong>Not authorized</strong><p>Published theme changed: ${escapeHTML(String(Boolean(execution.publishedThemeChanged)))}</p></article>
  </div>
  <div class="execution-lock"><strong>Safe boundary preserved.</strong><p>The live Rise theme remained MAIN. Future website changes must target the verified Kairos Staging theme first.</p></div>
  <details class="evidence-details" open><summary>View staging creation evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>`;
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
