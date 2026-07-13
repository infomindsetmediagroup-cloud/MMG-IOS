const BUILD = "kairos-production-workspace-20260713-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const PRODUCT_KEYS = [
  "kairos.complete-product.job",
  "kairos.product.publication",
  "kairos.product.media",
  "kairos.product.launch"
];

window.addEventListener("kairos:production:open", event => {
  const workspace = String(event.detail?.workspace || "").trim();
  if (!['complete-product','manuscript-studio'].includes(workspace)) return;
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ workspace, openedAt: new Date().toISOString(), build: BUILD }));
  openWorkspace(workspace);
});

window.addEventListener("kairos:production:close", () => {
  sessionStorage.removeItem(ACTIVE_KEY);
});

window.addEventListener("storage", event => {
  if (event.key === ACTIVE_KEY && event.newValue) restoreActiveWorkspace();
});

function openWorkspace(workspace) {
  const selector = workspace === "complete-product" ? ".creation-engine-launch" : ".manuscript-launch";
  const launcher = document.querySelector(selector);
  if (!launcher) {
    window.dispatchEvent(new CustomEvent("kairos:production:error", { detail: { workspace, message: "The requested production workspace is not available." } }));
    return;
  }
  launcher.click();
}

function restoreActiveWorkspace() {
  const active = readJSON(ACTIVE_KEY);
  if (!active?.workspace) return;
  const alreadyOpen = active.workspace === "complete-product"
    ? document.querySelector("#complete-product-overlay")
    : document.querySelector("#manuscript-studio-overlay");
  if (alreadyOpen) return;
  setTimeout(() => openWorkspace(active.workspace), 150);
}

function productionSummary() {
  const active = readJSON(ACTIVE_KEY);
  const productState = PRODUCT_KEYS.map(key => readJSON(key)).find(Boolean) || null;
  const manuscriptReview = readJSON("mmg.manuscript.review");
  const manuscriptApproval = readJSON("mmg.manuscript.approved");
  return {
    build: BUILD,
    activeWorkspace: active?.workspace || null,
    product: productState,
    manuscript: manuscriptApproval || manuscriptReview || null,
    resumable: Boolean(active?.workspace || productState || manuscriptReview || manuscriptApproval)
  };
}

window.KairosProductionWorkspace = Object.freeze({
  open(workspace) {
    window.dispatchEvent(new CustomEvent("kairos:production:open", { detail: { workspace } }));
  },
  clear() {
    sessionStorage.removeItem(ACTIVE_KEY);
    PRODUCT_KEYS.forEach(key => sessionStorage.removeItem(key));
    sessionStorage.removeItem("mmg.manuscript.review");
    sessionStorage.removeItem("mmg.manuscript.approved");
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", { detail: productionSummary() }));
  },
  summary: productionSummary
});

const observer = new MutationObserver(() => {
  const active = readJSON(ACTIVE_KEY);
  if (!active?.workspace) return;
  const isOpen = active.workspace === "complete-product"
    ? Boolean(document.querySelector("#complete-product-overlay"))
    : Boolean(document.querySelector("#manuscript-studio-overlay"));
  if (!isOpen) return;
  window.dispatchEvent(new CustomEvent("kairos:production:state-changed", { detail: productionSummary() }));
});
observer.observe(document.documentElement, { childList: true, subtree: true });

function readJSON(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
  catch { return null; }
}

window.addEventListener("DOMContentLoaded", restoreActiveWorkspace, { once: true });
setTimeout(restoreActiveWorkspace, 300);
