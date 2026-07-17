const BUILD = "kairos-authoritative-command-center-reconcile-20260717-1";
const CENTER_ORDER = ["knowledge", "content", "business", "customers", "operations"];
const CENTER_TITLES = {
  knowledge: "Knowledge",
  content: "Content",
  business: "Business",
  customers: "Customers",
  operations: "Operations",
};

let contracts = null;
let scheduled = false;
let lastPath = "";

installStyleCorrection();
installRenderObserver();
loadContracts();

function installStyleCorrection() {
  if (document.querySelector("#kairos-authoritative-command-center-style")) return;
  const style = document.createElement("style");
  style.id = "kairos-authoritative-command-center-style";
  style.textContent = `
    .app-header-status,.card-signal,.child-readiness,.route-readiness,.center-readiness,.mini-meter,.pulse-panel,.metrics{display:none!important}
    .app-header{display:block!important;position:relative!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
    .app-header-image{display:block!important;width:100%!important;height:auto!important;border-radius:0!important;box-shadow:none!important}
    .parent-card,.child-card,.job,.route-hero,.workspace-head{border-radius:14px!important;background:var(--panel,#0b1017)!important;box-shadow:none!important}
    .parent-card:after{display:none!important}
    .parent-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}
    .children,.routed-children{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    .child-action,.primary,.secondary,.back,.route-breadcrumb button{border-radius:8px!important;background:transparent!important;box-shadow:none!important}
    .child-action,.primary{border:1px solid currentColor!important}
    .readiness-state,.bridge-state,.website-stage,.website-status-banner span{border-radius:6px!important}
    .hero{grid-template-columns:1fr!important;padding-top:34px!important}
    .hero-copy{max-width:820px!important}
    [data-authoritative-contract]{min-height:0!important}
    [data-authoritative-contract] .contract-owner{display:block;margin:8px 0 14px;color:var(--muted,#8998a8);font-size:11px}
    [data-authoritative-contract] .contract-route-count{font-size:11px;color:var(--muted,#8998a8)}
    @media(max-width:980px){.parent-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    @media(max-width:680px){.parent-grid,.children,.routed-children{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);
}

function installRenderObserver() {
  const observer = new MutationObserver(scheduleReconcile);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-authoritative-workspace]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const center = button.dataset.authoritativeCenter;
    const action = button.dataset.authoritativeWorkspace;
    window.KairosCommandHub?.openWorkspace?.(center, action);
  }, true);
  window.addEventListener("popstate", scheduleReconcile);
  window.addEventListener("load", scheduleReconcile, { once: true });
  scheduleReconcile();
}

async function loadContracts() {
  try {
    const response = await fetch("/api/hub/contracts", { cache: "no-store", credentials: "include" });
    const body = await response.json();
    if (!response.ok || !body?.actions) throw new Error(body?.error?.message || "Contract registry unavailable.");
    contracts = body.actions;
    document.documentElement.dataset.kairosContractsBuild = body.build || BUILD;
    scheduleReconcile();
  } catch (error) {
    console.error("Kairos authoritative child registry could not load", error);
  }
}

function scheduleReconcile() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    reconcile();
  });
}

function reconcile() {
  document.querySelectorAll(".app-header-status").forEach(node => node.remove());
  document.querySelectorAll(".card-signal,.child-readiness,.route-readiness,.center-readiness,.mini-meter").forEach(node => node.remove());
  document.querySelectorAll(".parent-card[data-route-center]").forEach(card => {
    card.dataset.center = card.dataset.routeCenter || "";
  });

  if (!contracts) return;
  const route = parseRoute(location.pathname);
  if (route.level === "center") reconcileCenter(route.centerID);
  if (route.level === "home") reconcileHomeCounts();
  lastPath = location.pathname;
}

function reconcileHomeCounts() {
  const count = Object.keys(contracts).length;
  const heroCopy = document.querySelector(".hero-copy");
  if (heroCopy) heroCopy.textContent = `${CENTER_ORDER.length} operating centers. ${count} current child workspaces loaded from the live Kairos contract registry.`;
}

function reconcileCenter(centerID) {
  const host = document.querySelector(".routed-children");
  if (!host) return;
  const entries = Object.entries(contracts)
    .filter(([, contract]) => contract?.center === centerID)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return;

  const signature = `${centerID}:${entries.map(([id, contract]) => `${id}:${contract.title}:${contract.owner}`).join("|")}`;
  if (host.dataset.authoritativeSignature === signature) return;
  host.dataset.authoritativeSignature = signature;
  host.innerHTML = entries.map(([actionID, contract]) => cardMarkup(centerID, actionID, contract)).join("");

  const eyebrow = document.querySelector(".route-hero .eyebrow");
  if (eyebrow) eyebrow.textContent = `${CENTER_TITLES[centerID] || centerID} Center · ${entries.length} current workspaces`;
}

function cardMarkup(centerID, actionID, contract) {
  const routeCount = Array.isArray(contract?.apiRoutes) ? contract.apiRoutes.length : 0;
  const description = contractDescription(actionID, contract);
  const label = actionLabel(actionID, contract);
  return `<article class="child-card" data-authoritative-contract="${escapeAttribute(actionID)}">
    <p class="eyebrow">${escapeHTML(CENTER_TITLES[centerID] || centerID)}</p>
    <h3>${escapeHTML(contract?.title || label)}</h3>
    <p>${escapeHTML(description)}</p>
    <span class="contract-owner">${escapeHTML(contract?.owner || "Kairos Operations")} · <span class="contract-route-count">${routeCount} connected route${routeCount === 1 ? "" : "s"}</span></span>
    <button class="child-action" type="button" data-authoritative-center="${escapeAttribute(centerID)}" data-authoritative-workspace="${escapeAttribute(actionID)}">${escapeHTML(buttonLabel(actionID, contract))}</button>
  </article>`;
}

function contractDescription(actionID, contract) {
  const descriptions = {
    "knowledge-library": "Search and use authoritative MMG knowledge, doctrine, specifications, and preserved decisions.",
    "research-brief": "Build an evidence-bound research brief and preserve its sources and synthesis.",
    "decision-record": "Record an approved executive decision, rationale, impact, and durable evidence.",
    "doctrine-vault": "Inspect canonical MMG and Kairos governance without relying on stale browser copies.",
    "intelligence-synthesis": "Combine verified knowledge into an actionable executive synthesis.",
    website: "Inspect, propose, preview, approve, execute, save, verify, and roll back Shopify website work.",
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
    health: "Inspect live runtime, capabilities, bindings, and deployment identity.",
    "work-queue": "Review active, queued, blocked, completed, and approval-gated work.",
    "release-control": "Prepare, approve, verify, publish, and roll back governed releases.",
    "executive-briefing": "Review approval-ready work and executive decisions.",
    "system-registry": "Inspect canonical services, routes, assets, ownership, and readiness.",
  };
  return descriptions[actionID] || `${contract?.owner || "Kairos"} operational workspace.`;
}

function actionLabel(actionID, contract) {
  return contract?.title || actionID.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function buttonLabel(actionID, contract) {
  if (actionID === "website") return "Open Website Retool";
  if (actionID === "health") return "Open Runtime Health";
  if (actionID === "work-queue") return "Open My Work";
  return `Open ${actionLabel(actionID, contract)}`;
}

function parseRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "center" && parts[1]) return parts[2]
    ? { level: "workspace", centerID: parts[1], actionID: parts[2] }
    : { level: "center", centerID: parts[1], actionID: null };
  return { level: "home", centerID: null, actionID: null };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function escapeAttribute(value) {
  return escapeHTML(value).replace(/`/g, "&#96;");
}

window.KairosAuthoritativeCommandCenter = {
  build: BUILD,
  registrySource: "/api/hub/contracts",
  loaderChanged: false,
  reconcile: scheduleReconcile,
};
