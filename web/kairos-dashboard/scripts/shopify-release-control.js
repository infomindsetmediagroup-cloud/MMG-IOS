const BUILD = "kairos-release-control-20260712-2";
const state = { open:false, record:null, working:false, error:"", mode:"prepare", releaseKind:"theme" };

window.addEventListener("kairos:website-visual-decision", event => {
  if (event.detail?.executiveDecision?.decision === "approved") sessionStorage.setItem("kairos.website.visual-review", JSON.stringify(event.detail));
});

window.addEventListener("kairos:release-control:open", () => openReleaseControl());

document.addEventListener("click", event => {
  const button = event.target.closest?.('[data-child="release-control"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openReleaseControl();
}, true);

function openReleaseControl() {
  state.open = true;
  state.error = "";
  state.record = null;
  state.mode = "prepare";
  state.releaseKind = releaseKind(readVisualReview());
  render();
}

function render() {
  document.querySelector("#shopify-release-control-overlay")?.remove();
  if (!state.open) return;
  const overlay = document.createElement("div");
  overlay.id = "shopify-release-control-overlay";
  overlay.className = "release-overlay";
  overlay.innerHTML = `<section class="release-panel"><header><div><p class="eyebrow">Operations · Release Control</p><h2>Shopify Release Control</h2><p>Publish only an approved staging result. Theme publication and resource assignment use separate governed paths.</p></div><button data-rc-close aria-label="Close">×</button></header>${view()}</section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function view() {
  if (state.working) return `<div class="release-progress"><i></i><p>${esc(progressText())}</p></div>`;
  if (state.error) return `<p class="release-error">${esc(state.error)}</p><div class="release-actions"><button class="primary" data-rc-retry>Retry</button><button class="secondary" data-rc-close>Close</button></div>`;
  if (!state.record) return prepareView();
  return recordView(state.record);
}

function progressText() {
  if (state.mode === "publish") return state.releaseKind === "resource" ? "Publishing the approved Shopify resource assignment and verifying its live route…" : "Publishing the approved staging theme and verifying the live storefront…";
  if (state.mode === "rollback") return state.releaseKind === "resource" ? "Restoring the prior resource assignment and verifying the live route…" : "Restoring the previous live theme and verifying the storefront…";
  return state.releaseKind === "resource" ? "Validating the approved site-wide resource and preparing its release package…" : "Validating the approved visual review and preparing the theme release package…";
}

function prepareView() {
  const review = readVisualReview();
  const approved = review?.executiveDecision?.decision === "approved";
  const kind = releaseKind(review);
  const target = review?.releaseTarget || {};
  const label = kind === "resource" ? `${labelize(target.resourceType)} · ${target.resourceHandle || "approved resource"}` : "approved staging theme";
  return `<section class="release-summary"><h3>${approved ? "Approved staging result found" : "No approved visual review found"}</h3><p>${approved ? `${esc(label)} is ready for governed release preparation.` : "Complete Website Production and approve its visual review before publication can begin."}</p></section><div class="release-actions"><button class="primary" data-rc-prepare ${approved ? "" : "disabled"}>Prepare ${kind === "resource" ? "Resource" : "Theme"} Release</button><button class="secondary" data-rc-close>Close</button></div>`;
}

function recordView(record) {
  const publication = record.publication;
  const rollback = record.rollback;
  const published = Boolean(publication);
  const rolledBack = Boolean(rollback);
  const resource = state.releaseKind === "resource";
  return `<div class="release-banner ${rolledBack ? "rollback" : published ? "published" : "ready"}"><span>${esc(record.status)}</span><strong>${esc(resource ? resourceTitle(record) : record.targetTheme?.name || "Kairos Staging")}</strong></div>
    <section class="release-grid">
      ${resource ? resourceGrid(record) : themeGrid(record)}
      <article><h4>Visual approval</h4><p>${esc(record.visualReview?.decision?.actor || "Executive")} · ${esc(record.visualReview?.decision?.decidedAt || "—")}</p></article>
      <article><h4>Deployment authority</h4><p>Cloudflare + Shopify only. Vercel is ignored.</p></article>
    </section>
    ${published ? publicationView(record) : publicationApproval(record)}
    ${published && !rolledBack ? rollbackView(record) : ""}
    <div class="release-actions"><button class="secondary" data-rc-close>Close</button></div>`;
}

function themeGrid(record) {
  return `<article><h4>Approved target</h4><p>${esc(record.targetTheme?.name || "—")} · ${esc(record.targetTheme?.id || "—")}</p></article><article><h4>Protected rollback</h4><p>${esc(record.previousLiveTheme?.name || "—")} · ${esc(record.previousLiveTheme?.id || "—")}</p></article>`;
}

function resourceGrid(record) {
  return `<article><h4>Approved resource</h4><p>${esc(resourceTitle(record))}</p></article><article><h4>Template assignment</h4><p>${esc(record.resourceBefore?.templateSuffix || "default")} → ${esc(record.assignment?.templateSuffix || "—")}</p></article>`;
}

function publicationApproval() {
  const resource = state.releaseKind === "resource";
  const phrase = resource ? "PUBLISH APPROVED RESOURCE" : "PUBLISH APPROVED STAGING";
  return `<section class="release-gate"><h3>Executive publication approval</h3><p>${resource ? "This assigns the approved template to the exact Shopify page, product, or collection. No other resource is changed." : "This changes the live Shopify theme. The previous live theme remains available for rollback."}</p><label>Type the exact confirmation phrase<input data-rc-confirm placeholder="${phrase}"></label><button class="primary danger" data-rc-publish>${resource ? "Publish Approved Resource" : "Publish Approved Staging"}</button></section>`;
}

function publicationView(record) {
  const probe = record.publication?.liveProbe || {};
  const resource = state.releaseKind === "resource";
  const success = record.status.includes("verified");
  return `<section class="release-result"><h3>${success ? "Published and verified" : "Published—attention required"}</h3><p>${resource ? `Live resource: ${esc(resourceTitle(record))}` : `Live theme: ${esc(record.publication?.newLiveTheme?.name || "—")}`}</p><div class="release-evidence"><span>HTTP ${esc(probe.status ?? "—")}</span><span>${esc(probe.title || "Title unavailable")}</span><span>${esc(probe.latencyMs ?? "—")} ms</span><span>${esc(probe.bytes ?? "—")} bytes</span></div><a href="${escAttr(probe.finalURL || "https://07kd8e-qw.myshopify.com/")}" target="_blank" rel="noopener">Open Live ${resource ? "Resource" : "Storefront"} ↗</a></section>`;
}

function rollbackView(record) {
  const resource = state.releaseKind === "resource";
  const phrase = resource ? "ROLL BACK LIVE RESOURCE" : "ROLL BACK LIVE THEME";
  return `<section class="release-gate rollback"><h3>Emergency rollback</h3><p>${resource ? "Restore the exact prior template and publication state for this resource." : `Restore ${esc(record.previousLiveTheme?.name || "the previous live theme")} only when the newly published storefront requires reversal.`}</p><label>Type the exact confirmation phrase<input data-rc-rollback-confirm placeholder="${phrase}"></label><button class="secondary danger" data-rc-rollback>Roll Back Live ${resource ? "Resource" : "Theme"}</button></section>`;
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
  state.releaseKind = releaseKind(review);
  const url = state.releaseKind === "resource" ? "/api/shopify/resource-release/prepare" : "/api/shopify/release/prepare";
  await run("prepare", url, { reviewID: review.reviewID });
}

async function publish() {
  const confirmation = document.querySelector("[data-rc-confirm]")?.value || "";
  const url = state.releaseKind === "resource" ? "/api/shopify/resource-release/publish" : "/api/shopify/release/publish";
  await run("publish", url, { releaseID: state.record.releaseID, confirmation, actor: "Executive" });
}

async function rollback() {
  const confirmation = document.querySelector("[data-rc-rollback-confirm]")?.value || "";
  const url = state.releaseKind === "resource" ? "/api/shopify/resource-release/rollback" : "/api/shopify/release/rollback";
  await run("rollback", url, { releaseID: state.record.releaseID, confirmation, actor: "Executive" });
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
    sessionStorage.setItem("kairos.website.release", JSON.stringify({ kind:state.releaseKind, record:body }));
  } catch (error) {
    state.error = error?.message || "Release Control could not complete this action.";
  } finally {
    state.working = false;
    render();
  }
}

function releaseKind(review) { return review?.releaseTarget?.releaseType === "resource-assignment" ? "resource" : "theme"; }
function resourceTitle(record) { return `${labelize(record.assignment?.resourceType || "resource")} · ${record.resourceAfter?.title || record.resourceBefore?.title || record.assignment?.resourceHandle || "—"}`; }
function labelize(value) { return String(value || "").replace(/-/g," ").replace(/\b\w/g, char => char.toUpperCase()); }
function readVisualReview() { try { return JSON.parse(sessionStorage.getItem("kairos.website.visual-review") || "null"); } catch { return null; } }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
function escAttr(value) { return esc(value).replace(/`/g, "&#96;"); }
