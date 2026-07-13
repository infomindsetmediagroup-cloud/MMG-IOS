import runtime from "./kairos-standalone-command-worker-v2.js";
import { readShopifyDashboardAnalytics } from "./shopify-live-analytics-v1.js";
import { handleManuscriptRequest } from "./manuscript-studio-v1.js";

const BUILD = "kairos-standalone-command-20260712-15";
const CANONICAL_SHOPIFY_STORE = "07kd8e-qw.myshopify.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/manuscript/")) {
      try {
        const response = await handleManuscriptRequest(request, env);
        if (response) {
          const headers = new Headers(response.headers);
          headers.set("X-MMG-Runtime", BUILD);
          headers.set("X-Kairos-Kernel", "standalone-command-v5");
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        }
      } catch (error) {
        return json({ status: "failed", build: BUILD, error: { code: "manuscript_pipeline_failed", message: error instanceof Error ? error.message : "The manuscript pipeline failed." } }, 500);
      }
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
      body.shopifyStore = String(env.SHOPIFY_STORE_DOMAIN || CANONICAL_SHOPIFY_STORE).trim().toLowerCase();
      body.shopifyCredentialConfiguration = {
        clientCredentials: Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET),
        apiKeyCredentials: Boolean(env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET),
        appClientCredentials: Boolean(env.SHOPIFY_APP_CLIENT_ID && env.SHOPIFY_APP_CLIENT_SECRET),
        clientSecretKeyCredentials: Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET_KEY),
        adminAccessToken: Boolean(env.SHOPIFY_ADMIN_ACCESS_TOKEN),
      };
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyDashboardAnalytics: "configured",
        shopifyQLAnalytics: "configured",
        manuscriptStudio: "operational",
        manuscriptEditorialReview: env.OPENAI_API_KEY ? "operational" : "needs-configuration",
        kdpReadinessReview: env.OPENAI_API_KEY ? "operational" : "needs-configuration",
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
