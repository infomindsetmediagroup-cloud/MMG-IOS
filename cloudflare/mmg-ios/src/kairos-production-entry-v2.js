import runtime, { KairosProject } from "./kairos-production-entry-v1.js";

const BUILD = "kairos-production-entry-20260713-2";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      return await runtime.fetch(request, env, ctx);
    } catch (error) {
      const url = new URL(request.url);
      const isShopifyExecution = url.pathname.startsWith("/api/shopify/staging/");
      const message = error instanceof Error && error.message
        ? error.message
        : "Kairos encountered an unexpected production runtime failure.";
      const status = Number(error?.statusCode || error?.status || 500);
      const safeStatus = status >= 400 && status <= 599 ? status : 500;

      return new Response(JSON.stringify({
        status: safeStatus >= 500 ? "failed" : "needs-input",
        build: BUILD,
        route: url.pathname,
        error: {
          code: error?.code || (isShopifyExecution ? "shopify_execution_failed" : "production_runtime_failed"),
          message,
        },
      }), {
        status: safeStatus,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-MMG-Runtime": BUILD,
          "X-Kairos-Exception-Guard": "active",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  },
};
