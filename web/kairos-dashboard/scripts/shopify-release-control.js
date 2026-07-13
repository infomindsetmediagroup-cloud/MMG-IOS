const BUILD = "kairos-release-control-20260712-1";
const state = { open:false, record:null, working:false, error:"", mode:"prepare" };

window.addEventListener("kairos:website-visual-decision", event => {
  if (event.detail?.executiveDecision?.decision === "approved") {
    sessionStorage.setItem("kairos.website.visual-review", JSON.stringify(event.detail));
  }
});

document.addEventListener("click", event => {
  const button = event.target.closest?.('[data-child="release-control"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.open = true;
  state.error = "";
  state.record = null;
  state.mode = "prepare";
  render();
}, true);

function render() {
  document.querySelector("#shopify-release-control-overlay")?.remove();
  if (!state.open) return;
  const overlay = document.createElement("div");
  overlay.id = "shopify-release-control-overlay";
  overlay.className = "release-overlay";
  overlay.innerHTML = `<section class="release-panel"><header><div><p class="eyebrow">Operations · Release Control</p><h2>Shopify Release Control</h2><p>Promote only an approved staging result. Publication, live verification, and rollback are governed separately.</p></div><button data-rc-close aria-label="Close">×</button></header>${view()}</section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function view() {
  if (state.working) return `<div class="release-progress"><i></i><p>${esc(state.mode === "publish" ? "Publishing the approved staging theme and verifying the live storefront…" : state.mode === "rollback" ? "Restoring the previous live theme and verifying the storefront…" : "Validating the approved visual review and preparing the release package…")}</p></div>`;
  if (state.error) return `<p class="release-error">${esc(state.error)}</p><div class="release-actions"><button class="primary" data-rc-retry>Retry</button><button class="secondary" data-rc-close>Close</button></div>`;
  if (!state.record) return prepareView();
  return recordView(state.record);
}

function prepareView() {
  const review = readVisualReview();
  const approved = review?.executiveDecision?.decision === "approved";
  return `<section class="release-summary"><h3>${approved ? "Approved staging result found" : "No approved visual review found"}</h3><p>${approved ? `Visual review ${esc(review.reviewID)} is ready for release preparation.` : "Complete the Website Production execution and approve its visual review before publication can begin."}</p></section><div class="release-actions"><button class="primary" data-rc-prepare ${approved ? "" : "disabled"}>Prepare Release</button><button class="secondary" data-rc-close>Close</button></div>`;
}

function recordView(record) {
  const publication = record.publication;
  const rollback = record.rollback;
  const published = Boolean(publication);
  const rolledBack = Boolean(rollback);
  return `<div class="release-banner ${rolledBack ? "rollback" : published ? "published" : "ready"}"><span>${esc(record.status)}</span><strong>${esc(record.targetTheme?.name || "Kairos Staging")}</strong></div>
    <section class="release-grid">
      <article><h4>Approved target</h4><p>${esc(record.targetTheme?.name || "—")} · ${esc(record.targetTheme?.id || "—")}</p></article>
      <article><h4>Protected rollback</h4><p>${esc(record.previousLiveTheme?.name || "—")} · ${esc(record.previousLiveTheme?.id || "—")}</p></article>
      <article><h4>Visual approval</h4><p>${esc(record.visualReview?.decision?.actor || "Executive")} · ${esc(record.visualReview?.decision?.decidedAt || "—")}</p></article>
      <article><h4>Deployment authority</h4><p>Cloudflare + Shopify only. Vercel is ignored.</p></article>
    </section>
    ${published ? publicationView(record) : publicationApproval(record)}
    ${published && !rolledBack ? rollbackView(record) : ""}
    <div class="release-actions"><button class="secondary" data-rc-close>Close</button></div>`;
}

function publicationApproval(record) {
  return `<section class="release-gate"><h3>Executive publication approval</h3><p>This action changes the live Shopify theme. The previous live theme remains available for rollback.</p><label>Type the exact confirmation phrase<input data-rc-confirm placeholder="PUBLISH APPROVED STAGING"></label><button class="primary danger" data-rc-publish>Publish Approved Staging</button></section>`;
}

function publicationView(record) {
  const probe = record.publication?.liveProbe || {};
  return `<section class="release-result"><h3>${record.status === "published-and-verified" ? "Published and verified" : "Published—attention required"}</h3><p>Live theme: ${esc(record.publication?.newLiveTheme?.name || "—")}</p><div class="release-evidence"><span>HTTP ${esc(probe.status ?? "—")}</span><span>${esc(probe.title || "Title unavailable")}</span><span>${esc(probe.latencyMs ?? "—")} ms</span><span>${esc(probe.bytes ?? "—")} bytes</span></div><a href="${escAttr(probe.finalURL || "https://07kd8e-qw.myshopify.com/")}" target="_blank" rel="noopener">Open Live Storefront ↗</a></section>`;
}

function rollbackView(record) {
  return `<section class="release-gate rollback"><h3>Emergency rollback</h3><p>Restore ${esc(record.previousLiveTheme?.name || "the previous live theme")} only when the newly published storefront requires reversal.</p><label>Type the exact confirmation phrase<input data-rc-rollback-confirm placeholder="ROLL BACK LIVE THEME"></label><button class="secondary danger" data-rc-rollback>Roll Back Live Theme</button></section>`;
}

function bind(overlay) {
  overlay.querySelectorAll("[data-rc-close]").forEach(button => button.onclick = () => { state.open = false; render(); });
  overlay.querySelector("[data-rc-prepare]")?.addEventListener("click", prepare);
  overlay.querySelector("[data-rc-publish]")?.addEventListener("click", publish);
  overlay.querySelector("[data-rc-rollback]")?.addEventListener("click", rollback);
  overlay.querySelector("[data-rc-retry]")?.addEventListener("click", () => { state.error = ""; state.record ? render() : prepare(); });
}

async function prepare() {
  const review = readVisualReview();
  if (!review?.reviewID) { state.error = "No approved visual review is available."; render(); return; }
  await run("prepare", "/api/shopify/release/prepare", { reviewID: review.reviewID });
}

async function publish() {
  const confirmation = document.querySelector("[data-rc-confirm]")?.value || "";
  await run("publish", "/api/shopify/release/publish", { releaseID: state.record.releaseID, confirmation, actor: "Executive" });
}

async function rollback() {
  const confirmation = document.querySelector("[data-rc-rollback-confirm]")?.value || "";
  await run("rollback", "/api/shopify/release/rollback", { releaseID: state.record.releaseID, confirmation, actor: "Executive" });
}

async function run(mode, url, payload) {
  state.mode = mode;
  state.working = true;
  state.error = "";
  render();
  try {
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok && response.status !== 202) throw new Error(body?.error?.message || `Release Control returned ${response.status}.`);
    state.record = body;
    sessionStorage.setItem("kairos.website.release", JSON.stringify(body));
  } catch (error) {
    state.error = error?.message || "Release Control could not complete this action.";
  } finally {
    state.working = false;
    render();
  }
}

function readVisualReview() { try { return JSON.parse(sessionStorage.getItem("kairos.website.visual-review") || "null"); } catch { return null; } }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
function escAttr(value) { return esc(value).replace(/`/g, "&#96;"); }
