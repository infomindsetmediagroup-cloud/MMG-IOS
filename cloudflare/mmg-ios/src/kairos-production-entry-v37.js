import runtime, { KairosProject } from "./kairos-production-entry-v36.js";
import {
  handleWeb003CompositeRequest,
  KAIROS_WEB003_COMPOSITE_BUILD,
} from "./kairos-web003-composite-runtime-v1.js";

const BUILD = "kairos-production-entry-20260716-94";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const composite = await handleWeb003CompositeRequest(
        request,
        env,
        ctx,
        next => runtime.fetch(next, env, ctx),
      );
      if (composite) return stamp(composite);
    } catch (error) {
      return jsonError(
        Number(error?.status || 500),
        error?.code || "web003_composite_edge_failed",
        error instanceof Error ? error.message : "The WEB-003 composite edge failed.",
      );
    }

    let response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) {
      response = await addCompositeHealth(response);
    }
    return stamp(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

async function addCompositeHealth(response) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }
  body.build = BUILD;
  body.websiteProduction = {
    ...(body.websiteProduction || {}),
    web003CompositeRuntime: "operational",
    canonicalHomepageAndNativeHeader: "single-source-bound-preview-package",
    compositePreviewApproval: "required",
    compositeLiveReadback: "required",
    compositeRollback: "available",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    web003CompositeWebsiteProduction: "operational",
    nativeShopifyHeaderRetool: "verified-values-and-explicit-selection",
    compositeThemeFileRelease: "source-hash-bound",
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
  headers.set("X-Kairos-WEB-003-Runtime", KAIROS_WEB003_COMPOSITE_BUILD);
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
      "X-Content-Type-Options": "nosniff",
    },
  });
}
