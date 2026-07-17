(() => {
  "use strict";

  const BUILD = "kairos-command-center-safe-20260717-1";
  const root = document.querySelector("#kairos-hub");
  if (!root) return;

  const centers = [
    {
      id: "knowledge",
      icon: "🧠",
      title: "Knowledge",
      description: "Doctrine, research, decisions, and reusable intelligence.",
      children: [
        ["Knowledge Library", "Search authoritative MMG knowledge.", "Open Library", "knowledge-library"],
        ["Research Brief", "Build a structured evidence-ready brief.", "Start Research", "research-brief"],
        ["Decision Record", "Preserve an approved decision and its impact.", "Record Decision", "decision-record"],
        ["Doctrine Vault", "Review canonical MMG and Kairos operating doctrine.", "Open Doctrine", "doctrine-vault"],
        ["Intelligence Synthesis", "Combine verified knowledge into an actionable synthesis.", "Build Synthesis", "intelligence-synthesis"]
      ]
    },
    {
      id: "content",
      icon: "🎬",
      title: "Content",
      description: "Website, publishing, social, visual assets, and production.",
      children: [
        ["Website Retool", "Plan, approve, execute, and verify staging website changes.", "Start Website Retool", "website"],
        ["Manuscript Studio", "Advance manuscripts into governed production.", "Open Manuscript Studio", "manuscript-studio"],
        ["Social Production", "Build governed social content packages.", "Open Social Production", "social-production"],
        ["Publishing Studio", "Create publication production packages.", "Create Publication", "publishing-studio"],
        ["Creative Studio", "Create governed creative production briefs.", "Create Asset", "creative-studio"]
      ]
    },
    {
      id: "business",
      icon: "💼",
      title: "Business",
      description: "Products, revenue, growth, offers, and campaigns.",
      children: [
        ["Product Launch", "Build a complete launch package.", "Start Product Launch", "product-launch"],
        ["Revenue Intelligence", "Review verified commerce performance.", "Run Revenue Review", "revenue-intelligence"],
        ["Growth Plan", "Build a measurable MMG growth plan.", "Build Growth Plan", "growth-plan"],
        ["Offer Builder", "Shape an offer, value proposition, and delivery model.", "Build Offer", "offer-builder"],
        ["Campaign Operations", "Coordinate campaign objectives, assets, timing, and measurement.", "Open Campaign", "campaign-operations"]
      ]
    },
    {
      id: "customers",
      icon: "👥",
      title: "Customers",
      description: "Visitor activity, customer journeys, support, and delivery.",
      children: [
        ["Visitor Activity", "Inspect verified visitor evidence.", "Review Activity", "visitor-activity"],
        ["Customer Portal", "Open customer projects and approvals.", "Open Customer Hub", "customer-portal"],
        ["Deliverables", "Inspect completed customer work.", "View Deliverables", "deliverables"],
        ["Customer Journey", "Review the end-to-end customer experience.", "Open Journey", "customer-journey"],
        ["Support Intelligence", "Organize support needs, issues, and resolutions.", "Review Support", "support-intelligence"]
      ]
    },
    {
      id: "operations",
      icon: "⚙️",
      title: "Operations",
      description: "Runtime, queues, approvals, releases, and system control.",
      children: [
        ["Runtime Health", "Inspect live runtime and capabilities.", "Refresh Health", "health"],
        ["Work Queue", "Inspect active and completed work.", "View Queue", "work-queue"],
        ["Release Control", "Inspect approvals, verification, and rollback.", "Open Releases", "release-control"],
        ["Executive Briefing", "Review approval-ready work and governed decisions.", "Open Briefing", "executive-briefing"],
        ["System Registry", "Inspect canonical services, routes, assets, and ownership.", "Open Registry", "system-registry"]
      ]
    }
  ];

  const state = {
    route: parseRoute(location.pathname),
    working: false,
    error: "",
    result: null,
    health: null,
    website: loadWebsiteState()
  };

  window.KairosCommandHub = {
    build: BUILD,
    home: () => navigate({ level: "home", centerID: null, actionID: null }),
    openCenter: centerID => navigate({ level: "center", centerID, actionID: null }),
    openWorkspace: (centerID, actionID) => navigate({ level: "workspace", centerID, actionID })
  };

  window.addEventListener("popstate", () => {
    state.route = parseRoute(location.pathname);
    state.error = "";
    state.result = null;
    render();
  });

  root.dataset.safeBoot = BUILD;
  render();
  refreshHealth();

  function render() {
    const route = state.route;
    if (route.level === "workspace") renderWorkspace();
    else if (route.level === "center") renderCenter();
    else renderHome();
    bind();
    document.documentElement.dataset.kairosBoot = "ready";
  }

  function renderHome() {
    root.innerHTML = `
      <main id="command-view" class="command-view">
        <section class="hero">
          <div>
            <p class="eyebrow">Executive Command Center</p>
            <h1>One objective.<br>Coordinated execution.</h1>
            <p class="hero-copy">Five operating centers. Every workspace opens through one stable command surface.</p>
          </div>
          <aside class="pulse-panel">
            <div class="pulse-head"><strong>Operating signal</strong><span class="quiet" data-runtime-signal>Connecting</span></div>
            <div class="wave" data-runtime-wave>${Array.from({ length: 16 }, (_, i) => `<i style="--h:${35 + ((i * 19) % 58)}%;--d:-${i * 0.09}s"></i>`).join("")}</div>
          </aside>
        </section>
        <section class="metrics">
          <article class="metric" data-runtime-card><span>Runtime</span><strong data-runtime-value>Checking</strong><small data-runtime-detail>Connecting to Cloudflare</small></article>
          <article class="metric" data-state="live"><span>Parent centers</span><strong>5</strong><small>Canonical operating centers</small></article>
          <article class="metric" data-state="live"><span>Child workspaces</span><strong>25</strong><small>Permanent operational entry points</small></article>
          <article class="metric" data-state="live"><span>App shell</span><strong>Ready</strong><small>${BUILD}</small></article>
        </section>
        <div class="section-head"><div><p class="eyebrow">Operating Centers</p><h2>Choose where Kairos should work</h2></div></div>
        <section class="parent-grid">${centers.map(parentCard).join("")}</section>
      </main>`;
    paintHealth();
  }

  function renderCenter() {
    const center = currentCenter();
    if (!center) return renderHome();
    root.innerHTML = `
      <main id="command-view" class="command-view">
        <section class="route-page center-page">
          <nav class="route-breadcrumb"><button type="button" data-home>Command Center</button><span>›</span><strong>${escapeHTML(center.title)} Center</strong></nav>
          <header class="route-hero"><div><p class="eyebrow">${escapeHTML(center.title)} Center · 5 workspaces</p><h1>${escapeHTML(center.title)}</h1><p>${escapeHTML(center.description)}</p></div></header>
          <div class="section-head"><div><p class="eyebrow">Child Workspaces</p><h2>Choose the directive to execute</h2></div><button class="back" type="button" data-home>Return to Command Center</button></div>
          <section class="children routed-children">${center.children.map(child => childCard(center, child)).join("")}</section>
        </section>
      </main>`;
  }

  function renderWorkspace() {
    const center = currentCenter();
    const child = currentChild();
    if (!center || !child) return renderHome();
    const actionID = child[3];
    root.innerHTML = `
      <main id="command-view" class="command-view">
        <section class="route-page child-workspace-page">
          <nav class="route-breadcrumb"><button type="button" data-home>Command Center</button><span>›</span><button type="button" data-center="${escapeAttribute(center.id)}">${escapeHTML(center.title)} Center</button><span>›</span><strong>${escapeHTML(child[0])}</strong></nav>
          <header class="workspace-head routed-workspace-head"><div><p class="eyebrow">${escapeHTML(center.title)} Center</p><h1>${escapeHTML(child[0])}</h1><p>${escapeHTML(child[1])}</p></div><button class="back" type="button" data-center="${escapeAttribute(center.id)}">Return to ${escapeHTML(center.title)} Center</button></header>
          <section class="job routed-job">${actionID === "website" ? websiteBody() : genericBody(child)}</section>
        </section>
      </main>`;
  }

  function parentCard(center) {
    return `<button class="parent-card" type="button" data-center="${escapeAttribute(center.id)}"><div class="card-top"><span class="parent-icon">${center.icon}</span><span class="card-signal"><i></i>READY</span></div><h3>${escapeHTML(center.title)}</h3><p>${escapeHTML(center.description)}</p><div class="mini-meter"><span style="--meter:100%"></span></div><div class="card-foot"><b>Operational</b><span>Open center →</span></div></button>`;
  }

  function childCard(center, child) {
    return `<article class="child-card"><div class="child-readiness"><p class="eyebrow">${escapeHTML(center.title)}</p><span>READY</span></div><h3>${escapeHTML(child[0])}</h3><p>${escapeHTML(child[1])}</p><button class="child-action" type="button" data-workspace="${escapeAttribute(child[3])}">${escapeHTML(child[2])}</button></article>`;
  }

  function genericBody(child) {
    if (state.working) return `<p class="status-line"><i class="spinner"></i>Kairos is executing this directive.</p>`;
    if (state.result) return resultPanel(state.result);
    return `
      <p>${escapeHTML(child[1])}</p>
      <label class="objective-label" for="directive-objective">Objective</label>
      <textarea class="objective" id="directive-objective" maxlength="12000" placeholder="Describe what Kairos should do in this workspace."></textarea>
      ${state.error ? `<p class="error">${escapeHTML(state.error)}</p>` : ""}
      <div class="job-actions"><button class="primary" type="button" data-run-directive>${escapeHTML(child[2])}</button></div>`;
  }

  function websiteBody() {
    const w = state.website;
    if (w.mode === "working") return `${websiteStages("plan")}<p class="status-line"><i class="spinner"></i>Inspecting Shopify staging and preparing the execution package.</p>`;
    if (w.mode === "executing") return `${websiteStages("stage")}<p class="status-line"><i class="spinner"></i>Building and verifying the non-live Shopify preview.</p>`;
    if (w.mode === "previewing") return `${websiteStages("preview")}<p class="status-line"><i class="spinner"></i>Preparing the rendered staging preview.</p>`;
    if (w.mode === "review") return websitePlanReview(w);
    if (w.mode === "preview") return websitePreview(w);
    if (w.mode === "release") return websiteRelease(w);
    if (w.mode === "complete") return websiteCompletion(w);
    const full = w.requestType === "full-retool";
    return `
      ${websiteStages("objective")}
      <p>Describe the website outcome. Kairos will inspect the real Shopify source, create a non-live staging proposal, and stop for approval.</p>
      <label class="objective-label" for="website-request-type">Change scope</label>
      <select class="website-scope-select" id="website-request-type"><option value="content-only"${full ? "" : " selected"}>Content only — preserve structure and styling</option><option value="full-retool"${full ? " selected" : ""}>Homepage copy + approved native header/footer changes</option></select>
      <label class="website-confirm website-scope-confirm"><input type="checkbox" data-full-confirm><span>I authorize bounded structural and style changes on the non-live Kairos Staging theme only.</span></label>
      <label class="objective-label" for="website-objective">Website objective</label>
      <textarea class="objective" id="website-objective" maxlength="12000" placeholder="Describe the homepage changes Kairos should prepare.">${escapeHTML(w.objective)}</textarea>
      ${state.error ? `<p class="error">${escapeHTML(state.error)}</p>` : ""}
      <div class="job-actions"><button class="primary" type="button" data-website-plan>Inspect & Prepare Proposal</button></div>`;
  }

  function websiteStages(active) {
    const stages = [["objective", "1 · Objective"], ["plan", "2 · Proposal"], ["stage", "3 · Build Preview"], ["preview", "4 · Review"], ["publish", "5 · Apply & Verify"]];
    const index = Math.max(0, stages.findIndex(([id]) => id === active));
    return `<div class="website-stage-row">${stages.map(([id, label], i) => `<span class="website-stage ${i < index ? "done" : i === index ? "active" : ""}">${label}</span>`).join("")}</div>`;
  }

  function websitePlanReview(w) {
    const plan = w.plan || {};
    const changes = extractChanges(plan);
    return `
      ${websiteStages("plan")}
      <div class="website-status-banner"><span>Staging proposal</span><strong>${escapeHTML(plan.summary || "Execution package prepared")}</strong></div>
      <p>${escapeHTML(plan?.plan?.strategy || plan?.plan?.summary || "Kairos prepared a bounded, reversible staging change.")}</p>
      <div class="website-review-grid"><article><h4>Verified changes</h4>${changes.length ? `<ul>${changes.slice(0, 12).map(item => `<li><strong>${escapeHTML(item.filename || item.location || "Homepage")}</strong> — ${escapeHTML(item.purpose || item.reason || item.expectedOutcome || "Approved visible change")}</li>`).join("")}</ul>` : "<p>No executable changes were returned.</p>"}</article><article><h4>Protected boundary</h4><p>Kairos Staging only</p><small>Live theme remains unchanged until final approval.</small></article></div>
      ${state.error ? `<p class="error">${escapeHTML(state.error)}</p>` : ""}
      <div class="job-actions"><button class="primary" type="button" data-website-execute ${changes.length ? "" : "disabled"}>Approve & Build Preview</button><button class="secondary" type="button" data-website-revise>Revise Request</button></div>`;
  }

  function websitePreview(w) {
    const review = w.verification || {};
    const preview = review.preview || {};
    const checks = Array.isArray(review.automatedChecks) ? review.automatedChecks : [];
    return `
      ${websiteStages("preview")}
      <div class="website-status-banner preview"><span>Non-live preview ready</span><strong>${escapeHTML(preview.targetThemeName || "Kairos Staging")}</strong></div>
      <div class="website-preview-links"><a href="${escapeAttribute(preview.mobileURL || preview.url || "#")}" target="_blank" rel="noopener">Open Mobile Preview ↗</a><a href="${escapeAttribute(preview.desktopURL || preview.url || "#")}" target="_blank" rel="noopener">Open Desktop Preview ↗</a></div>
      <div class="website-checks"><h4>Verification</h4>${checks.map(item => `<div class="website-check ${item.passed ? "passed" : "review"}"><b>${item.passed ? "✓" : "!"}</b><span><strong>${escapeHTML(item.id || "Check")}</strong><small>${escapeHTML(item.detail || "")}</small></span></div>`).join("") || "<p>Preview is ready for executive review.</p>"}</div>
      <label class="website-confirm"><input type="checkbox" data-preview-reviewed><span>I reviewed the staging preview and approve this exact result for live release preparation.</span></label>
      ${state.error ? `<p class="error">${escapeHTML(state.error)}</p>` : ""}
      <div class="job-actions"><button class="primary" type="button" data-preview-approve>Approve Preview & Continue</button><button class="secondary" type="button" data-website-revise>Request Revision</button></div>`;
  }

  function websiteRelease(w) {
    const release = w.release || {};
    return `
      ${websiteStages("publish")}
      <div class="website-status-banner approved"><span>Preview approved</span><strong>Ready to apply and verify</strong></div>
      <p>Live target: ${escapeHTML(release.liveTheme?.name || "Verified Shopify MAIN theme")}</p>
      <label class="website-confirm danger"><input type="checkbox" data-live-approved><span>I authorize Kairos to apply this approved preview to the live website and verify the result.</span></label>
      ${state.error ? `<p class="error">${escapeHTML(state.error)}</p>` : ""}
      <div class="job-actions"><button class="primary" type="button" data-website-publish>Apply & Save Website</button><button class="secondary" type="button" data-back-preview>Back to Preview</button></div>`;
  }

  function websiteCompletion(w) {
    const release = w.release || {};
    const probe = release.publication?.liveProbe || release.rollback?.liveProbe || {};
    return `
      ${websiteStages("publish")}
      <div class="website-status-banner success"><span>${escapeHTML(release.status || "completed")}</span><strong>Website transaction complete</strong></div>
      <div class="website-review-grid"><article><h4>Live verification</h4><p>HTTP ${escapeHTML(probe.status ?? "—")} · ${escapeHTML(probe.title || "Storefront verification recorded")}</p></article><article><h4>Release receipt</h4><p>${escapeHTML(release.releaseID || "Recorded")}</p></article></div>
      <div class="job-actions"><button class="primary" type="button" data-website-new>Start Another Website Job</button></div>`;
  }

  function resultPanel(result) {
    const sections = Array.isArray(result?.sections) ? result.sections : [];
    return `<div class="deliverable"><strong>${escapeHTML(result?.summary || "Directive completed.")}</strong><p>Status: ${escapeHTML(result?.status || "completed")}</p>${sections.map(section => `<section><h4>${escapeHTML(section.name || "Result")}</h4><p>${escapeHTML(section.content || section.summary || "")}</p></section>`).join("")}</div><div class="job-actions"><button class="secondary" type="button" data-reset>Start Again</button></div>`;
  }

  function bind() {
    root.querySelectorAll("[data-home]").forEach(button => button.addEventListener("click", () => navigate({ level: "home", centerID: null, actionID: null })));
    root.querySelectorAll("[data-center]").forEach(button => button.addEventListener("click", () => navigate({ level: "center", centerID: button.dataset.center, actionID: null })));
    root.querySelectorAll("[data-workspace]").forEach(button => button.addEventListener("click", () => navigate({ level: "workspace", centerID: state.route.centerID, actionID: button.dataset.workspace })));
    root.querySelector("[data-run-directive]")?.addEventListener("click", runDirective);
    root.querySelector("[data-reset]")?.addEventListener("click", () => { state.result = null; state.error = ""; render(); });
    root.querySelector("[data-website-plan]")?.addEventListener("click", prepareWebsitePlan);
    root.querySelector("[data-website-execute]")?.addEventListener("click", executeWebsitePlan);
    root.querySelector("[data-preview-approve]")?.addEventListener("click", approveWebsitePreview);
    root.querySelector("[data-website-publish]")?.addEventListener("click", publishWebsiteRelease);
    root.querySelector("[data-back-preview]")?.addEventListener("click", () => { state.website.mode = "preview"; saveWebsiteState(); render(); });
    root.querySelector("[data-website-new]")?.addEventListener("click", resetWebsite);
    root.querySelectorAll("[data-website-revise]").forEach(button => button.addEventListener("click", resetWebsite));
  }

  async function runDirective() {
    if (state.working) return;
    const objective = root.querySelector("#directive-objective")?.value.trim() || "Review the current authoritative state and return the next actionable result.";
    state.working = true;
    state.error = "";
    render();
    try {
      const { response, body } = await fetchJSON("/api/hub/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
        credentials: "include",
        body: JSON.stringify({ action: state.route.actionID, objective })
      });
      if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`);
      state.result = body;
    } catch (error) {
      state.error = error?.message || "Kairos could not complete this directive.";
    } finally {
      state.working = false;
      render();
    }
  }

  async function prepareWebsitePlan() {
    const objective = root.querySelector("#website-objective")?.value.trim() || "";
    const requestType = root.querySelector("#website-request-type")?.value === "full-retool" ? "full-retool" : "content-only";
    if (objective.length < 3) { state.error = "Describe the website outcome before Kairos begins."; render(); return; }
    if (requestType === "full-retool" && !root.querySelector("[data-full-confirm]")?.checked) { state.error = "Confirm the staging-only authorization before preparing the combined retool."; render(); return; }
    state.website = { ...state.website, mode: "working", objective, requestType };
    state.error = "";
    saveWebsiteState();
    render();
    try {
      const submitted = await submitJob("/api/shopify/staging/plan/jobs", {
        objective,
        requestType,
        intent: requestType,
        fullRetoolConfirmed: requestType === "full-retool",
        structuralMutationAuthorized: requestType === "full-retool",
        styleMutationAuthorized: requestType === "full-retool",
        contentOnlyLocked: requestType !== "full-retool"
      });
      state.website.plan = await pollJob(submitted, "plan");
      state.website.mode = "review";
    } catch (error) {
      state.error = error?.message || "Kairos could not prepare the staging proposal.";
      state.website.mode = "input";
    }
    saveWebsiteState();
    render();
  }

  async function executeWebsitePlan() {
    const plan = state.website.plan;
    if (!plan) return;
    state.website.mode = "executing";
    state.error = "";
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
        objective: plan.objective || state.website.objective
      };
      const submitted = await submitJob("/api/shopify/staging/execute/jobs", { plan, approval, websiteRetool: { nativeThemeDecision: "approved-selection", selectedChanges: [] } });
      state.website.execution = await pollJob(submitted, "execute");
      state.website.mode = "previewing";
      saveWebsiteState();
      render();
      state.website.verification = await requestJSON("/api/shopify/staging/visual-verification", { execution: state.website.execution.execution, result: state.website.execution, requestType: "homepage", path: "/" });
      state.website.mode = "preview";
    } catch (error) {
      state.error = error?.message || "Kairos could not build the staging preview.";
      state.website.mode = "review";
    }
    saveWebsiteState();
    render();
  }

  async function approveWebsitePreview() {
    if (!root.querySelector("[data-preview-reviewed]")?.checked) { state.error = "Confirm that you reviewed the staging preview before continuing."; render(); return; }
    const review = state.website.verification;
    if (!review?.reviewID) { state.error = "The staging review receipt is missing."; render(); return; }
    try {
      state.website.verification = await requestJSON("/api/shopify/staging/visual-approval", { reviewID: review.reviewID, decision: "approved", actor: "Executive", notes: "Rendered staging preview reviewed and approved." });
      state.website.release = await requestJSON("/api/shopify/homepage-release/prepare", { reviewID: review.reviewID });
      state.website.mode = "release";
      state.error = "";
    } catch (error) {
      state.error = error?.message || "Kairos could not prepare the live release.";
    }
    saveWebsiteState();
    render();
  }

  async function publishWebsiteRelease() {
    if (!root.querySelector("[data-live-approved]")?.checked) { state.error = "Confirm the final live authorization before continuing."; render(); return; }
    const release = state.website.release;
    if (!release?.releaseID) { state.error = "The approved release package is missing."; render(); return; }
    try {
      state.website.release = await requestJSON("/api/shopify/homepage-release/publish", { releaseID: release.releaseID, confirmation: "APPLY APPROVED HOMEPAGE", actor: "Executive" });
      state.website.mode = "complete";
      state.error = "";
    } catch (error) {
      state.error = error?.message || "Kairos could not apply and verify the approved homepage.";
    }
    saveWebsiteState();
    render();
  }

  function resetWebsite() {
    state.website = freshWebsiteState();
    state.error = "";
    sessionStorage.removeItem("kairos.website.safe-flow.v1");
    render();
  }

  async function refreshHealth() {
    try {
      const { response, body } = await fetchJSON(`/api/health?safe-shell=${Date.now()}`);
      state.health = response.ok ? body : { status: "unavailable" };
    } catch {
      state.health = { status: "unavailable" };
    }
    paintHealth();
  }

  function paintHealth() {
    const online = ["ready", "ok", "operational"].includes(String(state.health?.status || "").toLowerCase());
    const signal = root.querySelector("[data-runtime-signal]");
    const card = root.querySelector("[data-runtime-card]");
    const value = root.querySelector("[data-runtime-value]");
    const detail = root.querySelector("[data-runtime-detail]");
    if (signal) signal.textContent = online ? "Live" : "Runtime unavailable";
    if (card) card.dataset.state = online ? "live" : "limited";
    if (value) value.textContent = online ? "Online" : "Unavailable";
    if (detail) detail.textContent = online ? "Cloudflare edge connected" : "Health endpoint unavailable";
    root.querySelector("[data-runtime-wave]")?.classList.toggle("active", online);
  }

  function navigate(route) {
    state.route = route;
    state.error = "";
    state.result = null;
    history.pushState(route, "", routePath(route));
    render();
  }

  function parseRoute(pathname) {
    const parts = String(pathname || "/").split("/").filter(Boolean);
    if (parts[0] === "center" && parts[1]) return parts[2] ? { level: "workspace", centerID: parts[1], actionID: parts[2] } : { level: "center", centerID: parts[1], actionID: null };
    return { level: "home", centerID: null, actionID: null };
  }

  function routePath(route) {
    if (route.level === "workspace") return `/center/${encodeURIComponent(route.centerID)}/${encodeURIComponent(route.actionID)}`;
    if (route.level === "center") return `/center/${encodeURIComponent(route.centerID)}`;
    return "/";
  }

  function currentCenter() { return centers.find(center => center.id === state.route.centerID) || null; }
  function currentChild() { return currentCenter()?.children.find(child => child[3] === state.route.actionID) || null; }

  function extractChanges(plan) {
    const direct = Array.isArray(plan?.plan?.changes) ? plan.plan.changes.filter(item => item.changeType !== "no-change" && item.changeType !== "native-theme-exception-candidate") : [];
    const liquid = (Array.isArray(plan?.plan?.liquidTextPatches) ? plan.plan.liquidTextPatches : []).flatMap(patch => (patch.replacements || []).map(replacement => ({ filename: patch.filename, reason: replacement.reason, location: replacement.id })));
    const template = Array.isArray(plan?.plan?.templateTextPatch?.operations) ? plan.plan.templateTextPatch.operations : [];
    return [...direct, ...liquid, ...template];
  }

  async function submitJob(url, payload) {
    const { response, body } = await fetchJSON(url, { method: "POST", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, credentials: "include", body: JSON.stringify(payload) });
    if (!response.ok || !body?.jobID) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`);
    return body;
  }

  async function pollJob(submitted, type) {
    if (submitted?.status === "completed" && submitted?.result) return submitted.result;
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 750));
      const { response, body } = await fetchJSON(submitted.pollURL || `/api/shopify/staging/${type}/jobs/${submitted.jobID}`, { credentials: "include" });
      if (body?.status === "completed" && body?.result) return body.result;
      if (["needs-attention", "failed", "cancelled", "blocked"].includes(body?.status) || (!response.ok && response.status !== 202)) throw new Error(body?.error?.message || body?.summary || `${type} did not complete.`);
    }
    throw new Error("Kairos is still working. Reopen Website Retool to continue monitoring the preserved job.");
  }

  async function requestJSON(url, payload) {
    const { response, body } = await fetchJSON(url, { method: "POST", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, credentials: "include", body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`);
    return body;
  }

  async function fetchJSON(url, init = {}) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { summary: text }; }
    return { response, body };
  }

  function freshWebsiteState() { return { mode: "input", objective: "", requestType: "content-only", plan: null, execution: null, verification: null, release: null }; }
  function loadWebsiteState() {
    try {
      const value = JSON.parse(sessionStorage.getItem("kairos.website.safe-flow.v1") || "null");
      return value && typeof value === "object" ? { ...freshWebsiteState(), ...value } : freshWebsiteState();
    } catch { return freshWebsiteState(); }
  }
  function saveWebsiteState() { try { sessionStorage.setItem("kairos.website.safe-flow.v1", JSON.stringify(state.website)); } catch {} }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }
  function escapeAttribute(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }
})();
