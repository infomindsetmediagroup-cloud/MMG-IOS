import runtime from "./kairos-command-hub-v29.js";
import { safeJSON } from "./kairos-compact-homepage-utils-v1.js";

const BUILD = "kairos-command-hub-20260712-30";
const WEBSITE_ACTIONS = new Set(["website", "website-retool", "shopify-website", "homepage-retool"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/hub/run" && request.method === "POST") {
      const body = await safeJSON(request.clone());
      const action = String(body?.action || "").trim().toLowerCase();
      if (WEBSITE_ACTIONS.has(action)) {
        const objective = String(body?.objective || "").trim();
        const deterministicURL = new URL("/api/shopify/staging/plan/jobs", request.url);
        return runtime.fetch(new Request(deterministicURL, {
          method: "POST",
          headers: deterministicHeaders(request.headers),
          body: JSON.stringify({ objective }),
        }), env, ctx);
      }
    }

    const response = await runtime.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "command-hub-v30";
      body.experience = {
        ...(body.experience || {}),
        websitePlanningTransport: "deterministic-source-grounded",
        websiteExecutionTransport: "deterministic-staging-write-and-readback",
        openaiRequiredForHomepageRetool: false,
      };
      body.capabilities = {
        ...(body.capabilities || {}),
        deterministicWebsiteRouteGuard: "operational",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

function deterministicHeaders(headers) {
  const next = new Headers(headers);
  next.set("Content-Type", "application/json");
  next.set("Accept", "application/json");
  next.set("X-Kairos-Website-Engine", "deterministic-no-api-v30");
  return next;
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "command-hub-v30");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "command-hub-v30" } });
}
