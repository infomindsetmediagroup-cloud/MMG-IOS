import enhancedRuntime, { KairosProject } from "./kairos-production-entry-v38.js";

const BUILD = "kairos-tuesday-shell-enhanced-v38-runtime-20260717-1";
const TUESDAY_SHELL_BUILD = "kairos-command-hub-recovery-20260714-1";
const API_PREFIX = "/api/";
const CENTER_PREFIX = "/center/";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Browser loading is isolated from the enhanced execution graph. Every
    // non-API GET/HEAD request is served by the proven Tuesday asset shell.
    if ((request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith(API_PREFIX)) {
      const assetResponse = await serveTuesdayAsset(request, env, url.pathname);
      if (assetResponse) return stamp(assetResponse, "tuesday-browser-shell");
    }

    // Operational APIs use the enhanced v38 runtime: autonomy, native task
    // execution, direct child-card execution, and composite website production.
    try {
      const response = await enhancedRuntime.fetch(request, env, ctx);
      return stamp(response, "enhanced-v38-api-runtime");
    } catch (error) {
      return apiFailure(error);
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof enhancedRuntime.scheduled !== "function") return;
    try {
      return await enhancedRuntime.scheduled(controller, env, ctx);
    } catch (error) {
      console.error("Kairos enhanced scheduled runtime failed", error);
    }
  },
};

async function serveTuesdayAsset(request, env, pathname) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") return null;

  const assetUrl = new URL(request.url);
  assetUrl.search = "";

  if (pathname === "/" || pathname === "/index.html" || pathname.startsWith(CENTER_PREFIX)) {
    assetUrl.pathname = "/index.html";
  }

  const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    redirect: request.redirect,
  }));

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Kairos-Loading-Baseline", TUESDAY_SHELL_BUILD);
  headers.set("X-Kairos-Browser-Route", pathname.startsWith(CENTER_PREFIX) ? "tuesday-spa-shell" : "tuesday-assets");

  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function stamp(response, route) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Hybrid-Route", route);
  headers.set("X-Kairos-Loading-Baseline", TUESDAY_SHELL_BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function apiFailure(error) {
  const message = error instanceof Error ? error.message : "Kairos enhanced runtime could not complete this request.";
  return new Response(JSON.stringify({
    status: "failed",
    build: BUILD,
    error: {
      code: "enhanced_runtime_request_failed",
      message,
    },
    safeguards: {
      browserShellAvailable: true,
      browserLoadingBaseline: TUESDAY_SHELL_BUILD,
      failureContainedToRequest: true,
    },
  }), {
    status: 500,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Hybrid-Route": "enhanced-api-failure-contained",
      "X-Kairos-Loading-Baseline": TUESDAY_SHELL_BUILD,
    },
  });
}
