const BUILD = "kairos-manuscript-delivery-ui-20260713-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
let state = { record: null, busy: false, error: "" };

async function enhance() {
  const manufacturing = document.querySelector("#manuscript-manufacturing");
  if (!manufacturing || document.querySelector("#manuscript-delivery")) return;
  const projectId = activeProjectId();
  if (!projectId) return;
  const section = document.createElement("section");
  section.id = "manuscript-delivery";
  section.className = "manuscript-delivery";
  section.innerHTML = `<p class="eyebrow">Customer delivery</p><h3>Loading Delivery Control…</h3>`;
  manufacturing.insertAdjacentElement("afterend", section);
  await load(projectId);
}

async function load(projectId) {
  state.busy = true; state.error = ""; render(projectId);
  try {
    const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/delivery`, { credentials: "include", cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Customer delivery could not be loaded.");
    state.record = body.delivery || null;
  } catch (error) {
    state.error = error?.message || "Customer delivery could not be loaded.";
  } finally {
    state.busy = false; render(projectId);
  }
}

function render(projectId) {
  const section = document.querySelector("#manuscript-delivery");
  if (!section) return;
  if (state.busy) {
    section.innerHTML = `<p class="eyebrow">Customer delivery</p><h3>Updating delivery release…</h3><p class="manuscript-progress">Kairos is preserving the package identity, customer decision, and completion evidence.</p>`;
    return;
  }
  if (state.error) {
    section.innerHTML = `<p class="eyebrow">Customer delivery</p><h3>Delivery control needs attention</h3><p class="manuscript-error">${esc(state.error)}</p><button class="secondary" data-delivery-retry>Retry</button>`;
    section.querySelector("[data-delivery-retry]")?.addEventListener("click", () => load(projectId));
    return;
  }
  const record = state.record;
  if (!record) {
    section.innerHTML = `<p class="eyebrow">Customer delivery</p><h3>Prepare Customer Delivery</h3><p>Create the governed customer-facing release from the verified manufacturing package. This records who receives the work, what was released, and the final acceptance decision.</p><div class="manuscript-grid"><label>Customer name<input data-delivery-name maxlength="180" placeholder="Customer name"></label><label>Customer email <small>Optional record only</small><input data-delivery-email type="email" maxlength="254" placeholder="customer@example.com"></label></div><label>Delivery note<textarea data-delivery-note maxlength="4000" placeholder="Your approved publishing deliverables are ready for review."></textarea></label><button class="primary" data-delivery-prepare>Prepare Delivery Release</button>`;
    section.querySelector("[data-delivery-prepare]")?.addEventListener("click", () => prepare(projectId));
    return;
  }
  if (record.status === "awaiting-delivery-approval") {
    section.innerHTML = `<p class="eyebrow">Delivery proposal</p><h3>${esc(record.title)}</h3><p><strong>Customer:</strong> ${esc(record.customerName)}${record.customerEmail ? ` · ${esc(record.customerEmail)}` : ""}</p><p>${esc(record.note)}</p>${packageView(record)}<label>Type ${esc(record.confirmationRequired)}<input data-delivery-confirm autocomplete="off"></label><div class="manuscript-actions"><button class="primary" data-delivery-release>Release for Customer Review</button><button class="secondary" data-delivery-withdraw>Withdraw Proposal</button></div>`;
    section.querySelector("[data-delivery-release]")?.addEventListener("click", () => release(projectId));
    section.querySelector("[data-delivery-withdraw]")?.addEventListener("click", () => withdraw(projectId));
    return;
  }
  if (record.status === "released-for-customer-review") {
    section.innerHTML = `<p class="eyebrow">Customer review</p><h3>Deliverables released</h3>${packageView(record)}<p class="manuscript-note">This control records release and acceptance. It does not claim an email was sent unless a separate communication system confirms that action.</p><div class="manuscript-actions"><button class="primary" data-delivery-accept>Record Customer Acceptance</button><button class="secondary" data-delivery-revision>Record Revision Request</button><button class="secondary" data-delivery-withdraw>Withdraw Delivery</button></div>`;
    section.querySelector("[data-delivery-accept]")?.addEventListener("click", () => decision(projectId, "accepted"));
    section.querySelector("[data-delivery-revision]")?.addEventListener("click", () => decision(projectId, "revision-requested"));
    section.querySelector("[data-delivery-withdraw]")?.addEventListener("click", () => withdraw(projectId));
    return;
  }
  if (record.status === "customer-accepted") {
    section.innerHTML = `<p class="eyebrow">Project completion</p><h3>Customer acceptance recorded</h3><p>${esc(record.decision?.note || "The final deliverables were accepted.")}</p>${packageView(record)}<label>Type ${esc(record.completionConfirmation)}<input data-delivery-complete-confirm autocomplete="off"></label><button class="primary" data-delivery-complete>Complete Customer Project</button>`;
    section.querySelector("[data-delivery-complete]")?.addEventListener("click", () => complete(projectId));
    return;
  }
  if (record.status === "customer-revision-requested") {
    section.innerHTML = `<p class="eyebrow">Revision control</p><h3>Customer revision requested</h3><p>${esc(record.decision?.note || "Return to editorial production and create a new approved release.")}</p><p class="manuscript-note">The prior manufacturing release and delivery evidence remain preserved. A revised manuscript must complete approval and manufacturing again before a new customer delivery is prepared.</p>`;
    return;
  }
  if (record.status === "completed") {
    section.innerHTML = `<p class="eyebrow">Project complete</p><h3>Closed-loop delivery completed</h3><p>${esc(record.completion?.closureNote || "Final deliverables were accepted and the project was completed.")}</p>${packageView(record)}<div class="manuscript-delivery-proof"><span><strong>${esc(record.deliveryId)}</strong><small>delivery ID</small></span><span><strong>${esc(formatDate(record.completedAt))}</strong><small>completed</small></span><span><strong>${(record.history || []).length}</strong><small>recorded events</small></span></div>`;
    return;
  }
  section.innerHTML = `<p class="eyebrow">Customer delivery</p><h3>${esc(record.status || "Delivery")}</h3><p>The prior delivery is not active. The verified manufacturing package remains preserved.</p><button class="primary" data-delivery-new>Prepare New Delivery Release</button>`;
  section.querySelector("[data-delivery-new]")?.addEventListener("click", () => { state.record = null; render(projectId); });
}

function packageView(record) {
  const pkg = record.package || {};
  const primary = pkg.primaryDownload;
  return `<div class="manuscript-delivery-package"><div><strong>${Number(pkg.artifactCount || 0)} verified deliverables</strong><small>Manufacturing release ${esc(pkg.manufacturingReleaseId || "—")}</small></div>${primary ? `<a href="${esc(primary)}" download>Download Final Package</a>` : ""}</div>`;
}

async function prepare(projectId) {
  const customerName = document.querySelector("[data-delivery-name]")?.value.trim() || "";
  const customerEmail = document.querySelector("[data-delivery-email]")?.value.trim() || "";
  const note = document.querySelector("[data-delivery-note]")?.value.trim() || "";
  await run(projectId, "prepare", { customerName, customerEmail, note, actor: "Executive" });
}
async function release(projectId) { await run(projectId, "release", { confirmation: document.querySelector("[data-delivery-confirm]")?.value || "", actor: "Executive" }); }
async function decision(projectId, value) { const note = window.prompt(value === "accepted" ? "Acceptance note (optional)" : "Describe the requested revision") || ""; await run(projectId, "decision", { decision: value, note, actor: "Executive" }); }
async function complete(projectId) { await run(projectId, "complete", { confirmation: document.querySelector("[data-delivery-complete-confirm]")?.value || "", actor: "Executive" }); }
async function withdraw(projectId) { const confirmation = window.prompt("Type WITHDRAW CUSTOMER DELIVERY to confirm") || ""; const note = window.prompt("Withdrawal note (optional)") || ""; await run(projectId, "withdraw", { confirmation, note, actor: "Executive" }); }

async function run(projectId, action, payload) {
  state.busy = true; state.error = ""; render(projectId);
  try {
    const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/delivery/${action}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Customer delivery action failed.");
    state.record = body.delivery || null;
    await window.KairosProductionWorkspace?.refresh?.();
  } catch (error) {
    state.error = error?.message || "Customer delivery action failed.";
  } finally {
    state.busy = false; render(projectId);
  }
}

function activeProjectId() { try { const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null"); return active?.workspace === "manuscript-studio" ? active.projectId || null : null; } catch { return null; } }
function formatDate(value) { try { return new Date(value).toLocaleString(); } catch { return String(value || ""); } }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]); }

new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("kairos:production:state-changed", enhance);
enhance();
