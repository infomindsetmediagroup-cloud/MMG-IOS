import runtime, { KairosProject } from "./kairos-production-entry-v43.js";
import {
  handleSourceBoundWeb003Request,
  KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD,
} from "./kairos-web003-source-bound-composite-runtime-v1.js";

const BUILD = "kairos-production-entry-20260717-102";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const composite = await handleSourceBoundWeb003Request(
        request,
        env,
        ctx,
        next => runtime.fetch(next, env, ctx),
      );
      if (composite) return stamp(composite);
    } catch (error) {
      return jsonError(
        Number(error?.statusCode || error?.status || 500),
        error?.code || "source_bound_web003_edge_failed",
        error instanceof Error ? error.message : "Kairos source-bound website execution failed.",
      );
    }

    let response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) {
      response = await addHealth(response);
    }
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
    sourceBoundCopyComposite: "operational",
    combinedCopyAndNativeThemePreview: "visible-text-delta-required",
    canonicalNoOpPreview: "prohibited",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    sourceBoundHomepageCopyPlusHeaderFooter: "operational",
    unchangedCompositePreview: "prohibited",
  };

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Source-Bound-WEB-003", KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({
    status: status >= 500 ? "failed" : "needs-attention",
    build: BUILD,
    error: { code, message },
  }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Production-Entry": BUILD,
      "X-Kairos-Source-Bound-WEB-003": KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
