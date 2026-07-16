import runtime, { KairosProject } from "./kairos-production-entry-v39.js";
import preservePlanner, { KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD } from "./kairos-homepage-preserve-planner-v1.js";
import liquidContentExecutor from "./kairos-liquid-content-only-executor-v1.js";

const BUILD = "kairos-production-entry-20260716-97";
const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === PLAN_ROUTE) {
        const payload = await safeJSON(request.clone());
        if (isPreserveDesignRequest(payload)) return stamp(await preservePlanner.fetch(request, env, ctx), "preserve-current-design");
      }
      if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) {
        const payload = await safeJSON(request.clone());
        if (isPreserveDesignPlan(payload)) return stamp(await liquidContentExecutor.fetch(request, env, ctx), "preserve-current-design");
      }
      let response = await runtime.fetch(request, env, ctx);
      if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await addHealth(response);
      return stamp(response, "passthrough");
    } catch (error) {
      return jsonError(Number(error?.statusCode || error?.status || 500), error?.code || "homepage_preserve_edge_failed", error instanceof Error ? error.message : "Kairos preserve-design homepage execution failed.");
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

function isPreserveDesignRequest(payload) {
  const mode = String(payload?.homepageMode || payload?.requestType || payload?.intent || "").trim().toLowerCase();
  return payload?.preserveExistingDesign === true || ["homepage-preserve-design", "preserve-current-design", "preserve-design"].includes(mode);
}

function isPreserveDesignPlan(payload) {
  const envelope = payload?.plan || {};
  const plan = envelope?.plan || {};
  const mode = String(envelope?.homepageMode || envelope?.requestType || plan?.homepageMode || "").trim().toLowerCase();
  return plan?.preserveExistingDesign === true || ["homepage-preserve-design", "preserve-current-design", "preserve-design"].includes(mode);
}

async function addHealth(response) {
  let body;
  try { body = await response.clone().json(); } catch { return response; }
  body.build = BUILD;
  body.homepagePreserveDesign = {
    status: "operational",
    build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
    contract: "objective-to-node-preserving-homepage-preview",
    input: "one-objective",
    stagingExecution: "automatic-after-source-bound-plan",
    preserved: ["template", "stylesheet", "Liquid and HTML tokens", "classes", "colors", "typography", "pills", "cards", "spacing", "section order", "links"],
    liveApplicationApproval: "required",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    homepagePreserveDesignExecution: "operational",
    oneButtonHomepagePreview: "operational",
    completedWorkTimelineArchive: "dashboard-bound",
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
  if (mode === "preserve-current-design") {
    headers.set("X-Kairos-Homepage-Mode", mode);
    headers.set("X-Kairos-Design-Preservation", "template-css-markup-node-distribution");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeJSON(request) { try { return await request.json(); } catch { return {}; } }
function jsonError(status, code, message) { return new Response(JSON.stringify({ status: status >= 500 ? "failed" : "needs-attention", build: BUILD, error: { code, message } }), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Production-Entry": BUILD, "X-Content-Type-Options": "nosniff" } }); }
