import runtime, { KairosProject } from "./kairos-production-entry-v44.js";
import {
  handleDeterministicFirstWeb003Request,
  KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD,
} from "./kairos-web003-deterministic-first-runtime-v1.js";

const BUILD = "kairos-production-entry-20260717-103";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const deterministicPlan = await handleDeterministicFirstWeb003Request(request, env, ctx);
      if (deterministicPlan) return stamp(deterministicPlan);
    } catch (error) {
      return jsonError(
        Number(error?.statusCode || error?.status || 500),
        error?.code || "deterministic_first_web003_edge_failed",
        error instanceof Error ? error.message : "Kairos deterministic website planning failed.",
      );
    }

    let response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await addHealth(response);
    return stamp(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

async function addHealth(response) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }
  body.build = BUILD;
  body.websiteProduction = {
    ...(body.websiteProduction || {}),
    deterministicFirstComposite: "operational",
    combinedHomepagePlanning: "model-format-independent",
    visibleCopyDeltaBeforePreview: "required",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    deterministicFirstHomepageCopyPlusHeaderFooter: "operational",
    modelFormattedCopyPlanDependency: "retired-for-combined-retool",
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Deterministic-WEB-003", KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ status: status >= 500 ? "failed" : "needs-attention", build: BUILD, error: { code, message } }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Production-Entry": BUILD,
      "X-Kairos-Deterministic-WEB-003": KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
