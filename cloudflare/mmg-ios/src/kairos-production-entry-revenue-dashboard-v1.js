import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-local-inference-v1.js";
import {
  handleKairosRevenueProductAPI,
  handleKairosRevenueProductObjectRequest,
  KAIROS_REVENUE_PRODUCT_STORE_BUILD,
} from "./kairos-revenue-product-store-v1.js";

export {
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-inference-v1.js";

export const KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD = "kairos-revenue-dashboard-entry-20260729-2";

export class KairosProject extends CurrentKairosProject {
  async fetch(request) {
    const revenueResponse = await handleKairosRevenueProductObjectRequest(this.state, request);
    if (revenueResponse) return stampRevenueBoundary(revenueResponse);
    return super.fetch(request);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return serveDashboardAsset(request, env);
    }

    const revenueResponse = await handleKairosRevenueProductAPI(request.clone(), env);
    if (revenueResponse) return stampRevenueBoundary(revenueResponse);
    return currentRuntime.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof currentRuntime.scheduled === "function") {
      return currentRuntime.scheduled(controller, env, ctx);
    }
    return undefined;
  },
};

async function serveDashboardAsset(request, env) {
  if (!env?.ASSETS?.fetch) {
    return new Response("Kairos dashboard assets are unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.delete("Content-Disposition");
  headers.set("X-Kairos-Revenue-Dashboard-Entry", KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD);
  headers.set("X-Content-Type-Options", "nosniff");
  if ((headers.get("Content-Type") || "").includes("text/html")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function stampRevenueBoundary(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Revenue-Dashboard-Entry", KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD);
  headers.set("X-Kairos-Revenue-Product-Store", KAIROS_REVENUE_PRODUCT_STORE_BUILD);
  headers.set("X-Kairos-Automatic-Publication", "disabled");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
