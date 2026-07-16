const BUILD = "kairos-workspace-runtime-20260716-3";

export const WORKSPACE_REGISTRY = Object.freeze({
  "knowledge-library": workspace("knowledge-operations.js", "kairos:knowledge-library:open", ["knowledge-operations.css"]),
  "research-brief": workspace("research-synthesis-operations.js", "kairos:research-brief:open", ["research-synthesis-operations.css", "knowledge-operations.css"]),
  "decision-record": workspace("decision-record-operations.js", "kairos:decision-record:open", ["decision-record-operations.css"]),
  "doctrine-vault": workspace("knowledge-operations.js", "kairos:doctrine-vault:open", ["knowledge-operations.css"]),
  "intelligence-synthesis": workspace("research-synthesis-operations.js", "kairos:intelligence-synthesis:open", ["research-synthesis-operations.css"]),
  "manuscript-studio": workspace("manuscript-studio.js", "kairos:manuscript-studio:open", ["manuscript-studio.css"]),
  "social-production": workspace("social-production.js", "kairos:social-production:open", ["social-production.css"]),
  "publishing-studio": workspace("publishing-studio.js", "kairos:publishing-studio:open", ["publishing-studio.css"]),
  "creative-studio": workspace("creative-studio.js", "kairos:creative-studio:open", ["creative-studio.css"]),
  "product-launch": workspace("product-launch-studio.js", "kairos:product-launch:open", ["product-launch-studio.css"]),
  "revenue-intelligence": workspace("revenue-intelligence.js", "kairos:revenue-intelligence:open", ["revenue-intelligence.css"]),
  "growth-plan": workspace("growth-plan.js", "kairos:growth-plan:open", ["growth-plan.css"]),
  "offer-builder": workspace("offer-builder.js", "kairos:offer-builder:open", ["offer-builder.css"]),
  "campaign-operations": workspace("campaign-operations.js", "kairos:campaign-operations:open", ["campaign-operations.css"]),
  "visitor-activity": workspace("visitor-activity.js", "kairos:visitor-activity:open", ["visitor-activity.css"]),
  "customer-portal": workspace("customer-portal.js", "kairos:customer-portal:open", ["customer-portal.css"]),
  "deliverables": workspace("deliverables.js", "kairos:deliverables:open", ["deliverables.css"]),
  "customer-journey": workspace("customer-journeys.js", "kairos:customer-journeys:open", ["customer-journeys.css"]),
  "support-intelligence": workspace("support-intelligence.js", "kairos:support-intelligence:open", ["support-intelligence.css"]),
  "work-queue": workspace("workflow-runtime.js", "kairos:workflow-runtime:open", ["workflow-runtime.css", "workflow-native-output.css"]),
  "release-control": workspace("shopify-release-control.js", "kairos:release-control:open", ["shopify-release-control.css"]),
  "executive-briefing": workspace("executive-briefing.js", "kairos:executive-briefing:open", ["executive-briefing.css"]),
  "system-registry": workspace("system-registry.js", "kairos:system-registry:open", ["system-registry.css"]),
});

const SURFACE_SELECTORS = [
  "#knowledge-operations",
  "#knowledge-library-provenance",
  "#research-evidence-closeout",
  "#research-synthesis-operations",
  "#decision-record-operations",
  "#manuscript-studio-overlay",
  "#social-production",
  "#publishing-studio",
  "#creative-studio",
  "#product-launch-studio",
  "#revenue-intelligence",
  "#growth-plan",
  "#offer-builder",
  "#campaign-operations",
  "#visitor-activity",
  "#customer-portal-workspace",
  "#deliverables-workspace",
  "#customer-journeys",
  "#support-intelligence",
  "#workflow-runtime",
  "#shopify-release-control-overlay",
  "#executive-briefing",
  "#system-registry-workspace",
];

let activation = 0;

export function isDomainWorkspace(actionID) {
  return Boolean(WORKSPACE_REGISTRY[actionID]);
}

export async function openDomainWorkspace(actionID, detail = {}) {
  const definition = WORKSPACE_REGISTRY[actionID];
  if (!definition) return false;
  cleanupDomainWorkspace();
  const token = ++activation;
  const host = document.querySelector("#workspace-runtime-host");
  setHost(host, "loading", `Loading ${label(actionID)} domain workspace…`);
  try {
    await Promise.all(definition.styles.map(loadStyle));
    await import(`./${definition.module}?v=${BUILD}`);
    if (token !== activation) return false;
    window.dispatchEvent(new CustomEvent(definition.event, { detail: { ...detail, source: "routed-command-center", actionID } }));
    await nextPaint();
    setHost(host, "ready", `${label(actionID)} is connected to its domain runtime.`);
    host?.setAttribute("hidden", "");
    return true;
  } catch (failure) {
    if (token !== activation) return false;
    setHost(host, "error", failure instanceof Error ? failure.message : `${label(actionID)} could not load.`);
    return false;
  }
}

export function cleanupDomainWorkspace() {
  activation += 1;
  for (const selector of SURFACE_SELECTORS) document.querySelector(selector)?.remove();
}

function workspace(module, event, styles) {
  return Object.freeze({ module, event, styles: Object.freeze(styles) });
}

function loadStyle(filename) {
  const href = `/styles/${filename}`;
  const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(link => new URL(link.href, location.href).pathname === href);
  if (existing) {
    existing.href = `${href}?v=${BUILD}`;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${href}?v=${BUILD}`;
    link.dataset.kairosWorkspaceStyle = filename;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error(`${filename} could not load.`)), { once: true });
    document.head.appendChild(link);
  });
}

function setHost(host, state, message) {
  if (!host) return;
  host.hidden = false;
  host.dataset.state = state;
  host.innerHTML = `<p class="workspace-runtime-state"><i></i>${escapeHTML(message)}</p>`;
}

function nextPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function label(value) {
  return String(value || "workspace").replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

if (!window.KairosExecutiveSimpleMode) {
  window.KairosExecutiveSimpleMode = {
    openMyWork: () => window.KairosCommandHub?.openWorkspace?.("operations", "work-queue"),
  };
}

window.KairosWorkspaceRuntime = { build: BUILD, registry: WORKSPACE_REGISTRY, open: openDomainWorkspace, cleanup: cleanupDomainWorkspace };