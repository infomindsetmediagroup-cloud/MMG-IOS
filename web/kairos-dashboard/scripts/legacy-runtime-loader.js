const BUILD = "kairos-legacy-runtime-loader-20260730-3";
const RELEASE = "manuscript-docx-export-resolution-20260730-1";
const params = new URLSearchParams(window.location.search);
const advancedMode = params.get("mode") === "advanced";

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
  advancedMode,
  load: loadLegacyRuntime,
});

if (advancedMode) loadLegacyRuntime();

async function loadLegacyRuntime() {
  if (!advancedMode) return { status: "not-requested", build: BUILD };
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    document.documentElement.dataset.kairosMode = "advanced";
    const ui = installAdvancedBootUI();

    try {
      ui.update("Loading advanced styles…");
      await Promise.allSettled(STYLE_FILES.map(loadStyle));

      for (let index = 0; index < SCRIPT_FILES.length; index += 1) {
        const filename = SCRIPT_FILES[index];
        ui.update(`Loading advanced operations ${index + 1} of ${SCRIPT_FILES.length}…`);
        await loadModule(filename);
      }

      ui.remove();
      document.body.dataset.kairosLegacyReady = "true";
      window.dispatchEvent(new CustomEvent("kairos:legacy-runtime:ready", {
        detail: { build: BUILD, scripts: SCRIPT_FILES.length },
      }));
      openRequestedWorkspace();
      return { status: "ready", build: BUILD };
    } catch (error) {
      console.error("Kairos advanced operations failed to load.", error);
      ui.fail(error);
      throw error;
    }
  })();

  return loadPromise;
}

function loadStyle(filename) {
  return new Promise((resolve, reject) => {
    const selector = `link[data-kairos-legacy-style="${cssEscape(filename)}"]`;
    if (document.querySelector(selector)) {
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `./styles/${filename}?v=${RELEASE}`;
    link.dataset.kairosLegacyStyle = filename;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Could not load ${filename}.`));
    document.head.append(link);
  });
}

function loadModule(filename) {
  return new Promise((resolve, reject) => {
    const selector = `script[data-kairos-legacy-script="${cssEscape(filename)}"]`;
    if (document.querySelector(selector)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = `./scripts/${filename}?v=${RELEASE}`;
    script.dataset.kairosLegacyScript = filename;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${filename}.`));
    document.body.append(script);
  });
}

function installAdvancedBootUI() {
  const existing = document.querySelector("#kairos-advanced-boot");
  if (existing) return bootUI(existing);

  const panel = document.createElement("section");
  panel.id = "kairos-advanced-boot";
  panel.setAttribute("role", "status");
  panel.innerHTML = `<div><strong>Kairos Advanced Operations</strong><p data-kairos-advanced-status>Preparing isolated runtime…</p><button type="button" data-kairos-return>Return to Executive OS</button></div>`;
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
  const button = panel.querySelector("[data-kairos-return]");
  Object.assign(button.style, {
    marginTop: "16px",
    padding: "12px 16px",
    border: "1px solid #202a36",
    borderRadius: "12px",
    background: "#151d27",
    color: "#f7f9fc",
    font: "inherit",
  });
  button.addEventListener("click", returnToExecutiveOS);
  document.body.append(panel);
  installPersistentReturnButton();
  return bootUI(panel);
}

function bootUI(panel) {
  const status = panel.querySelector("[data-kairos-advanced-status]");
  return {
    update(message) { if (status) status.textContent = message; },
    remove() { panel.remove(); },
    fail(error) {
      if (status) status.textContent = String(error?.message || "Advanced operations could not load.");
    },
  };
}

function installPersistentReturnButton() {
  if (document.querySelector("[data-kairos-persistent-return]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.kairosPersistentReturn = "true";
  button.textContent = "Return to Executive OS";
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
  button.addEventListener("click", returnToExecutiveOS);
  document.body.append(button);
}

function returnToExecutiveOS() {
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
      if (typeof window.KairosProductionWorkspace?.open === "function") {
        window.KairosProductionWorkspace.open("manuscript-studio");
      } else {
        window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:open"));
      }
    }
    if (target === "social") {
      window.dispatchEvent(new CustomEvent("kairos:social-production:open"));
    }
  });
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
