import runtime, { KairosProject } from "./kairos-production-entry-v42.js";
import renderedTextPlanner from "./kairos-rendered-homepage-text-planner-v1.js";
import templateMarkupPlanner, { KAIROS_HOMEPAGE_TEMPLATE_MARKUP_TEXT_PLANNER_BUILD } from "./kairos-homepage-template-markup-text-planner-v1.js";
import liquidFallback, { KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD } from "./kairos-homepage-liquid-text-fallback-v1.js";
import instanceFallback, { KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD } from "./kairos-homepage-instance-liquid-fallback-v1.js";

const BUILD = "kairos-production-entry-20260717-100";
const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";
const PRIMARY_FALLBACK_CODES = new Set([
  "rendered_homepage_text_delta_missing",
  "published_homepage_text_settings_missing",
  "safe_template_text_changes_missing",
]);
const MARKUP_FALLBACK_CODES = new Set([
  "embedded_template_markup_text_missing",
  "safe_embedded_markup_text_changes_missing",
  "embedded_markup_text_patch_empty",
]);
const INSTANCE_FALLBACK_CODES = new Set([
  "homepage_liquid_scope_unsafe",
  "homepage_liquid_section_missing",
  "homepage_liquid_visible_text_missing",
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
          const primaryBody = await safeJSON(primary.clone());
          if (primary.ok || !PRIMARY_FALLBACK_CODES.has(String(primaryBody?.error?.code || ""))) return stamp(primary, "template-settings");

          const embedded = await templateMarkupPlanner.fetch(request.clone(), env, ctx);
          const embeddedBody = await safeJSON(embedded.clone());
          if (embedded.ok || !MARKUP_FALLBACK_CODES.has(String(embeddedBody?.error?.code || ""))) return stamp(embedded, "embedded-template-markup");

          const liquid = await liquidFallback.fetch(request.clone(), env, ctx);
          const liquidBody = await safeJSON(liquid.clone());
          if (liquid.ok || !INSTANCE_FALLBACK_CODES.has(String(liquidBody?.error?.code || ""))) return stamp(liquid, "homepage-specific-liquid-text");

          return stamp(await instanceFallback.fetch(request, env, ctx), "homepage-instance-clone");
        }
      }
      if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) {
        const payload = await safeJSON(request.clone());
        if (payload?.plan?.plan?.installationMode === "published-main-homepage-instance-liquid-text-v1") {
          return stamp(await instanceFallback.fetch(request, env, ctx), "homepage-instance-clone");
        }
      }
      let response = await runtime.fetch(request, env, ctx);
      if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await addHealth(response);
      return stamp(response, response.headers.get("X-Kairos-Homepage-Text-Source") || "passthrough");
    } catch (error) {
      return jsonError(Number(error?.statusCode || error?.status || 500), error?.code || "homepage_text_source_edge_failed", error instanceof Error ? error.message : "Kairos homepage text-source routing failed.");
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
    contract: "published-main-four-source-visible-text-preservation",
    sourceOrder: [
      "active rendered template text settings",
      "active embedded template HTML or Liquid text nodes",
      "homepage-specific section Liquid literal text",
      "homepage-instance isolated shared-section clone",
    ],
    templateMarkupPlannerBuild: KAIROS_HOMEPAGE_TEMPLATE_MARKUP_TEXT_PLANNER_BUILD,
    liquidFallbackBuild: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
    instanceFallbackBuild: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD,
    sourceOfTruth: "published-main-theme",
    visibleTextDeltaRequired: true,
    sharedSectionHandling: "clone-and-bind-homepage-instance-only",
    originalSharedSectionFiles: "immutable",
    homepageTemplateMutation: "selected-section-type-reference-only-when-isolation-required",
    cloneMarkupMutation: "literal-text-nodes-only",
    markupAndLiquidTokenMutation: "prohibited",
    CSSAssetClassDesignTokenMutation: "prohibited",
    canonicalPackageInstallation: "prohibited-in-preserve-mode",
    liveApplicationApproval: "required",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    homepageTemplateTextMutation: "operational",
    homepageEmbeddedTemplateMarkupTextMutation: "operational",
    homepageLiquidLiteralTextFallback: "operational",
    homepageSharedSectionInstanceIsolation: "operational",
    homepageOriginalSharedSectionProtection: "required",
    homepageInstanceCloneReadback: "required",
    homepageVisibleTextDelta: "required",
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
  headers.set("X-Kairos-Homepage-Template-Markup-Planner", KAIROS_HOMEPAGE_TEMPLATE_MARKUP_TEXT_PLANNER_BUILD);
  headers.set("X-Kairos-Homepage-Liquid-Fallback", KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD);
  headers.set("X-Kairos-Homepage-Instance-Fallback", KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD);
  headers.set("X-Kairos-Homepage-Text-Source", source);
  headers.set("X-Kairos-Homepage-Mode", "preserve-published-framework");
  headers.set("X-Kairos-Homepage-Source", "published-main-theme");
  headers.set("X-Kairos-Shared-Section-Handling", "homepage-instance-clone");
  headers.set("X-Kairos-Original-Shared-Sections", "immutable");
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
