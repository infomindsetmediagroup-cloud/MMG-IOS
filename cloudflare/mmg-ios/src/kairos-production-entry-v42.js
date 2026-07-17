import runtime, { KairosProject } from "./kairos-production-entry-v41.js";
import renderedTextPlanner, { KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD } from "./kairos-rendered-homepage-text-planner-v1.js";
import liquidFallback, { KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD } from "./kairos-homepage-liquid-text-fallback-v1.js";

const BUILD = "kairos-production-entry-20260716-99";
const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";
const FALLBACK_CODES = new Set([
  "rendered_homepage_text_delta_missing",
  "published_homepage_text_settings_missing",
  "safe_template_text_changes_missing",
]);

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === PLAN_ROUTE) {
        const payload = await safeJSON(request.clone());
        if (isPreserveRequest(payload)) {
          const primary = await renderedTextPlanner.fetch(request.clone(), env, ctx);
          const body = await safeJSON(primary.clone());
          if (primary.ok || !FALLBACK_CODES.has(String(body?.error?.code || ""))) return stamp(primary, "template-settings");
          return stamp(await liquidFallback.fetch(request, env, ctx), "liquid-literal-text");
        }
      }
      if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) {
        const payload = await safeJSON(request.clone());
        if (payload?.plan?.plan?.installationMode === "published-main-liquid-visible-text-v1") {
          return stamp(await liquidFallback.fetch(request, env, ctx), "liquid-literal-text");
        }
      }
      let response = await runtime.fetch(request, env, ctx);
      if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await addHealth(response);
      return stamp(response, response.headers.get("X-Kairos-Homepage-Text-Source") || "passthrough");
    } catch (error) {
      return jsonError(Number(error?.statusCode || error?.status || 500), error?.code || "homepage_text_fallback_edge_failed", error instanceof Error ? error.message : "Kairos homepage text fallback failed.");
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

function isPreserveRequest(payload) {
  const mode = String(payload?.homepageMode || payload?.requestType || payload?.intent || "").trim().toLowerCase();
  return payload?.preservePublishedFramework === true
    || payload?.preserveExistingDesign === true
    || ["homepage-preserve-design", "preserve-published-framework", "preserve-current-design", "preserve-design"].includes(mode);
}

async function addHealth(response) {
  let body;
  try { body = await response.clone().json(); } catch { return response; }
  body.build = BUILD;
  body.homepagePreserveDesign = {
    ...(body.homepagePreserveDesign || {}),
    status: "operational",
    renderedTextPlannerBuild: KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD,
    liquidFallbackBuild: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
    contract: "published-main-template-settings-then-node-preserving-liquid-text",
    sourceOrder: ["active rendered template settings", "homepage-specific literal Liquid text"],
    sourceOfTruth: "published-main-theme",
    stagingExecution: "automatic-after-source-bound-plan",
    mutableFiles: ["templates/index.json", "active homepage-specific sections/*.liquid when template settings expose no rendered copy"],
    mutableValues: "existing customer-facing text only",
    liquidFallback: "literal-text-nodes-only",
    liquidMarkupMutation: "prohibited",
    CSSAssetClassDesignTokenMutation: "prohibited",
    canonicalPackageInstallation: "prohibited-in-preserve-mode",
    liveApplicationApproval: "required",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    homepageTemplateTextMutation: "operational",
    homepageLiquidLiteralTextFallback: "operational",
    homepageVisibleTextDelta: "required",
    homepageHiddenTextNoOp: "prohibited",
    homepageCanonicalRebuildFallback: "prohibited",
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

function stamp(response, source) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Homepage-Liquid-Fallback", KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD);
  headers.set("X-Kairos-Homepage-Text-Source", source);
  headers.set("X-Kairos-Homepage-Mode", "preserve-published-framework");
  headers.set("X-Kairos-Homepage-Source", "published-main-theme");
  headers.set("X-Kairos-Canonical-Rebuild-Fallback", "prohibited");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeJSON(request) {
  try { return await request.json(); } catch { return {}; }
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ status: status >= 500 ? "failed" : "needs-attention", build: BUILD, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Production-Entry": BUILD, "X-Content-Type-Options": "nosniff" },
  });
}
