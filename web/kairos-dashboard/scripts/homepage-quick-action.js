const BUILD = "kairos-homepage-quick-action-20260716-2";
const ROUTE = "/center/content/website";
const STATE_KEY = "kairos.homepage.quick-action.v3";
const LEGACY_STATE_KEY = "kairos.homepage.quick-action.v2";
try { sessionStorage.removeItem(LEGACY_STATE_KEY); } catch {}
const state = loadState();

mount();
window.addEventListener("popstate", () => requestAnimationFrame(mount));
document.addEventListener("click", event => {
  if (event.target?.closest?.('[data-route-workspace="website"], [data-route-center="content"], [data-route-home]')) requestAnimationFrame(mount);
});

function mount() {
  if (location.pathname !== ROUTE) return;
  const host = document.querySelector(".child-workspace-page .job.routed-job");
  if (!host || host.dataset.homepageQuickAction === BUILD) return;
  host.dataset.homepageQuickAction = BUILD;
  render(host);
}

function render(host = document.querySelector(".child-workspace-page .job.routed-job")) {
  if (!host || location.pathname !== ROUTE) return;
  host.dataset.homepageQuickAction = BUILD;
  if (["planning", "executing", "verifying", "publishing"].includes(state.mode)) host.innerHTML = workingMarkup();
  else if (state.mode === "preview") host.innerHTML = previewMarkup();
  else if (state.mode === "release") host.innerHTML = releaseMarkup();
  else if (state.mode === "complete") host.innerHTML = completionMarkup();
  else host.innerHTML = inputMarkup();
  bind(host);
}

function inputMarkup() {
  return `<section class="homepage-quick-action">
    <div class="homepage-quick-hero">
      <p class="eyebrow">Homepage Text Redo</p>
      <h2>Keep my homepage. Change the words.</h2>
      <p>Kairos reads the currently published Shopify homepage as the framework source, targets active rendered homepage copy, copies that exact template into non-live staging, and returns the preview.</p>
    </div>
    <div class="homepage-design-lock">
      <strong>Published framework locked</strong>
      <span>Sections · blocks · order · Liquid · CSS · assets · classes · colors · typography · pills · cards · spacing · layout · links · animation · mobile behavior</span>
    </div>
    <label class="objective-label" for="homepage-quick-objective">What should the existing homepage say or communicate better?</label>
    <textarea class="objective" id="homepage-quick-objective" maxlength="12000" placeholder="Example: Keep the entire homepage exactly as it is, but rewrite the visible copy so visitors understand that MMG helps creators turn knowledge into professional digital products.">${escapeHTML(state.objective)}</textarea>
    ${state.error ? `<p class="homepage-quick-error">${escapeHTML(state.error)}</p>` : ""}
    <button class="primary homepage-quick-build" type="button" data-homepage-quick-build>Rewrite Text & Build Preview</button>
    <small class="homepage-quick-boundary">Preserve mode may write only templates/index.json on Kairos Staging. A successful preview must contain at least one verified change to active rendered homepage copy.</small>
  </section>`;
}

function workingMarkup() {
  const copy = {
    planning: ["Reading the rendered homepage copy", "Kairos is using the current live MAIN homepage as the framework source and locating active ordered sections and blocks that actually render customer-facing text."],
    executing: ["Rewriting visible text inside the published framework", "Kairos is copying the published template to staging and changing only verified rendered string settings. Liquid, CSS, assets, sections, blocks, order, colors, and layout are locked."],
    verifying: ["Preparing the real Shopify preview", "Kairos is verifying that the staging preview uses the published framework and contains at least one active rendered text replacement."],
    publishing: ["Applying and verifying the approved text update", "Kairos is saving only the exact approved homepage template and preserving rollback evidence."],
  }[state.mode] || ["Working", "Kairos is completing the homepage text job."];
  return `<section class="homepage-quick-action homepage-quick-working">
    <div class="homepage-quick-spinner" aria-hidden="true"></div>
    <p class="eyebrow">Kairos is working</p>
    <h2>${escapeHTML(copy[0])}</h2>
    <p>${escapeHTML(copy[1])}</p>
    <div class="homepage-quick-progress"><span></span></div>
  </section>`;
}

function previewMarkup() {
  const preview = state.verification?.preview || {};
  const checks = Array.isArray(state.verification?.automatedChecks) ? state.verification.automatedChecks : [];
  const passed = checks.filter(check => check?.passed).length;
  return `<section class="homepage-quick-action">
    <div class="homepage-quick-success">
      <p class="eyebrow">Homepage text preview ready</p>
      <h2>Your framework is preserved and rendered copy changed.</h2>
      <p>${escapeHTML(state.execution?.summary || "Kairos updated active rendered homepage text inside the published framework.")}</p>
    </div>
    <div class="homepage-preview-links">
      <a href="${escapeAttribute(preview.mobileURL || preview.url || "#")}" target="_blank" rel="noopener">Open Mobile Preview ↗</a>
      <a href="${escapeAttribute(preview.desktopURL || preview.url || "#")}" target="_blank" rel="noopener">Open Desktop Preview ↗</a>
    </div>
    <div class="homepage-preview-evidence">
      <strong>${passed}/${checks.length || passed} rendered checks passed</strong>
      <span>Published MAIN framework source · active rendered copy changed · templates/index.json only · Liquid/CSS/assets untouched · staging only</span>
    </div>
    ${state.error ? `<p class="homepage-quick-error">${escapeHTML(state.error)}</p>` : ""}
    <label class="homepage-quick-confirm"><input type="checkbox" data-homepage-preview-reviewed><span>I reviewed this exact staging preview and want Kairos to prepare only this text update for live application.</span></label>
    <div class="homepage-quick-actions"><button class="primary" type="button" data-homepage-preview-approve>Approve This Text Preview</button><button type="button" data-homepage-start-over>Change the Request</button></div>
  </section>`;
}

function releaseMarkup() {
  const files = Array.isArray(state.release?.files) ? state.release.files : [];
  return `<section class="homepage-quick-action">
    <p class="eyebrow">Final approval</p>
    <h2>Apply the approved homepage text?</h2>
    <p>Kairos will apply only the verified template below, read it back from Shopify, and preserve rollback evidence.</p>
    <div class="homepage-preview-evidence"><strong>${escapeHTML(files.map(file => file.filename).join(", ") || "templates/index.json")}</strong><span>No Liquid, CSS, asset, section, block, order, color, or layout changes are authorized.</span></div>
    ${state.error ? `<p class="homepage-quick-error">${escapeHTML(state.error)}</p>` : ""}
    <label class="homepage-quick-confirm danger"><input type="checkbox" data-homepage-live-approved><span>I authorize Kairos to apply and verify this exact approved homepage text update on the live Shopify theme.</span></label>
    <div class="homepage-quick-actions"><button class="primary" type="button" data-homepage-publish>Apply & Save Homepage Text</button><button type="button" data-homepage-back-preview>Back to Preview</button></div>
  </section>`;
}

function completionMarkup() {
  const release = state.release || {};
  const probe = release.publication?.liveProbe || release.rollback?.liveProbe || {};
  const rolledBack = String(release.status || "").startsWith("rolled-back");
  return `<section class="homepage-quick-action">
    <p class="eyebrow">${rolledBack ? "Rollback verified" : "Homepage text completed"}</p>
    <h2>${rolledBack ? "The previous homepage text was restored." : "The homepage text is live and verified."}</h2>
    <p>HTTP ${escapeHTML(probe.status ?? "—")} · ${escapeHTML(probe.title || "Shopify storefront verification recorded")}</p>
    ${probe.finalURL ? `<a class="homepage-live-link" href="${escapeAttribute(probe.finalURL)}" target="_blank" rel="noopener">Open Live Website ↗</a>` : ""}
    ${state.error ? `<p class="homepage-quick-error">${escapeHTML(state.error)}</p>` : ""}
    <div class="homepage-quick-actions"><button class="primary" type="button" data-homepage-start-over>Start Another Text Job</button>${!rolledBack && release.publication ? `<button class="danger" type="button" data-homepage-rollback>Emergency Rollback</button>` : ""}</div>
  </section>`;
}

function bind(host) {
  host.querySelector("[data-homepage-quick-build]")?.addEventListener("click", buildPreview);
  host.querySelector("[data-homepage-preview-approve]")?.addEventListener("click", approvePreview);
  host.querySelector("[data-homepage-publish]")?.addEventListener("click", publishRelease);
  host.querySelectorAll("[data-homepage-start-over]").forEach(button => button.addEventListener("click", startOver));
  host.querySelector("[data-homepage-back-preview]")?.addEventListener("click", () => { state.mode = "preview"; state.error = ""; saveState(); render(); });
  host.querySelector("[data-homepage-rollback]")?.addEventListener("click", rollbackRelease);
}

async function buildPreview() {
  const objective = document.querySelector("#homepage-quick-objective")?.value.trim() || "";
  if (objective.length < 3) { state.error = "Tell Kairos what you want the existing homepage text to communicate."; render(); return; }
  state.objective = objective;
  state.mode = "planning";
  state.error = "";
  state.execution = null;
  state.verification = null;
  state.release = null;
  saveState();
  render();
  try {
    const submittedPlan = await submitJob("/api/shopify/staging/plan/jobs", {
      objective,
      requestType: "homepage-preserve-design",
      intent: "homepage-preserve-design",
      homepageMode: "preserve-published-framework",
      sourceOfTruth: "published-main-theme",
      preserveExistingDesign: true,
      preservePublishedFramework: true,
      renderedTextRequired: true,
      activeOrderedSectionsOnly: true,
      activeOrderedBlocksOnly: true,
      templateTextOnly: true,
      fullRetoolConfirmed: false,
      structuralMutationAuthorized: false,
      styleMutationAuthorized: false,
      liquidMutationAuthorized: false,
      assetMutationAuthorized: false,
      canonicalPackageAuthorized: false,
      contentOnlyLocked: false,
    });
    const plan = await pollJob(submittedPlan, "plan");
    if (plan?.plan?.installationMode !== "published-main-template-text-settings-v1") throw new Error("Kairos did not return the published-framework text-only plan. Nothing was changed.");
    if (!Array.isArray(plan?.plan?.templateTextPatch?.operations) || plan.plan.templateTextPatch.operations.length < 1) throw new Error("Kairos did not produce a verified rendered homepage text change. Nothing was changed.");
    state.mode = "executing";
    render();
    const approval = {
      status: "approved",
      approvedAt: new Date().toISOString(),
      build: BUILD,
      planID: plan.planID,
      actionID: plan.actionID,
      targetThemeID: plan?.plan?.targetTheme?.gid || "",
      sourceHashes: plan?.plan?.sourceHashes || {},
      objective,
      scope: "published-main-template-text-settings-only",
    };
    const submittedExecution = await submitJob("/api/shopify/staging/execute/jobs", { plan, approval });
    state.execution = await pollJob(submittedExecution, "execute");
    if (state.execution?.execution?.publishedFrameworkPreserved !== true || state.execution?.execution?.templateTextOnly !== true) throw new Error("Kairos did not verify published-framework preservation. Nothing will be previewed.");
    if (Number(state.execution?.evidence?.textSettingReplacementCount || 0) < 1) throw new Error("Kairos did not verify an active rendered homepage text replacement. Nothing will be previewed.");
    state.mode = "verifying";
    render();
    state.verification = await requestJSON("/api/shopify/staging/visual-verification", { execution: state.execution.execution, result: state.execution, requestType: "homepage", path: "/" });
    state.mode = "preview";
    saveState();
    render();
  } catch (error) {
    state.mode = "input";
    state.error = error?.message || "Kairos could not build the homepage text preview.";
    saveState();
    render();
  }
}

async function approvePreview() {
  if (!document.querySelector("[data-homepage-preview-reviewed]")?.checked) { state.error = "Confirm that you reviewed the staging preview before continuing."; render(); return; }
  const reviewID = state.verification?.reviewID;
  if (!reviewID) { state.error = "The rendered preview receipt is missing. Build the preview again."; render(); return; }
  try {
    state.error = "";
    state.verification = await requestJSON("/api/shopify/staging/visual-approval", { reviewID, decision: "approved", actor: "Executive", notes: "Published-framework homepage text preview reviewed and approved." });
    state.release = await requestJSON("/api/shopify/homepage-release/prepare", { reviewID });
    state.mode = "release";
    saveState();
    render();
  } catch (error) { state.error = error?.message || "Kairos could not prepare the approved live text release."; render(); }
}

async function publishRelease() {
  if (!document.querySelector("[data-homepage-live-approved]")?.checked) { state.error = "Confirm the final live text application authorization."; render(); return; }
  if (!state.release?.releaseID) { state.error = "The approved release package is missing."; render(); return; }
  state.mode = "publishing";
  state.error = "";
  render();
  try {
    state.release = await requestJSON("/api/shopify/homepage-release/publish", { releaseID: state.release.releaseID, confirmation: "APPLY APPROVED HOMEPAGE", actor: "Executive" });
    state.mode = "complete";
    saveState();
    render();
  } catch (error) { state.mode = "release"; state.error = error?.message || "Kairos could not apply and verify the homepage text."; saveState(); render(); }
}

async function rollbackRelease() {
  if (!state.release?.releaseID) return;
  state.mode = "publishing";
  state.error = "";
  render();
  try {
    state.release = await requestJSON("/api/shopify/homepage-release/rollback", { releaseID: state.release.releaseID, confirmation: "ROLL BACK APPROVED HOMEPAGE", actor: "Executive" });
    state.mode = "complete";
  } catch (error) { state.mode = "complete"; state.error = error?.message || "Kairos could not verify the homepage rollback."; }
  saveState();
  render();
}

function startOver() { Object.assign(state, freshState()); sessionStorage.removeItem(STATE_KEY); render(); }
async function submitJob(url, payload) { const { response, body } = await fetchJSON(url, { method: "POST", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, credentials: "include", body: JSON.stringify(payload) }); if (!response.ok || !body?.jobID) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`); return body; }
async function pollJob(submitted, type) { if (submitted?.status === "completed" && submitted?.result) return submitted.result; const deadline = Date.now() + 600000; while (Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 800)); const { response, body } = await fetchJSON(submitted.pollURL || `/api/shopify/staging/${type}/jobs/${submitted.jobID}`, { credentials: "include" }); if (body?.status === "completed" && body?.result) return body.result; if (["needs-attention", "failed", "cancelled", "blocked"].includes(body?.status) || (!response.ok && response.status !== 202)) throw new Error(body?.error?.message || body?.summary || `${type} did not complete.`); } throw new Error("Kairos preserved the homepage text job but it did not finish within ten minutes. Run it again."); }
async function requestJSON(url, payload) { const { response, body } = await fetchJSON(url, { method: "POST", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, credentials: "include", body: JSON.stringify(payload) }); if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`); return body; }
async function fetchJSON(url, init = {}) { const response = await fetch(url, { cache: "no-store", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { summary: text }; } return { response, body }; }
function freshState() { return { mode: "input", objective: "", execution: null, verification: null, release: null, error: "" }; }
function loadState() { try { const value = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null"); if (!value || typeof value !== "object") return freshState(); const restored = { ...freshState(), ...value }; if (["planning", "executing", "verifying", "publishing"].includes(restored.mode)) restored.mode = "input"; return restored; } catch { return freshState(); } }
function saveState() { try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ mode: state.mode, objective: state.objective, verification: state.verification ? { reviewID: state.verification.reviewID, preview: state.verification.preview, automatedChecks: state.verification.automatedChecks } : null, release: state.release, execution: state.execution ? { summary: state.execution.summary, status: state.execution.status, execution: state.execution.execution, evidence: state.execution.evidence } : null, error: state.error })); } catch {} }
function escapeAttribute(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
window.KairosHomepageQuickAction = { build: BUILD, mount, reset: startOver };
