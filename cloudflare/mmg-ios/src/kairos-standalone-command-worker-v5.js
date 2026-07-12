import runtime from "./kairos-standalone-command-worker-v2.js";
import { readShopifyDashboardAnalytics } from "./shopify-live-analytics-v1.js";

const BUILD = "kairos-standalone-command-20260712-6";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/reauthorize" && request.method === "GET") {
      const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
      const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
      const storeName = storeDomain.replace(/\.myshopify\.com$/i, "");

      if (!clientId || !storeName) {
        return json({
          status: "needs-attention",
          build: BUILD,
          error: {
            code: "shopify_reauthorization_config_missing",
            message: "SHOPIFY_CLIENT_ID and SHOPIFY_STORE_DOMAIN must be configured before reauthorization.",
          },
        }, 500);
      }

      const installUrl = `https://admin.shopify.com/store/${encodeURIComponent(storeName)}/oauth/install?client_id=${encodeURIComponent(clientId)}`;
      return Response.redirect(installUrl, 302);
    }

    if (url.pathname === "/api/analytics/shopify" && request.method === "GET") {
      try {
        const analytics = await readShopifyDashboardAnalytics(env);
        return json({ status: analytics.status, build: BUILD, openaiAPIUsed: false, analytics });
      } catch (error) {
        return json({
          status: "needs-attention",
          build: BUILD,
          openaiAPIUsed: false,
          analytics: {
            status: "unavailable",
            source: "shopifyql-admin-api",
            checkedAt: new Date().toISOString(),
            metrics: [],
            requirements: ["Shopify read_reports access is required for dashboard analytics."],
          },
          error: {
            code: /read_reports|access denied|permission/i.test(String(error?.message || "")) ? "shopify_read_reports_required" : "shopify_analytics_unavailable",
            message: error instanceof Error ? error.message : "Shopify analytics are unavailable.",
          },
        }, 503);
      }
    }

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const response = await runtime.fetch(request, env, ctx);
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-command-v5";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyDashboardAnalytics: "configured",
        shopifyQLAnalytics: "configured",
        shopifyReauthorization: "configured",
      };
      return json(body, response.status);
    }

    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-command-v5");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

async function safeJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-command-v5",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
