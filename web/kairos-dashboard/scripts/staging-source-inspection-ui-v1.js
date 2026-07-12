const BUILD = "kairos-kernel-20260712-8";

queueMicrotask(() => {
  const cards = [...document.querySelectorAll(".parent-card")];
  const shopifyCard = cards.find(card => card.textContent.includes("Shopify & Website"));
  const list = shopifyCard?.querySelector(".ability-list");
  if (!list || list.querySelector('[data-action="inspect-staging-source"]')) return;

  const row = document.createElement("section");
  row.className = "ability-row";
  row.innerHTML = `<div><strong>Inspect Kairos Staging source</strong><p>Read homepage-relevant files from the verified non-live staging theme and record exact SHA-256 source evidence. No write is performed.</p></div><button class="capability-action" type="button" data-action="inspect-staging-source">Inspect Staging Source</button>`;
  list.insertBefore(row, list.children[6] || null);
});

document.addEventListener("click", async event => {
  const button = event.target.closest('[data-action="inspect-staging-source"]');
  if (!button || button.disabled) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");

  panel.hidden = false;
  title.textContent = "Inspect Kairos Staging source";
  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Reading the verified non-live staging theme through Shopify’s live schema. No file will be changed.</p>';
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Inspecting…";

  try {
    const response = await fetch("/api/shopify/staging/source/inspect", {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
    });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Source inspection returned HTTP ${response.status}.`);

    sessionStorage.setItem("kairos.stagingSourceEvidence", JSON.stringify(body));
    status.textContent = "Completed";
    status.className = "status-pill available";
    result.innerHTML = renderSourceEvidence(body);
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Staging source inspection failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}, true);

function renderSourceEvidence(body) {
  const evidence = body?.evidence || {};
  const files = Array.isArray(evidence.files) ? evidence.files : [];
  const readable = files.filter(file => file.readable);
  const cards = files.map(file => `<article class="evidence-card"><span>${escapeHTML(file.filename || "Unknown file")}</span><strong>${file.readable ? "Readable" : "Metadata only"}</strong><p>${escapeHTML(file.sha256 ? `SHA-256 ${file.sha256.slice(0, 16)}…` : "No text hash")}</p><small>${escapeHTML(file.bytes ?? 0)} bytes · ${escapeHTML(file.bodyType || "unknown")}</small></article>`).join("");
  const missing = Array.isArray(evidence.missingFiles) ? evidence.missingFiles : [];

  return `<div class="evidence-summary"><strong>${escapeHTML(body.summary || "Staging source inspected.")}</strong><span>Read-only · ${escapeHTML(body.completedAt || "")}</span></div>
    <div class="evidence-grid">
      <article class="evidence-card"><span>Staging theme</span><strong>${escapeHTML(evidence.stagingTheme?.name || "Not found")}</strong><p>${escapeHTML(evidence.stagingTheme?.role || "—")}</p><small>${escapeHTML(evidence.stagingTheme?.id || "No theme ID")}</small></article>
      <article class="evidence-card"><span>Readable files</span><strong>${escapeHTML(readable.length)}</strong><p>${escapeHTML(files.length)} returned</p><small>${escapeHTML(missing.length)} requested files absent</small></article>
    </div>
    <div class="evidence-grid">${cards || '<article class="evidence-card"><strong>No files returned</strong></article>'}</div>
    ${missing.length ? `<div class="execution-lock"><strong>Files not present in this theme</strong><p>${escapeHTML(missing.join(", "))}</p></div>` : ""}
    <details class="evidence-details" open><summary>View staging source evidence</summary><pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre></details>`;
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
