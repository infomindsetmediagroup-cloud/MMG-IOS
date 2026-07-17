import {
  cleanupDomainWorkspace,
  isDomainWorkspace,
  openDomainWorkspace,
} from "./workspace-runtime.js?v=20260717-4";

const BUILD = "kairos-command-hub-stable-v2-20260717-1";
const HEADER_ASSET = "https://cdn.shopify.com/s/files/1/0754/4337/2186/files/kairos-app-header.png?v=1783815598";
const WEBSITE_STATE_KEY = "kairos.website.stable-flow.v3";
const root = document.querySelector("#kairos-hub");

const CENTER_META = Object.freeze([
  { id: "knowledge", title: "Knowledge", description: "Doctrine, research, decisions, and reusable intelligence." },
  { id: "content", title: "Content", description: "Website, publishing, social, visual assets, and production." },
  { id: "business", title: "Business", description: "Products, revenue, growth, offers, and campaigns." },
  { id: "customers", title: "Customers", description: "Visitor activity, customer journeys, support, and delivery." },
  { id: "operations", title: "Operations", description: "Runtime, queues, approvals, releases, and system control." },
]);

const ACTION_ORDER = Object.freeze({
  knowledge: ["knowledge-library", "research-brief", "decision-record", "doctrine-vault", "intelligence-synthesis"],
  content: ["website", "manuscript-studio", "social-production", "publishing-studio", "creative-studio"],
  business: ["product-launch", "revenue-intelligence", "growth-plan", "offer-builder", "campaign-operations"],
  customers: ["visitor-activity", "customer-portal", "deliverables", "customer-journey", "support-intelligence"],
  operations: ["health", "work-queue", "release-control", "executive-briefing", "system-registry"],
});

const DESCRIPTIONS = Object.freeze({
  "knowledge-library": "Search authoritative MMG doctrine, specifications, research, and preserved decisions.",
  "research-brief": "Build an evidence-bound research brief and preserve its sources and synthesis.",
  "decision-record": "Record an approved executive decision, rationale, impact, and durable evidence.",
  "doctrine-vault": "Inspect canonical MMG and Kairos governance and operating doctrine.",
  "intelligence-synthesis": "Combine verified knowledge into an actionable executive synthesis.",
  website: "Plan, preview, approve, execute, verify, and roll back Shopify homepage work without changing the existing visual design.",
  "manuscript-studio": "Advance manuscripts through intake, editorial work, manufacturing, delivery, and submission.",
  "social-production": "Produce governed social packages and connector-ready publishing handoffs.",
  "publishing-studio": "Create and manage complete publication production packages.",
  "creative-studio": "Create and refine governed visual and production assets.",
  "product-launch": "Build and operate complete product launch packages.",
  "revenue-intelligence": "Review verified commerce performance and revenue evidence.",
  "growth-plan": "Build measurable growth plans with owned actions and evidence.",
  "offer-builder": "Define offers, customer outcomes, delivery models, and launch requirements.",
  "campaign-operations": "Coordinate campaigns, assets, timing, approvals, and measurement.",
  "visitor-activity": "Inspect verified storefront and customer activity evidence.",
  "customer-portal": "Manage customer projects, files, approvals, and status.",
  deliverables: "Inspect, package, verify, and release completed customer work.",
  "customer-journey": "Review customer experience stages, friction, and next actions.",
  "support-intelligence": "Organize support cases, recurring issues, and verified resolutions.",
  health: "Inspect the live runtime, capabilities, bindings, and deployment identity.",
  "work-queue": "Review active, queued, blocked, completed, and approval-gated work.",
  "release-control": "Prepare, approve, verify, publish, and roll back governed releases.",
  "executive-briefing": "Review approval-ready work and executive decisions.",
  "system-registry": "Inspect canonical services, routes, assets, ownership, and readiness.",
});

const state = {
  route: parseRoute(location.pathname),
  contracts: {},
  health: null,
  loading: true,
  error: "",
  website: loadWebsiteState(),
};

boot();

async function boot() {
  if (!root) return;
  renderShell();
  const [contractsResult, healthResult] = await Promise.allSettled([
    getJSON("/api/hub/contracts"),
    getJSON("/api/health"),
  ]);
  if (contractsResult.status === "fulfilled" && contractsResult.value?.actions) {
    state.contracts = contractsResult.value.actions;
  } else {
    state.error = "Kairos could not load the current child-workspace registry.";
  }
  if (healthResult.status === "fulfilled") state.health = healthResult.value;
  state.loading = false;
  render();
}

function renderShell() {
  root.innerHTML = `
    <header class="app-header" aria-label="Kairos header">
      <img class="app-header-image" src="${HEADER_ASSET}" alt="Kairos Operating System — Mindset Media Group">
    </header>
    <main id="command-view" class="command-view" tabindex="-1"></main>
  `;
}

function render() {
  cleanupDomainWorkspace();
  const view = root.querySelector("#command-view");
  if (!view) return;
  if (state.loading) {
    view.innerHTML = `<p class="status-line"><i class="spinner"></i>Loading Kairos Command Center.</p>`;
    return;
  }
  if (state.route.level === "center") view.innerHTML = renderCenter(state.route.centerID);
  else if (state.route.level === "workspace") view.innerHTML = renderWorkspace(state.route.centerID, state.route.actionID);
  else view.innerHTML = renderHome();
  bindView(view);
  activateWorkspace();
  document.title = pageTitle();
}

function renderHome() {
  const count = Object.keys(state.contracts).length;
  return `
    <section class="hero stable-hero">
      <div>
        <p class="eyebrow">Executive Command Center</p>
        <h1>One objective.<br>Coordinated execution.</h1>
        <p class="hero-copy">Five operating centers. ${count || 25} current child workspaces loaded from the live Kairos runtime registry.</p>
      </div>
    </section>
    ${state.error ? `<p class="error">${escapeHTML(state.error)}</p>` : ""}
    <div class="section-head">
      <div><p class="eyebrow">Operating Centers</p><h2>Choose where Kairos should work</h2></div>
      <p>Every workspace opens through the current production contract.</p>
    </div>
    <section class="parent-grid">${CENTER_META.map(renderParentCard).join("")}</section>
  `;
}

function renderParentCard(center) {
  const count = actionsForCenter(center.id).length;
  return `
    <button class="parent-card" type="button" data-center="${center.id}" data-route-center="${center.id}">
      <div class="card-top"><span class="parent-icon" aria-hidden="true"></span></div>
      <h3>${escapeHTML(center.title)}</h3>
      <p>${escapeHTML(center.description)}</p>
      <div class="card-foot"><b>${count} current workspaces</b><span>Open center →</span></div>
    </button>
  `;
}

function renderCenter(centerID) {
  const center = centerMeta(centerID);
  if (!center) return renderHome();
  const actions = actionsForCenter(centerID);
  return `
    <section class="workspace stable-center">
      <header class="workspace-head">
        <div><p class="eyebrow">${escapeHTML(center.title)} Center · ${actions.length} current workspaces</p><h2>Choose an action</h2></div>
        <button class="back" type="button" data-route-home>Return to Command Center</button>
      </header>
      <div class="children">${actions.map(([id, contract]) => renderChildCard(center, id, contract)).join("")}</div>
    </section>
  `;
}

function renderChildCard(center, actionID, contract) {
  const title = contract?.title || labelize(actionID);
  return `
    <article class="child-card" data-action-id="${escapeAttribute(actionID)}">
      <p class="eyebrow">${escapeHTML(center.title)}</p>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(DESCRIPTIONS[actionID] || `${contract?.owner || "Kairos"} operational workspace.`)}</p>
      <button class="child-action" type="button" data-route-workspace="${escapeAttribute(actionID)}">${escapeHTML(buttonLabel(actionID, title))}</button>
    </article>
  `;
}

function renderWorkspace(centerID, actionID) {
  const center = centerMeta(centerID);
  const contract = state.contracts[actionID];
  if (!center || !contract || contract.center !== centerID) return renderHome();
  const title = contract.title || labelize(actionID);
  return `
    <section class="workspace stable-workspace">
      <header class="workspace-head">
        <div><p class="eyebrow">${escapeHTML(center.title)} Center</p><h2>${escapeHTML(title)}</h2></div>
        <button class="back" type="button" data-route-center="${escapeAttribute(centerID)}">Return to ${escapeHTML(center.title)} Center</button>
      </header>
      <section class="job">
        ${actionID === "website" ? renderWebsite() : actionID === "health" ? renderHealth() : renderDomainHost(actionID, title)}
      </section>
    </section>
  `;
}

function renderDomainHost(actionID, title) {
  if (!isDomainWorkspace(actionID)) {
    return `<p class="error">${escapeHTML(title)} is registered but its workspace module is unavailable.</p>`;
  }
  return `<div id="workspace-runtime-host" class="workspace-runtime-host" data-action="${escapeAttribute(actionID)}" data-state="loading"><p class="workspace-runtime-state"><i></i>Connecting ${escapeHTML(title)} to its operational runtime…</p></div>`;
}

function renderHealth() {
  const health = state.health || {};
  const runtime = health.operationalRuntime || {};
  const capabilities = health.capabilities || {};
  return `
    <p class="eyebrow">Live runtime</p>
    <h3>${escapeHTML(health.status || "Runtime status unavailable")}</h3>
    <div class="website-review-grid">
      <article><h4>Build</h4><p>${escapeHTML(health.build || health.runtime || "Unknown")}</p><small>${escapeHTML(runtime.orchestration || "Runtime orchestration not reported")}</small></article>
      <article><h4>Persistence</h4><p>${escapeHTML(runtime.persistence || "Unknown")}</p><small>${Object.keys(capabilities).length} capabilities reported</small></article>
    </div>
    ${state.error ? `<p class="error">${escapeHTML(state.error)}</p>` : ""}
    <div class="job-actions"><button class="primary" type="button" data-refresh-health>Refresh Runtime</button></div>
  `;
}

function renderWebsite() {
  const w = state.website;
  if (w.mode === "planning") return `${websiteStages("plan")}<p class="status-line"><i class="spinner"></i>Inspecting the current Shopify staging source and preparing a design-preserving proposal.</p>`;
  if (w.mode === "executing") return `${websiteStages("build")}<p class="status-line"><i class="spinner"></i>Building and verifying the approved non-live preview.</p>`;
  if (w.mode === "previewing") return `${websiteStages("preview")}<p class="status-line"><i class="spinner"></i>Checking the rendered staging storefront.</p>`;
  if (w.mode === "publishing") return `${websiteStages("publish")}<p class="status-line"><i class="spinner"></i>Applying the approved preview and verifying Shopify read-back.</p>`;
  if (w.mode === "review") return renderWebsiteReview(w);
  if (w.mode === "preview") return renderWebsitePreview(w);
  if (w.mode === "release") return renderWebsiteRelease(w);
  if (w.mode === "complete") return renderWebsiteComplete(w);
  return `
    ${websiteStages("objective")}
    <p>Describe the homepage outcome. Kairos will preserve the current colors, typography, buttons, pills, cards, spacing, CSS, assets, header, and footer. Only the approved non-live staging package can proceed.</p>
    <label class="objective-label" for="website-objective">Homepage objective</label>
    <textarea class="objective" id="website-objective" maxlength="12000" placeholder="Describe the homepage changes and customer journey.">${escapeHTML(w.objective || "")}</textarea>
    <label class="website-confirm"><input type="checkbox" data-website-staging-confirm><span>I authorize work only on the verified unpublished staging theme. The existing visual design must remain unchanged.</span></label>
    ${w.error ? `<p class="error">${escapeHTML(w.error)}</p>` : ""}
    <div class="job-actions"><button class="primary" type="button" data-website-plan>Prepare Design-Preserving Proposal</button></div>
  `;
}

function websiteStages(active) {
  const stages = [["objective", "1 · Objective"], ["plan", "2 · Proposal"], ["build", "3 · Build Preview"], ["preview", "4 · Review"], ["publish", "5 · Apply & Verify"]];
  const index = Math.max(0, stages.findIndex(([id]) => id === active));
  return `<div class="website-stage-row">${stages.map(([id, label], i) => `<span class="website-stage ${i < index ? "done" : i === index ? "active" : ""}">${label}</span>`).join("")}</div>`;
}

function renderWebsiteReview(w) {
  const plan = w.plan || {};
  const changes = Array.isArray(plan?.plan?.changes) ? plan.plan.changes.filter(change => change?.changeType !== "no-change") : [];
  return `
    ${websiteStages("plan")}
    <div class="website-status-banner"><span>Design-preserving staging proposal</span><strong>${escapeHTML(plan.summary || "Proposal prepared")}</strong></div>
    <p>${escapeHTML(plan?.plan?.strategy || "Kairos prepared a source-bound staging proposal.")}</p>
    <div class="website-review-grid">
      <article><h4>Approved scope</h4>${changes.length ? `<ul>${changes.slice(0, 12).map(change => `<li><strong>${escapeHTML(change.filename || "Homepage")}</strong> — ${escapeHTML(change.purpose || change.expectedOutcome || "Approved change")}</li>`).join("")}</ul>` : "<p>No executable changes were returned.</p>"}</article>
      <article><h4>Visual lock</h4><p>Current theme styling remains authoritative.</p><small>No colors, typography, pills, buttons, cards, CSS, assets, design tokens, or theme schemes are authorized.</small></article>
    </div>
    ${w.error ? `<p class="error">${escapeHTML(w.error)}</p>` : ""}
    <div class="job-actions"><button class="primary" type="button" data-website-execute ${changes.length ? "" : "disabled"}>Approve & Build Preview</button><button class="secondary" type="button" data-website-revise>Revise Request</button></div>
  `;
}

function renderWebsitePreview(w) {
  const review = w.verification || {};
  const checks = Array.isArray(review.automatedChecks) ? review.automatedChecks : [];
  const preview = review.preview || {};
  return `
    ${websiteStages("preview")}
    <div class="website-status-banner preview"><span>Non-live preview ready</span><strong>${escapeHTML(preview.targetThemeName || "Kairos Staging")}</strong></div>
    <div class="website-preview-links"><a href="${escapeAttribute(preview.mobileURL || preview.url || "#")}" target="_blank" rel="noopener">Open Mobile Preview ↗</a><a href="${escapeAttribute(preview.desktopURL || preview.url || "#")}" target="_blank" rel="noopener">Open Desktop Preview ↗</a></div>
    <div class="website-checks">${checks.map(check => `<div class="website-check ${check.passed ? "passed" : "review"}"><b>${check.passed ? "✓" : "!"}</b><span><strong>${escapeHTML(labelize(check.id))}</strong><small>${escapeHTML(check.detail || "")}</small></span></div>`).join("") || "<p>Rendered preview is ready for review.</p>"}</div>
    <label class="website-confirm"><input type="checkbox" data-website-preview-reviewed><span>I reviewed the exact staging preview and approve it for live release preparation.</span></label>
    ${w.error ? `<p class="error">${escapeHTML(w.error)}</p>` : ""}
    <div class="job-actions"><button class="primary" type="button" data-website-preview-approve>Approve Preview & Continue</button><button class="secondary" type="button" data-website-preview-retry>Refresh Preview Checks</button><button class="secondary" type="button" data-website-revise>Request Revision</button></div>
  `;
}

function renderWebsiteRelease(w) {
  const release = w.release || {};
  const files = Array.isArray(release.files) ? release.files : [];
  return `
    ${websiteStages("publish")}
    <div class="website-status-banner approved"><span>Preview approved</span><strong>Ready to apply and save</strong></div>
    <div class="website-review-grid"><article><h4>Live target</h4><p>${escapeHTML(release.liveTheme?.name || "Verified Shopify MAIN theme")}</p></article><article><h4>Approved files</h4><p>${escapeHTML(files.map(file => file.filename).join(", ") || "Homepage package")}</p></article></div>
    <label class="website-confirm danger"><input type="checkbox" data-website-live-approved><span>I authorize Kairos to apply this exact preview, save it in Shopify, verify the read-back, and preserve rollback evidence.</span></label>
    ${w.error ? `<p class="error">${escapeHTML(w.error)}</p>` : ""}
    <div class="job-actions"><button class="primary" type="button" data-website-publish>Apply & Save Website</button><button class="secondary" type="button" data-website-back-preview>Back to Preview</button></div>
  `;
}

function renderWebsiteComplete(w) {
  const release = w.release || {};
  const probe = release.publication?.liveProbe || release.rollback?.liveProbe || {};
  const rolledBack = String(release.status || "").startsWith("rolled-back");
  return `
    ${websiteStages("publish")}
    <div class="website-status-banner ${rolledBack ? "rollback" : "success"}"><span>${escapeHTML(release.status || "completed")}</span><strong>${rolledBack ? "Previous homepage restored" : "Website applied, saved, and verified"}</strong></div>
    <div class="website-review-grid"><article><h4>Live verification</h4><p>HTTP ${escapeHTML(probe.status ?? "—")} · ${escapeHTML(probe.title || "Storefront title unavailable")}</p></article><article><h4>Release receipt</h4><p>${escapeHTML(release.releaseID || "Recorded")}</p></article></div>
    ${probe.finalURL ? `<a class="website-live-link" href="${escapeAttribute(probe.finalURL)}" target="_blank" rel="noopener">Open Live Website ↗</a>` : ""}
    ${w.error ? `<p class="error">${escapeHTML(w.error)}</p>` : ""}
    <div class="job-actions">${!rolledBack && release.publication ? `<label class="website-confirm rollback"><input type="checkbox" data-website-rollback-approved><span>Emergency rollback: restore the protected pre-release homepage package.</span></label><button class="secondary danger" type="button" data-website-rollback>Roll Back This Release</button>` : ""}<button class="primary" type="button" data-website-new>Start Another Website Job</button></div>
  `;
}

function bindView(view) {
  view.querySelectorAll("[data-route-home]").forEach(button => button.addEventListener("click", () => navigate({ level: "home" })));
  view.querySelectorAll("[data-route-center]").forEach(button => button.addEventListener("click", () => navigate({ level: "center", centerID: button.dataset.routeCenter })));
  view.querySelectorAll("[data-route-workspace]").forEach(button => button.addEventListener("click", () => navigate({ level: "workspace", centerID: state.route.centerID, actionID: button.dataset.routeWorkspace })));
  view.querySelector("[data-refresh-health]")?.addEventListener("click", refreshHealth);
  view.querySelector("[data-website-plan]")?.addEventListener("click", prepareWebsitePlan);
  view.querySelector("[data-website-execute]")?.addEventListener("click", executeWebsitePlan);
  view.querySelector("[data-website-preview-approve]")?.addEventListener("click", approveWebsitePreview);
  view.querySelector("[data-website-preview-retry]")?.addEventListener("click", prepareWebsitePreview);
  view.querySelector("[data-website-publish]")?.addEventListener("click", publishWebsiteRelease);
  view.querySelector("[data-website-back-preview]")?.addEventListener("click", () => setWebsiteMode("preview"));
  view.querySelector("[data-website-rollback]")?.addEventListener("click", rollbackWebsiteRelease);
  view.querySelector("[data-website-new]")?.addEventListener("click", startNewWebsiteJob);
  view.querySelectorAll("[data-website-revise]").forEach(button => button.addEventListener("click", startWebsiteRevision));
}

function activateWorkspace() {
  if (state.route.level !== "workspace" || !isDomainWorkspace(state.route.actionID)) return;
  openDomainWorkspace(state.route.actionID, { centerID: state.route.centerID }).catch(error => {
    const host = document.querySelector("#workspace-runtime-host");
    if (host) host.innerHTML = `<p class="error">${escapeHTML(error?.message || "The workspace could not open.")}</p>`;
  });
}

async function refreshHealth() {
  state.error = "";
  try { state.health = await getJSON("/api/health"); }
  catch (error) { state.error = error.message || "Runtime health could not be refreshed."; }
  render();
}

async function prepareWebsitePlan() {
  const objective = root.querySelector("#website-objective")?.value.trim() || "";
  const confirmed = root.querySelector("[data-website-staging-confirm]")?.checked === true;
  state.website.objective = objective;
  if (objective.length < 3) return websiteFailure("Describe the homepage outcome before Kairos begins.");
  if (!confirmed) return websiteFailure("Confirm the staging-only, design-preserving boundary before preparing the proposal.");
  state.website.mode = "planning";
  state.website.error = "";
  saveWebsiteState();
  render();
  try {
    const submitted = await submitJob("/api/shopify/staging/plan/jobs", {
      objective,
      requestType: "homepage-preserve-design",
      intent: "homepage-preserve-design",
      mode: "published-main-framework-preserve-design",
      fullRetoolConfirmed: false,
      structuralMutationAuthorized: false,
      styleMutationAuthorized: false,
      visualMutationAuthorized: false,
      cssMutationAuthorized: false,
      assetMutationAuthorized: false,
      designTokenMutationAuthorized: false,
      themeSchemeMutationAuthorized: false,
      preserveExistingDesign: true,
      preserveVisualDesign: true,
      preserveColors: true,
      preserveTypography: true,
      preservePillsAndButtons: true,
      preserveCardsAndSpacing: true,
      keepNativeHeader: true,
      keepNativeFooter: true,
      contentOnlyLocked: true,
    });
    state.website.plan = await pollJob(submitted, "plan");
    state.website.mode = "review";
  } catch (error) {
    state.website.mode = "input";
    state.website.error = error.message || "Kairos could not prepare the staging proposal.";
  }
  saveWebsiteState();
  render();
}

async function executeWebsitePlan() {
  const plan = state.website.plan;
  if (!plan) return;
  state.website.mode = "executing";
  state.website.error = "";
  saveWebsiteState();
  render();
  try {
    const approval = {
      status: "approved",
      approvedAt: new Date().toISOString(),
      build: BUILD,
      planID: plan.planID,
      actionID: plan.actionID,
      targetThemeID: plan?.plan?.targetTheme?.gid || "",
      sourceHashes: plan?.plan?.sourceHashes || {},
      objective: plan.objective || state.website.objective,
      styleMutationAuthorized: false,
      visualMutationAuthorized: false,
      keepNativeThemeStyling: true,
    };
    const submitted = await submitJob("/api/shopify/staging/execute/jobs", {
      plan,
      approval,
      websiteRetool: {
        nativeThemeDecision: "keep-current",
        selectedChanges: [],
        preserveExistingDesign: true,
        preserveVisualDesign: true,
        styleMutationAuthorized: false,
        visualMutationAuthorized: false,
      },
    });
    state.website.execution = await pollJob(submitted, "execute");
    await prepareWebsitePreview();
    return;
  } catch (error) {
    state.website.mode = "review";
    state.website.error = error.message || "Kairos could not build the staging preview.";
  }
  saveWebsiteState();
  render();
}

async function prepareWebsitePreview() {
  const execution = state.website.execution;
  if (!execution) return websiteFailure("The verified staging execution receipt is missing.", "review");
  state.website.mode = "previewing";
  state.website.error = "";
  saveWebsiteState();
  render();
  try {
    state.website.verification = await postJSON("/api/shopify/staging/visual-verification", { execution: execution.execution, result: execution, requestType: "homepage", path: "/" });
    state.website.mode = "preview";
  } catch (error) {
    state.website.mode = "preview";
    state.website.error = error.message || "Kairos could not prepare the rendered preview.";
  }
  saveWebsiteState();
  render();
}

async function approveWebsitePreview() {
  if (!root.querySelector("[data-website-preview-reviewed]")?.checked) return websiteFailure("Confirm that you reviewed the staging preview before continuing.", "preview");
  const review = state.website.verification;
  if (!review?.reviewID) return websiteFailure("Refresh the preview checks before approving this release.", "preview");
  try {
    state.website.verification = await postJSON("/api/shopify/staging/visual-approval", { reviewID: review.reviewID, decision: "approved", actor: "Executive", notes: "Rendered staging preview reviewed and approved in Website Retool." });
    state.website.release = await postJSON("/api/shopify/homepage-release/prepare", { reviewID: review.reviewID });
    state.website.mode = "release";
    state.website.error = "";
  } catch (error) {
    state.website.mode = "preview";
    state.website.error = error.message || "Kairos could not prepare the approved live release.";
  }
  saveWebsiteState();
  render();
}

async function publishWebsiteRelease() {
  if (!root.querySelector("[data-website-live-approved]")?.checked) return websiteFailure("Confirm the final live application and save authorization before continuing.", "release");
  const release = state.website.release;
  if (!release?.releaseID) return websiteFailure("The approved homepage release package is missing.", "release");
  state.website.mode = "publishing";
  state.website.error = "";
  saveWebsiteState();
  render();
  try {
    state.website.release = await postJSON("/api/shopify/homepage-release/publish", { releaseID: release.releaseID, confirmation: "APPLY APPROVED HOMEPAGE", actor: "Executive" });
    state.website.mode = "complete";
  } catch (error) {
    state.website.mode = "release";
    state.website.error = error.message || "Kairos could not apply and verify the approved homepage.";
  }
  saveWebsiteState();
  render();
}

async function rollbackWebsiteRelease() {
  if (!root.querySelector("[data-website-rollback-approved]")?.checked) return websiteFailure("Confirm the emergency rollback before restoring the previous homepage.", "complete");
  const release = state.website.release;
  if (!release?.releaseID) return;
  state.website.mode = "publishing";
  state.website.error = "";
  render();
  try {
    state.website.release = await postJSON("/api/shopify/homepage-release/rollback", { releaseID: release.releaseID, confirmation: "ROLL BACK APPROVED HOMEPAGE", actor: "Executive" });
    state.website.mode = "complete";
  } catch (error) {
    state.website.mode = "complete";
    state.website.error = error.message || "Kairos could not verify the homepage rollback.";
  }
  saveWebsiteState();
  render();
}

function startWebsiteRevision() {
  state.website = { ...freshWebsiteState(), objective: state.website.objective };
  saveWebsiteState();
  render();
}

function startNewWebsiteJob() {
  state.website = freshWebsiteState();
  sessionStorage.removeItem(WEBSITE_STATE_KEY);
  render();
}

function setWebsiteMode(mode) {
  state.website.mode = mode;
  state.website.error = "";
  saveWebsiteState();
  render();
}

function websiteFailure(message, mode = "input") {
  state.website.mode = mode;
  state.website.error = message;
  saveWebsiteState();
  render();
}

function navigate(route) {
  cleanupDomainWorkspace();
  state.route = route;
  history.pushState(route, "", routePath(route));
  render();
}

window.addEventListener("popstate", () => {
  state.route = parseRoute(location.pathname);
  render();
});

function actionsForCenter(centerID) {
  const order = ACTION_ORDER[centerID] || [];
  return order.map(id => [id, state.contracts[id]]).filter(([, contract]) => contract && contract.center === centerID);
}

function centerMeta(id) { return CENTER_META.find(center => center.id === id) || null; }
function parseRoute(path) {
  const parts = String(path || "/").split("/").filter(Boolean);
  if (parts[0] === "center" && parts[1]) return parts[2] ? { level: "workspace", centerID: decodeURIComponent(parts[1]), actionID: decodeURIComponent(parts[2]) } : { level: "center", centerID: decodeURIComponent(parts[1]), actionID: null };
  return { level: "home", centerID: null, actionID: null };
}
function routePath(route) {
  if (route.level === "workspace") return `/center/${encodeURIComponent(route.centerID)}/${encodeURIComponent(route.actionID)}`;
  if (route.level === "center") return `/center/${encodeURIComponent(route.centerID)}`;
  return "/";
}
function pageTitle() {
  if (state.route.level === "workspace") return `${state.contracts[state.route.actionID]?.title || "Workspace"} · Kairos`;
  if (state.route.level === "center") return `${centerMeta(state.route.centerID)?.title || "Center"} Center · Kairos`;
  return "Kairos Command Center";
}
function buttonLabel(actionID, title) {
  if (actionID === "website") return "Open Website Retool";
  if (actionID === "health") return "Open Runtime Health";
  if (actionID === "work-queue") return "Open My Work";
  return `Open ${title}`;
}
function labelize(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function escapeAttribute(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

async function getJSON(url) {
  const response = await fetch(url, { cache: "no-store", credentials: "include" });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`);
  return body;
}
async function postJSON(url, payload) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, credentials: "include", cache: "no-store", body: JSON.stringify(payload) });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`);
  return body;
}
async function submitJob(url, payload) {
  const body = await postJSON(url, payload);
  if (!body?.jobID) throw new Error(body?.error?.message || body?.summary || "Kairos returned no job identifier.");
  return body;
}
async function pollJob(submitted, type) {
  if (submitted?.status === "completed" && submitted?.result) return submitted.result;
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 750));
    const response = await fetch(submitted.pollURL || `/api/shopify/staging/${type}/jobs/${submitted.jobID}`, { cache: "no-store", credentials: "include" });
    const body = await readJSON(response);
    if (body?.status === "completed" && body?.result) return body.result;
    if (["needs-attention", "failed", "cancelled", "blocked"].includes(body?.status) || (!response.ok && response.status !== 202)) throw new Error(body?.error?.message || body?.summary || `${type} did not complete.`);
  }
  throw new Error("Kairos is still working. Reopen Website Retool to continue monitoring the preserved job.");
}
async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { summary: text }; }
}
function freshWebsiteState() { return { mode: "input", objective: "", plan: null, execution: null, verification: null, release: null, error: "" }; }
function loadWebsiteState() {
  try {
    const value = JSON.parse(sessionStorage.getItem(WEBSITE_STATE_KEY) || "null");
    if (!value || typeof value !== "object") return freshWebsiteState();
    const restored = { ...freshWebsiteState(), ...value };
    if (["planning", "executing", "previewing", "publishing"].includes(restored.mode)) restored.mode = restored.plan ? "review" : "input";
    return restored;
  } catch { return freshWebsiteState(); }
}
function saveWebsiteState() {
  try { sessionStorage.setItem(WEBSITE_STATE_KEY, JSON.stringify(state.website)); } catch {}
}

window.KairosCommandHub = {
  build: BUILD,
  openCenter: centerID => navigate({ level: "center", centerID }),
  openWorkspace: (centerID, actionID) => navigate({ level: "workspace", centerID, actionID }),
  home: () => navigate({ level: "home" }),
};
