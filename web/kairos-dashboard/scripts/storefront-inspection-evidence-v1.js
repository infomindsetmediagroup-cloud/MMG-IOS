const BUILD = "kairos-runtime-reset-20260711-5";

document.addEventListener("click", async event => {
  const button = event.target.closest('[data-action="inspect-storefront"]');
  if (!button || button.disabled) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");
  if (!panel || !title || !status || !result) return;

  panel.hidden = false;
  title.textContent = "Inspect live storefront";
  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Reading the public homepage and sitemap. No Shopify mutation authority is used.</p>';
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Inspecting…";

  try {
    const response = await fetch("/api/storefront/inspect", {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
    });
    const body = await readJSON(response);
    const homepage = body?.evidence?.homepage || {};
    const sitemap = body?.evidence?.sitemap || {};
    const errors = Array.isArray(body?.evidence?.errors) ? body.evidence.errors : [];

    status.textContent = response.ok ? "Completed" : "Needs Attention";
    status.className = `status-pill ${response.ok ? "available" : "blocked"}`;
    result.innerHTML = `
      <div class="evidence-summary">
        <strong>${escapeHTML(body.summary || `Inspection returned HTTP ${response.status}.`)}</strong>
        <span>Read-only · ${escapeHTML(body.completedAt || "")}</span>
      </div>
      <div class="evidence-grid">
        ${renderEvidence("Homepage", homepage)}
        ${renderEvidence("Sitemap", sitemap)}
      </div>
      ${errors.length ? `<div class="execution-error"><strong>Inspection errors</strong><ul>${errors.map(error => `<li>${escapeHTML(`${error.path || "Unknown path"}: ${error.message || "Unknown error"}`)}</li>`).join("")}</ul></div>` : ""}
      <details class="evidence-details" open>
        <summary>View execution evidence</summary>
        <pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre>
      </details>`;
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Storefront inspection failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}, true);

function renderEvidence(label, evidence) {
  return `<article class="evidence-card"><span>${escapeHTML(label)}</span><strong>HTTP ${escapeHTML(evidence.status ?? "—")}</strong><p>${escapeHTML(evidence.title || evidence.finalUrl || evidence.requestedUrl || "No response data returned.")}</p><small>${escapeHTML(evidence.contentType || "Unknown content type")} · ${escapeHTML(evidence.bytes ?? 0)} bytes</small></article>`;
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { summary: text }; }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}
