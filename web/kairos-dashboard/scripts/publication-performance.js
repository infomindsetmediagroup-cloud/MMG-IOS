const BUILD = "kairos-publication-performance-ui-20260722-2";
const ACTIVE_KEY = "kairos.production.active-workspace";

const state = {
  record: null,
  busy: false,
  error: "",
};

async function enhance() {
  const operations = document.querySelector("#publication-operations");
  if (!operations || document.querySelector("#publication-performance")) return;

  const projectId = activeProjectId();
  if (!projectId) return;

  const section = document.createElement("section");
  section.id = "publication-performance";
  section.className = "publication-performance";
  section.innerHTML = '<p class="eyebrow">Performance & royalties</p><h3>Loading verified ledger…</h3>';
  operations.insertAdjacentElement("afterend", section);
  await load(projectId);
}

async function load(projectId) {
  state.busy = true;
  state.error = "";
  render(projectId);

  try {
    const response = await fetch(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/publication-performance`,
      { credentials: "include", cache: "no-store" },
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error?.message || "Performance ledger could not be loaded.");
    }
    state.record = body.performance;
  } catch (error) {
    state.error = error?.message || "Performance ledger could not be loaded.";
  } finally {
    state.busy = false;
    render(projectId);
  }
}

function render(projectId) {
  const section = document.querySelector("#publication-performance");
  if (!section) return;

  if (state.busy) {
    section.innerHTML = '<p class="eyebrow">Performance & royalties</p><h3>Updating verified ledger…</h3>';
    return;
  }

  if (state.error) {
    section.innerHTML = `
      <p class="eyebrow">Performance & royalties</p>
      <h3>Ledger needs attention</h3>
      <p class="manuscript-error">${esc(state.error)}</p>
      <button type="button" class="secondary" data-perf-retry>Retry</button>
    `;
    section.querySelector("[data-perf-retry]")?.addEventListener("click", () => load(projectId));
    return;
  }

  const record = state.record || { entries: [], totals: {} };
  const totals = record.totals || {};
  section.innerHTML = `
    <p class="eyebrow">Performance & royalties</p>
    <h3>Verified publication ledger</h3>
    <p>Only confirmed platform statements and payout evidence count toward totals. Unverified entries remain excluded.</p>
    <div class="publication-performance-summary">
      <span><strong>${Number(totals.units || 0).toLocaleString()}</strong><small>verified units</small></span>
      <span><strong>${money(totals.grossRevenue, record.currency)}</strong><small>gross revenue</small></span>
      <span><strong>${money(totals.netRoyalty, record.currency)}</strong><small>net royalties</small></span>
      <span><strong>${Number(record.unverifiedEntryCount || 0)}</strong><small>awaiting verification</small></span>
    </div>
    <details>
      <summary>Add statement entry</summary>
      <div class="manuscript-grid">
        <label>Entry type<select data-perf-type>
          <option value="sales-statement">Sales statement</option>
          <option value="royalty-statement">Royalty statement</option>
          <option value="payout">Payout</option>
          <option value="adjustment">Adjustment</option>
          <option value="return-statement">Return statement</option>
        </select></label>
        <label>Platform<input data-perf-platform maxlength="120"></label>
      </div>
      <div class="manuscript-grid">
        <label>Period start<input data-perf-start type="date"></label>
        <label>Period end<input data-perf-end type="date"></label>
      </div>
      <div class="manuscript-grid">
        <label>Units<input data-perf-units type="number" min="0" step="1" value="0"></label>
        <label>Returns<input data-perf-returns type="number" min="0" step="1" value="0"></label>
      </div>
      <div class="manuscript-grid">
        <label>Gross revenue<input data-perf-gross type="number" min="0" step="0.01" value="0"></label>
        <label>Platform fees<input data-perf-fees type="number" min="0" step="0.01" value="0"></label>
      </div>
      <div class="manuscript-grid">
        <label>Tax withheld<input data-perf-tax type="number" min="0" step="0.01" value="0"></label>
        <label>Net royalty<input data-perf-net type="number" min="0" step="0.01" value="0"></label>
      </div>
      <div class="manuscript-grid">
        <label>Statement source<input data-perf-source maxlength="180" placeholder="KDP royalty report"></label>
        <label>Statement reference<input data-perf-reference maxlength="240"></label>
      </div>
      <label>Evidence note<textarea data-perf-note maxlength="4000"></textarea></label>
      <button type="button" class="primary" data-perf-add>Add Unverified Entry</button>
    </details>
    <a class="manuscript-package" href="/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/publication-performance/export" download>Download Ledger</a>
    ${entryList(record.entries || [])}
  `;

  section.querySelector("[data-perf-add]")?.addEventListener("click", () => add(projectId));
  section.querySelectorAll("[data-perf-verify]").forEach((button) => {
    button.addEventListener("click", () => verify(projectId, button.dataset.perfVerify));
  });
  section.querySelectorAll("[data-perf-void]").forEach((button) => {
    button.addEventListener("click", () => voidEntry(projectId, button.dataset.perfVoid));
  });
}

function entryList(entries) {
  if (!entries.length) return '<p class="manuscript-note">No statements recorded yet.</p>';

  return `
    <div class="issue-list publication-performance-list">
      ${entries.slice().reverse().map((entry) => `
        <article>
          <b>${esc(entry.type)} · ${esc(entry.status)}</b>
          <p>${esc(entry.periodStart)}–${esc(entry.periodEnd)} · ${Number(entry.units || 0)} units · ${money(entry.netRoyalty, entry.currency)}</p>
          <small>${esc(entry.evidence?.source || "")} · ${esc(entry.evidence?.reference || "")}</small>
          <div class="manuscript-actions">
            ${entry.status === "unverified" ? `<button type="button" class="secondary" data-perf-verify="${esc(entry.entryId)}">Verify</button>` : ""}
            ${entry.status !== "void" ? `<button type="button" class="secondary" data-perf-void="${esc(entry.entryId)}">Void</button>` : ""}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

async function add(projectId) {
  const section = document.querySelector("#publication-performance");
  const read = (selector) => section?.querySelector(selector);
  await run(projectId, "entries", {
    type: read("[data-perf-type]")?.value,
    platform: read("[data-perf-platform]")?.value,
    periodStart: read("[data-perf-start]")?.value,
    periodEnd: read("[data-perf-end]")?.value,
    units: Number(read("[data-perf-units]")?.value || 0),
    returns: Number(read("[data-perf-returns]")?.value || 0),
    grossRevenue: Number(read("[data-perf-gross]")?.value || 0),
    platformFees: Number(read("[data-perf-fees]")?.value || 0),
    taxWithheld: Number(read("[data-perf-tax]")?.value || 0),
    netRoyalty: Number(read("[data-perf-net]")?.value || 0),
    source: read("[data-perf-source]")?.value,
    reference: read("[data-perf-reference]")?.value,
    evidenceNote: read("[data-perf-note]")?.value,
    reportedAt: new Date().toISOString().slice(0, 10),
    actor: "Executive",
  });
}

async function verify(projectId, entryId) {
  const note = window.prompt("Verification note (optional)") || "";
  await run(projectId, `verify/${encodeURIComponent(entryId)}`, { note, actor: "Executive" });
}

async function voidEntry(projectId, entryId) {
  const reason = window.prompt("Reason for voiding this ledger entry") || "";
  if (!reason) return;
  await run(projectId, `void/${encodeURIComponent(entryId)}`, { reason, actor: "Executive" });
}

async function run(projectId, path, payload) {
  state.busy = true;
  state.error = "";
  render(projectId);

  try {
    const response = await fetch(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/publication-performance/${path}`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-MMG-Client-Build": BUILD,
        },
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Performance action failed.");
    state.record = body.performance;
    await window.KairosProductionWorkspace?.refresh?.();
  } catch (error) {
    state.error = error?.message || "Performance action failed.";
  } finally {
    state.busy = false;
    render(projectId);
  }
}

function activeProjectId() {
  try {
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
  } catch {
    return null;
  }
}

function money(value, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(Number(value || 0));
  } catch {
    return `${currency || "USD"} ${Number(value || 0).toFixed(2)}`;
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("kairos:production:state-changed", enhance);
enhance();
