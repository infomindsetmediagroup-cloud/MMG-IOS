const BUILD = "kairos-manuscript-manufacturing-ui-20260713-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
let state = { record: null, busy: false, error: "" };

async function enhance() {
  const editorial = document.querySelector("#manuscript-editorial-workbench");
  if (!editorial || document.querySelector("#manuscript-manufacturing")) return;
  const projectId = activeProjectId();
  if (!projectId) return;
  const section = document.createElement("section");
  section.id = "manuscript-manufacturing";
  section.className = "manuscript-manufacturing";
  section.innerHTML = `<p class="eyebrow">Final manufacturing</p><h3>Loading Manufacturing Workspace…</h3>`;
  editorial.insertAdjacentElement("afterend", section);
  await load(projectId);
}

async function load(projectId) {
  state.busy = true; state.error = ""; render(projectId);
  try {
    const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/manufacturing`, { credentials: "include", cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Manufacturing workspace could not be loaded.");
    state.record = body.manufacturing || null;
  } catch (error) {
    state.error = error?.message || "Manufacturing workspace could not be loaded.";
  } finally {
    state.busy = false; render(projectId);
  }
}

function render(projectId) {
  const section = document.querySelector("#manuscript-manufacturing");
  if (!section) return;
  if (state.busy) {
    section.innerHTML = `<p class="eyebrow">Final manufacturing</p><h3>Building and verifying deliverables…</h3><p class="manuscript-progress">Kairos is generating the approved files, hashing every artifact, and assembling the final package.</p>`;
    return;
  }
  if (state.error) {
    section.innerHTML = `<p class="eyebrow">Final manufacturing</p><h3>Manufacturing needs attention</h3><p class="manuscript-error">${esc(state.error)}</p><button class="secondary" data-mfg-retry>Retry</button>`;
    section.querySelector("[data-mfg-retry]")?.addEventListener("click", () => load(projectId));
    return;
  }
  const record = state.record;
  if (!record) {
    section.innerHTML = `<p class="eyebrow">Final manufacturing</p><h3>Prepare Final Delivery Package</h3><p>After editorial approval, Kairos will manufacture the exact approved manuscript into DOCX, digital PDF, KDP interior, full-wrap cover, EPUB, manifest, and one final ZIP.</p><button class="primary" data-mfg-prepare>Prepare Manufacturing Release</button>`;
    section.querySelector("[data-mfg-prepare]")?.addEventListener("click", () => prepare(projectId));
    return;
  }
  if (record.status === "awaiting-manufacturing-approval") {
    section.innerHTML = `<p class="eyebrow">Manufacturing proposal</p><h3>${esc(record.title || "Approved manuscript")}</h3><p>${esc(record.author || "")}</p><div class="manuscript-manufacturing-grid">${(record.proposedArtifacts || []).map(name => `<span>${esc(name)}</span>`).join("")}</div><p class="manuscript-note">The final editorial checksum and customer-supplied cover are locked to this release. No storefront or platform submission is authorized.</p><label>Type ${esc(record.confirmationRequired)}<input data-mfg-confirm autocomplete="off"></label><button class="primary" data-mfg-execute>Authorize Manufacturing</button>`;
    section.querySelector("[data-mfg-execute]")?.addEventListener("click", () => execute(projectId));
    return;
  }
  if (record.status === "manufactured-and-verified") {
    const artifacts = record.artifacts || [];
    section.innerHTML = `<p class="eyebrow">Final delivery package</p><h3>Manufactured and verified</h3><p>${artifacts.length} deliverables passed integrity verification.</p><a class="manuscript-package" href="${esc(downloadURL(artifacts, "final-manufacturing-package.zip"))}" download>Download Final Package</a><div class="manuscript-manufacturing-grid">${artifacts.filter(item => item.name !== "final-manufacturing-package.zip").map(item => `<a href="${esc(item.downloadURL)}" download><strong>${esc(item.name)}</strong><small>${formatBytes(item.bytes)}</small></a>`).join("")}</div><p class="manuscript-note">Amazon KDP and other publishing platforms still perform final acceptance validation. ISBN confirmation and publisher-account submission remain controlled decisions.</p><label>Rollback confirmation<input data-mfg-rollback-confirm placeholder="${esc(record.rollbackConfirmation)}"></label><button class="secondary" data-mfg-rollback>Roll Back Generated Package</button>`;
    section.querySelector("[data-mfg-rollback]")?.addEventListener("click", () => rollback(projectId));
    return;
  }
  section.innerHTML = `<p class="eyebrow">Final manufacturing</p><h3>${esc(record.status || "Manufacturing")}</h3><p>The prior generated package is no longer active. The approved editorial source remains preserved.</p><button class="primary" data-mfg-prepare>Prepare New Manufacturing Release</button>`;
  section.querySelector("[data-mfg-prepare]")?.addEventListener("click", () => prepare(projectId));
}

async function prepare(projectId) {
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/manufacturing/prepare`, { actor: "Executive" });
}
async function execute(projectId) {
  const confirmation = document.querySelector("[data-mfg-confirm]")?.value || "";
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/manufacturing/execute`, { confirmation, actor: "Executive" });
}
async function rollback(projectId) {
  const confirmation = document.querySelector("[data-mfg-rollback-confirm]")?.value || "";
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/manufacturing/rollback`, { confirmation, actor: "Executive" });
}

async function run(projectId, url, payload) {
  state.busy = true; state.error = ""; render(projectId);
  try {
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Manufacturing action failed.");
    state.record = body.manufacturing || null;
    await window.KairosProductionWorkspace?.refresh?.();
  } catch (error) {
    state.error = error?.message || "Manufacturing action failed.";
  } finally {
    state.busy = false; render(projectId);
  }
}

function downloadURL(artifacts, name) { return artifacts.find(item => item.name === name)?.downloadURL || "#"; }
function activeProjectId() { try { const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null"); return active?.workspace === "manuscript-studio" ? active.projectId || null : null; } catch { return null; } }
function formatBytes(value) { const number = Number(value || 0); if (number < 1024) return `${number} B`; if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`; return `${(number / (1024 * 1024)).toFixed(1)} MB`; }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]); }

new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("kairos:production:state-changed", enhance);
enhance();
