const BUILD = "kairos-five-center-runtime-loader-20260730-1";
const RELEASE = "five-center-dashboard-restored-20260730-1";
const params = new URLSearchParams(window.location.search);
const requestedMode = params.get("mode");
const executiveMode = requestedMode === "executive";
const advancedMode = requestedMode === "advanced";
const commandHubMode = !executiveMode;

const STYLE_FILES = [
  "command-hub.css",
  "parent-icon-alignment.css",
  "command-center-layout.css",
  "command-center-governance.css",
  "objective-router.css",
  "executive-briefing.css",
  "workflow-runtime.css",
  "deliverables.css",
  "customer-portal.css",
  "customer-runtime-portal.css",
  "revenue-engine-operations.css",
  "customer-journeys.css",
  "visitor-activity.css",
  "revenue-intelligence.css",
  "growth-plan.css",
  "offer-builder.css",
  "campaign-operations.css",
  "product-launch-studio.css",
  "publishing-studio.css",
  "creative-studio.css",
  "social-production.css",
  "header-override.css",
  "shopify-analytics.css",
  "manuscript-studio.css",
  "publication-operations.css",
  "publication-performance.css",
  "publication-settlement.css",
  "publication-tax-compliance.css",
  "creation-engine.css",
  "publishing-production-center.css",
  "website-visual-verification.css",
  "shopify-release-control.css",
  "website-registry.css",
  "shopify-page-compiler.css",
  "objective-controller-v2.css",
  "operations-observability.css",
  "incident-operations.css",
  "release-operations.css",
  "readiness-certification.css",
  "launch-governance.css",
  "post-launch-assurance.css",
  "operational-continuity.css",
  "continuous-operational-review.css",
  "policy-exception-governance.css",
  "governance-obligation-tracking.css",
  "governance-portfolio-oversight.css",
  "governance-assurance-planning.css",
  "governance-remediation-planning.css",
  "governance-effectiveness-verification.css",
  "governance-lessons-institutionalization.css",
  "runtime-project-operations.css",
  "website-builder-studio.css",
  "publishing-operations-center.css",
];

const SCRIPT_FILES = [
  "command-hub.js",
  "command-center-layout.js",
  "command-center-governance.js",
  "objective-router.js",
  "website-builder-studio.js",
  "objective-controller-v2.js",
  "operations-observability.js",
  "incident-operations.js",
  "release-operations.js",
  "readiness-certification.js",
  "launch-governance.js",
  "post-launch-assurance.js",
  "operational-continuity.js",
  "continuous-operational-review.js",
  "policy-exception-governance.js",
  "governance-obligation-tracking.js",
  "governance-portfolio-oversight.js",
  "governance-assurance-planning.js",
  "governance-remediation-planning.js",
  "governance-effectiveness-verification.js",
  "governance-lessons-institutionalization.js",
  "runtime-project-operations.js",
  "revenue-engine-operations.js",
  "executive-briefing.js",
  "workflow-runtime.js",
  "deliverables.js",
  "customer-portal.js",
  "customer-runtime-portal.js",
  "customer-journeys.js",
  "visitor-activity.js",
  "revenue-intelligence.js",
  "growth-plan.js",
  "offer-builder.js",
  "campaign-operations.js",
  "product-launch-studio.js",
  "publishing-studio.js",
  "creative-studio.js",
  "social-production.js",
  "website-production-mobile-route.js",
  "publishing-operations-center.js",
  "manuscript-docx-upload-hotfix.js",
  "manuscript-studio.js",
  "manuscript-project-setup.js",
  "manuscript-editorial-workbench.js",
  "kairos-local-inference.js",
  "manuscript-auto-pipeline.js",
  "shopify-analytics.js",
  "launch-boundary.js",
  "complete-product-engine.js",
  "production-workspace-controller.js",
  "publishing-production-center.js",
  "product-media-installer.js",
  "product-launch-control.js",
  "website-visual-verification.js",
  "shopify-release-control.js",
  "website-registry.js",
  "shopify-page-compiler.js",
];

let loadPromise = null;

window.KairosLegacyRuntime = Object.freeze({
  build: BUILD,
  requestedMode: requestedMode || "command",
  commandHubMode,
  advancedMode,
  executiveMode,
  load: loadCommandRuntime,
});

if (commandHubMode) loadCommandRuntime();

async function loadCommandRuntime() {
  if (!commandHubMode) return { status: "not-requested", build: BUILD };
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    document.documentElement.dataset.kairosMode = advancedMode ? "advanced" : "command";
    const ui = installBootUI();

    try {
      ui.update("Loading command-center styles…");
      await Promise.all(STYLE_FILES.map(loadStyle));

      for (let index = 0; index < SCRIPT_FILES.length; index += 1) {
        ui.update(`Loading Kairos operations ${index + 1} of ${SCRIPT_FILES.length}…`);
        await loadModule(SCRIPT_FILES[index]);
      }

      ui.remove();
      document.body.dataset.kairosLegacyReady = "true";
      document.body.dataset.kairosCommandHubReady = "true";
      window.dispatchEvent(new CustomEvent("kairos:legacy-runtime:ready", {
        detail: { build: BUILD, scripts: SCRIPT_FILES.length, mode: advancedMode ? "advanced" : "command" },
      }));
      if (advancedMode) installPersistentReturnButton();
      openRequestedWorkspace();
      return { status: "ready", build: BUILD, mode: advancedMode ? "advanced" : "command" };
    } catch (error) {
      console.error("Kairos command center failed to load.", error);
      ui.fail(error);
      throw error;
    }
  })();

  return loadPromise;
}

function loadStyle(filename) {
  return new Promise((resolve, reject) => {
    const selector = `link[data-kairos-command-style="${cssEscape(filename)}"]`;
    if (document.querySelector(selector)) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `./styles/${filename}?v=${RELEASE}`;
    link.dataset.kairosCommandStyle = filename;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Could not load ${filename}.`));
    document.head.append(link);
  });
}

function loadModule(filename) {
  return new Promise((resolve, reject) => {
    const selector = `script[data-kairos-command-script="${cssEscape(filename)}"]`;
    if (document.querySelector(selector)) return resolve();
    const script = document.createElement("script");
    script.type = "module";
    script.src = `./scripts/${filename}?v=${RELEASE}`;
    script.dataset.kairosCommandScript = filename;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${filename}.`));
    document.body.append(script);
  });
}

function installBootUI() {
  const existing = document.querySelector("#kairos-command-boot");
  if (existing) return bootUI(existing);

  const panel = document.createElement("section");
  panel.id = "kairos-command-boot";
  panel.setAttribute("role", "status");
  panel.innerHTML = `<div><strong>${advancedMode ? "Kairos Advanced Operations" : "Kairos Command Center"}</strong><p data-kairos-command-status>${advancedMode ? "Preparing advanced operations…" : "Restoring the five operating centers…"}</p></div>`;
  Object.assign(panel.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "#05070a",
    color: "#f7f9fc",
    fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
  });
  const card = panel.firstElementChild;
  Object.assign(card.style, {
    width: "min(520px,100%)",
    padding: "28px",
    border: "1px solid #202a36",
    borderRadius: "22px",
    background: "#0b1017",
  });
  document.body.append(panel);
  return bootUI(panel);
}

function bootUI(panel) {
  const status = panel.querySelector("[data-kairos-command-status]");
  return {
    update(message) { if (status) status.textContent = message; },
    remove() { panel.remove(); },
    fail(error) { if (status) status.textContent = String(error?.message || "The command center could not load."); },
  };
}

function installPersistentReturnButton() {
  if (document.querySelector("[data-kairos-persistent-return]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.kairosPersistentReturn = "true";
  button.textContent = "Return to Command Center";
  Object.assign(button.style, {
    position: "fixed",
    top: "max(12px, env(safe-area-inset-top))",
    right: "12px",
    zIndex: "2147483646",
    padding: "10px 12px",
    border: "1px solid #2b3745",
    borderRadius: "12px",
    background: "#111923",
    color: "#fff",
    font: "700 13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
  });
  button.addEventListener("click", returnToCommandCenter);
  document.body.append(button);
}

function returnToCommandCenter() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.location.assign(url.href);
}

function openRequestedWorkspace() {
  const target = params.get("open");
  if (!target) return;
  requestAnimationFrame(() => {
    if (target === "manuscript") {
      if (typeof window.KairosProductionWorkspace?.open === "function") window.KairosProductionWorkspace.open("manuscript-studio");
      else window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:open"));
    }
    if (target === "social") window.dispatchEvent(new CustomEvent("kairos:social-production:open"));
  });
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
