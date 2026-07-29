import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-local-inference-v1.js";
import {
  handleKairosRevenueProductAPI,
  handleKairosRevenueProductObjectRequest,
  KAIROS_REVENUE_PRODUCT_STORE_BUILD,
} from "./kairos-revenue-product-store-v1.js";
import { readShopifyDashboardAnalyticsV3 } from "./shopify-live-analytics-v3.js";

export {
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-inference-v1.js";

export const KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD = "kairos-revenue-dashboard-entry-20260729-4";

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

    if (url.pathname === "/api/analytics/shopify" && request.method === "GET") {
      try {
        const analytics = await readShopifyDashboardAnalyticsV3(env);
        return json({ status: analytics.status, analytics });
      } catch (error) {
        return json({
          status: "needs-attention",
          analytics: { status: "unavailable", metrics: [] },
          error: {
            code: error?.code || "shopify_analytics_unavailable",
            message: error instanceof Error ? error.message : "Shopify analytics are unavailable.",
          },
        }, Number(error?.status || 503));
      }
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Revenue-Dashboard-Entry": KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD,
      "X-Kairos-Shopify-Analytics": "orders-fallback-v3",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
