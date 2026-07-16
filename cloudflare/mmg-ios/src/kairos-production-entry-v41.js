import runtime, { KairosProject } from "./kairos-production-entry-v40.js";
import { KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD } from "./kairos-homepage-preserve-planner-v1.js";
import renderedTextPlanner, { KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD } from "./kairos-rendered-homepage-text-planner-v1.js";
import templateTextExecutor, { KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD } from "./kairos-homepage-template-text-executor-v1.js";

const BUILD = "kairos-production-entry-20260716-98";
const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === PLAN_ROUTE) {
        const payload = await safeJSON(request.clone());
        if (isPublishedFrameworkRequest(payload)) {
          return stamp(await renderedTextPlanner.fetch(request, env, ctx), "preserve-published-framework");
        }
      }
      if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) {
        const payload = await safeJSON(request.clone());
        if (isPublishedFrameworkPlan(payload)) {
          return stamp(await templateTextExecutor.fetch(request, env, ctx), "preserve-published-framework");
        }
      }
      let response = await runtime.fetch(request, env, ctx);
      if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await addHealth(response);
      return stamp(response, response.headers.get("X-Kairos-Homepage-Mode") || "passthrough");
    } catch (error) {
      return jsonError(Number(error?.statusCode || error?.status || 500), error?.code || "published_homepage_framework_edge_failed", error instanceof Error ? error.message : "Kairos published-framework homepage execution failed.");
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

function isPublishedFrameworkRequest(payload) {
  const mode = String(payload?.homepageMode || payload?.requestType || payload?.intent || "").trim().toLowerCase();
  return payload?.preservePublishedFramework === true
    || payload?.preserveExistingDesign === true
    || ["homepage-preserve-design", "preserve-published-framework", "preserve-current-design", "preserve-design"].includes(mode);
}

function isPublishedFrameworkPlan(payload) {
  const envelope = payload?.plan || {};
  const plan = envelope?.plan || {};
  return plan?.installationMode === "published-main-template-text-settings-v1"
    || plan?.preservePublishedFramework === true
    || envelope?.homepageMode === "preserve-published-framework";
}

async function addHealth(response) {
  let body;
  try { body = await response.clone().json(); } catch { return response; }
  body.build = BUILD;
  body.homepagePreserveDesign = {
    status: "operational",
    plannerBuild: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
    renderedTextPlannerBuild: KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD,
    executorBuild: KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD,
    contract: "published-main-template-to-text-only-staging-preview",
    renderedTextContract: "active-ordered-primary-copy-delta-required",
    sourceOfTruth: "published-main-theme",
    mutableFiles: ["templates/index.json"],
    mutableValues: "existing-customer-facing-string-settings-only",
    renderedMutableValues: "active-ordered-customer-facing-string-settings-only",
    renderedTextRequirement: "at-least-one-active-primary-copy-delta",
    hiddenTextSuccess: "prohibited",
    disabledSectionTextSuccess: "prohibited",
    unorderedSectionOrBlockTextSuccess: "prohibited",
    input: "one-objective",
    stagingExecution: "automatic-after-rendered-source-bound-plan",
    preserved: [
      "section IDs and types",
      "block IDs and types",
      "section and block order",
      "Liquid files",
      "stylesheets",
      "assets",
      "classes",
      "colors",
      "typography",
      "pills",
      "cards",
      "spacing",
      "layout",
      "links",
      "animation",
      "responsive behavior",
    ],
    canonicalPackageInstallation: "prohibited-in-preserve-mode",
    structuralFallback: "stop-instead-of-rebuild",
    liveApplicationApproval: "required",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    homepagePreserveDesignExecution: "operational",
    homepagePublishedFrameworkSource: "operational",
    homepageTemplateTextOnlyMutation: "operational",
    homepageRenderedTextDelta: "required",
    homepageHiddenTextNoOp: "prohibited",
    homepageCanonicalRebuildFallback: "prohibited",
    oneButtonHomepagePreview: "operational",
    completedWorkTimelineArchive: "operational",
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

function stamp(response, mode) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Homepage-Preserve-Planner", KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD);
  headers.set("X-Kairos-Rendered-Homepage-Text-Planner", KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD);
  headers.set("X-Kairos-Homepage-Template-Text-Executor", KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD);
  if (mode === "preserve-current-design" || mode === "preserve-published-framework") {
    headers.set("X-Kairos-Homepage-Mode", "preserve-published-framework");
    headers.set("X-Kairos-Homepage-Source", "published-main-theme");
    headers.set("X-Kairos-Mutation-Scope", "templates-index-json-existing-rendered-string-settings-only");
    headers.set("X-Kairos-Rendered-Text-Delta-Required", "true");
    headers.set("X-Kairos-Hidden-Text-Noop", "prohibited");
    headers.set("X-Kairos-Canonical-Rebuild-Fallback", "prohibited");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeJSON(request) { try { return await request.json(); } catch { return {}; } }
function jsonError(status, code, message) {
  return new Response(JSON.stringify({ status: status >= 500 ? "failed" : "needs-attention", build: BUILD, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Production-Entry": BUILD, "X-Content-Type-Options": "nosniff" },
  });
}
