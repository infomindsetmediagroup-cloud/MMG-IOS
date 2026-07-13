import runtime from "./kairos-standalone-command-worker-v2.js";
import { readShopifyDashboardAnalytics } from "./shopify-live-analytics-v1.js";
import { handleManuscriptRequest } from "./manuscript-studio-v1.js";
import { handleContentEngineRequest } from "./content-engine-v1.js";
import { handleVisualVerificationRequest } from "./shopify-visual-verification-v1.js";
import { handleReleaseControlRequest } from "./shopify-release-control-v1.js";

const BUILD = "kairos-standalone-command-20260712-20";
const CANONICAL_SHOPIFY_STORE = "07kd8e-qw.myshopify.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/shopify/release/")) {
      const response = await guarded(() => handleReleaseControlRequest(request, env), "release_control_failed");
      if (response) return withRuntimeHeaders(response);
    }

    if (url.pathname.startsWith("/api/shopify/staging/visual-")) {
      const response = await guarded(() => handleVisualVerificationRequest(request, env), "visual_verification_failed");
      if (response) return withRuntimeHeaders(response);
    }

    if (url.pathname === "/api/inference/health" && request.method === "GET") {
      return withRuntimeHeaders(json({ status: "deferred", reachable: false, provider: "none-active", build: BUILD, message: "Private generative intelligence is intentionally deferred for the current launch." }));
    }

    if (url.pathname.startsWith("/api/manuscript/")) {
      const response = await guarded(() => handleManuscriptRequest(request, env), "manuscript_pipeline_failed");
      if (response) return withRuntimeHeaders(response);
    }

    if (url.pathname.startsWith("/api/content/")) {
      const response = await guarded(() => handleContentEngineRequest(request, env), "content_engine_failed");
      if (response) return withRuntimeHeaders(response);
    }

    if (url.pathname === "/api/analytics/shopify" && request.method === "GET") {
      try {
        const analytics = await readShopifyDashboardAnalytics(env);
        return json({ status: analytics.status, build: BUILD, externalModelAPIUsed: false, analytics });
      } catch (error) {
        return json({ status: "needs-attention", build: BUILD, externalModelAPIUsed: false, analytics: { status: "unavailable", source: "shopifyql-admin-api", checkedAt: new Date().toISOString(), metrics: [], requirements: ["Shopify read_reports access is required for dashboard analytics."] }, error: { code: /read_reports|access denied|permission/i.test(String(error?.message || "")) ? "shopify_read_reports_required" : "shopify_analytics_unavailable", message: error instanceof Error ? error.message : "Shopify analytics are unavailable." } }, 503);
      }
    }

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const response = await runtime.fetch(request, env, ctx);
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-command-v5";
      body.launchMode = "operational-non-generative";
      body.deploymentPlatform = "cloudflare";
      body.vercelStatusIgnored = true;
      body.shopifyStore = String(env.SHOPIFY_STORE_DOMAIN || CANONICAL_SHOPIFY_STORE).trim().toLowerCase();
      body.intelligenceRuntime = { provider: "none-active", configured: false, status: "deferred", policy: "no-external-provider-fallback" };
      body.shopifyCredentialConfiguration = {
        clientCredentials: Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET),
        apiKeyCredentials: Boolean(env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET),
        appClientCredentials: Boolean(env.SHOPIFY_APP_CLIENT_ID && env.SHOPIFY_APP_CLIENT_SECRET),
        clientSecretKeyCredentials: Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET_KEY),
        adminAccessToken: Boolean(env.SHOPIFY_ADMIN_ACCESS_TOKEN)
      };
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyDashboardAnalytics: "configured",
        shopifyQLAnalytics: "configured",
        governedWebsiteRetool: "operational",
        shopifyMutationExecution: "operational",
        stagingVisualVerification: "operational",
        executiveVisualApprovalGate: "operational",
        stagingPreviewPackage: "operational",
        shopifyReleasePreparation: "operational",
        executivePublicationApproval: "operational",
        stagingToLiveThemePublication: "operational",
        liveStorefrontVerification: "operational",
        oneClickThemeRollback: "operational",
        manuscriptStudio: "intake-only",
        docxExtraction: "operational",
        pdfTextExtraction: "operational",
        pdfOCR: "not-enabled",
        privateInferenceGateway: "deferred",
        manuscriptEditorialReview: "deferred",
        kdpReadinessReview: "deferred",
        socialContentProduction: "deferred",
        productAssetCopy: "deferred",
        bookDevelopment: "deferred",
        imageGeneration: "not-enabled",
        videoGeneration: "not-enabled",
        audioGeneration: "not-enabled"
      };
      return json(body, response.status);
    }

    return withRuntimeHeaders(await runtime.fetch(request, env, ctx));
  }
};

async function guarded(run, code) {
  try { return await run(); }
  catch (error) {
    const status = Number(error?.statusCode || 500);
    return json({ status: status >= 500 ? "failed" : "needs-input", build: BUILD, error: { code: error?.code || code, message: error instanceof Error ? error.message : "Kairos could not complete this request." } }, status);
  }
}
function withRuntimeHeaders(response) { const headers = new Headers(response.headers); headers.set("X-MMG-Runtime", BUILD); headers.set("X-Kairos-Kernel", "standalone-command-v5"); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-command-v5", "X-Content-Type-Options": "nosniff" } }); }
