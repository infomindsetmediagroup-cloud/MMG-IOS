const BUILD = "kairos-kernel-20260712-3";

queueMicrotask(() => {
  const cards = [...document.querySelectorAll(".parent-card")];
  const shopifyCard = cards.find(card => card.textContent.includes("Shopify & Website"));
  const list = shopifyCard?.querySelector(".ability-list");
  if (!list || list.querySelector('[data-action="inspect-staging-readiness"]')) return;

  const row = document.createElement("section");
  row.className = "ability-row";
  row.innerHTML = `<div><strong>Inspect staging-theme readiness</strong><p>Read the live Shopify schema and identify exact theme creation or duplication operations. No write is performed.</p></div><button class="capability-action" type="button" data-action="inspect-staging-readiness">Inspect Staging Readiness</button>`;
  list.insertBefore(row, list.children[2] || null);
});

document.addEventListener("click", async event => {
  const button = event.target.closest('[data-action="inspect-staging-readiness"]');
  if (!button || button.disabled) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");
  panel.hidden = false;
  title.textContent = "Inspect staging-theme readiness";
  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Inspecting the live Shopify GraphQL schema for safe staging-theme creation or duplication operations. No write is being performed.</p>';
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Inspecting…";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const response = await fetch("/api/shopify/staging/readiness", {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
    });
    const body = await readJSON(response);
    const evidence = body?.evidence || {};
    const candidates = Array.isArray(evidence.candidateMutations) ? evidence.candidateMutations : [];
    status.textContent = response.ok ? "Ready" : "Needs Attention";
    status.className = `status-pill ${response.ok ? "available" : "blocked"}`;
    result.innerHTML = `<div class="evidence-summary"><strong>${escapeHTML(body.summary || `Readiness inspection returned HTTP ${response.status}.`)}</strong><span>Read-only · ${escapeHTML(body.completedAt || "")}</span></div>${body.error ? `<div class="execution-error"><p><strong>${escapeHTML(body.error.code || "readiness_error")}</strong>: ${escapeHTML(body.error.message || "Unknown error")}</p></div>` : ""}<div class="evidence-grid"><article class="evidence-card"><span>Main theme</span><strong>${escapeHTML(evidence.mainTheme?.name || "Not found")}</strong><p>${escapeHTML(evidence.mainTheme?.role || "—")}</p></article><article class="evidence-card"><span>Candidate operations</span><strong>${escapeHTML(candidates.length)}</strong><p>${escapeHTML(candidates.length ? candidates.map(item => item.name).join(", ") : "No create or duplicate mutation exposed.")}</p></article></div><details class="evidence-details" open><summary>View staging readiness evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>`;
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Staging readiness inspection failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}, true);

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
