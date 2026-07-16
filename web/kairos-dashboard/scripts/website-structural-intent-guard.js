const BUILD = "kairos-website-structural-intent-guard-20260716-1";
const WEBSITE_STATE_KEY = "kairos.website.operational-flow.v2";
const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const STRUCTURAL_PATTERNS = [
  /\b(full|complete|comprehensive|canonical|structural)\s+(website|site|homepage|page|storefront)\s+(retool|redesign|rebuild|build|overhaul|implementation)\b/i,
  /\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b[\s\S]{0,140}\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system|shopify theme)\b/i,
  /\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system|shopify theme)\b[\s\S]{0,140}\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b/i,
  /\b(apple|nike)[- ]inspired\b[\s\S]{0,140}\b(website|site|homepage|storefront|design|experience|storytelling)\b/i,
  /\b(add|remove|move|reorder|create|replace|rebuild)\b[\s\S]{0,90}\b(section|sections|component|components|navigation|header|footer|layout|template|card|cards|carousel|hero)\b/i,
  /\b(mobile-first|responsive|desktop and mobile|visual hierarchy|editorial presentation|guided customer experience)\b/i,
  /\btemplates\/index\.json\b|\bshopify liquid\b|\bliquid,?\s+json,?\s+css\b|\bhomepage javascript asset\b/i,
  /\borient\s*(?:→|->|>)\s*discover\s*(?:→|->|>)\s*understand\b/i,
];

normalizePersistedWebsiteState();
installWebsiteFetchGuard();
installWebsiteControlGuard();

function isStructuralObjective(value) {
  const objective = String(value || "").trim();
  return objective.length > 0 && STRUCTURAL_PATTERNS.some(pattern => pattern.test(objective));
}

function hasLiteralReplacementBlocks(value) {
  const objective = String(value || "");
  return (
    /\breplace\s+source\s*:/i.test(objective) && /\bwith\s+(?:the\s+)?replacement\s*:/i.test(objective)
  ) || /\bsource\s*:\s*[\s\S]{1,1200}\breplacement\s*:/i.test(objective);
}

function normalizePersistedWebsiteState() {
  try {
    const state = JSON.parse(sessionStorage.getItem(WEBSITE_STATE_KEY) || "null");
    if (!state || typeof state !== "object") return;
    if (!isStructuralObjective(state.objective)) return;

    const plan = state.plan || {};
    const requestType = String(plan.requestType || plan?.plan?.requestType || state.requestType || "").toLowerCase();
    const installationMode = String(plan?.plan?.installationMode || "").toLowerCase();
    const summary = String(plan.summary || plan?.plan?.summary || "").toLowerCase();
    const staleContentOnly = requestType === "content-only"
      || installationMode === "inspection-only"
      || installationMode === "existing-liquid-visible-text"
      || summary.includes("no exact unique source phrases")
      || summary.includes("without mutation");

    state.requestType = "full-retool";
    if (staleContentOnly || state.mode === "review") {
      state.mode = "input";
      state.plan = null;
      state.execution = null;
      state.verification = null;
      state.release = null;
    }
    sessionStorage.setItem(WEBSITE_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function installWebsiteFetchGuard() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function guardedWebsiteFetch(input, init = {}) {
    const url = resolveURL(input);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "POST" || url.pathname !== PLAN_ROUTE) return nativeFetch(input, init);

    let payload = null;
    try {
      if (typeof init?.body === "string") payload = JSON.parse(init.body);
    } catch {}
    if (!payload || typeof payload !== "object") return nativeFetch(input, init);

    const objective = String(payload.objective || payload.prompt || payload.instruction || "");
    if (!isStructuralObjective(objective)) return nativeFetch(input, init);

    const canonical = {
      ...payload,
      requestType: "full-retool",
      intent: "full-retool",
      mode: "full-retool",
      fullRetoolConfirmed: true,
      structuralMutationAuthorized: true,
      styleMutationAuthorized: true,
      contentOnlyLocked: false,
      literalOnly: false,
      structuralObjectiveDetected: true,
      routingAuthority: BUILD,
    };
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("Content-Type", "application/json");
    headers.set("X-Kairos-Website-Intent", "full-retool");
    headers.set("X-Kairos-Content-Only-Lock", "false");
    headers.set("X-Kairos-Structural-Objective", "true");
    headers.set("X-Kairos-Website-Intent-Guard", BUILD);
    return nativeFetch(input, {
      ...init,
      headers,
      body: JSON.stringify(canonical),
    });
  };
}

function installWebsiteControlGuard() {
  const synchronize = ({ defaultFull = false } = {}) => {
    const objective = document.querySelector("#website-objective")?.value || "";
    const structural = isStructuralObjective(objective);
    const literal = hasLiteralReplacementBlocks(objective);
    const select = document.querySelector("#website-request-type");
    const confirmation = document.querySelector("[data-website-full-retool-confirm]");
    if (!select) return;
    if (structural || (defaultFull && !literal && !objective.trim())) {
      select.value = "full-retool";
      if (confirmation) confirmation.checked = true;
      select.dataset.kairosIntentAuthority = BUILD;
    }
  };

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-route-workspace="website"]')
      || target.closest("[data-website-revise]")
      || target.closest("[data-website-new]")) {
      queueMicrotask(() => synchronize({ defaultFull: true }));
    }

    if (target.closest("[data-website-plan]")) {
      synchronize({ defaultFull: true });
    }
  }, true);

  document.addEventListener("input", event => {
    if (event.target instanceof HTMLTextAreaElement && event.target.id === "website-objective") {
      synchronize();
    }
  }, true);

  document.addEventListener("change", event => {
    if (event.target instanceof HTMLSelectElement && event.target.id === "website-request-type") {
      const objective = document.querySelector("#website-objective")?.value || "";
      if (isStructuralObjective(objective) && event.target.value !== "full-retool") {
        event.target.value = "full-retool";
        const confirmation = document.querySelector("[data-website-full-retool-confirm]");
        if (confirmation) confirmation.checked = true;
      }
    }
  }, true);

  window.addEventListener("popstate", () => queueMicrotask(() => synchronize({ defaultFull: true })));
  window.addEventListener("load", () => synchronize({ defaultFull: true }), { once: true });
  queueMicrotask(() => synchronize({ defaultFull: true }));
}

function resolveURL(input) {
  try {
    if (input instanceof Request) return new URL(input.url, location.origin);
    return new URL(String(input), location.origin);
  } catch {
    return new URL(location.href);
  }
}

window.KairosWebsiteStructuralIntentGuard = {
  build: BUILD,
  isStructuralObjective,
  hasLiteralReplacementBlocks,
};
