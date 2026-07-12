import reconciledWorker from "./reconciled-worker.js";

const RESET_BUILD = "kairos-runtime-reset-20260711-1";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        status: "reset",
        runtime: "cloudflare-workers",
        build: RESET_BUILD,
        operationalMode: "recovery",
        capabilities: {
          commandCenterShell: "available",
          operatorSession: "available",
          kairosAdvisory: "available",
          storefrontInspection: "read-only-validation-required",
          shopifyThemePlanning: "not-operational",
          shopifyThemeMutation: "not-operational",
          productPublishing: "not-implemented",
          collectionPublishing: "not-implemented",
          navigationPublishing: "not-implemented",
        },
        message: "Kairos is in formal runtime reset. External Shopify mutation is disabled until the staging-theme execution vertical passes acceptance testing.",
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/theme-plan") {
      return json({
        error: {
          code: "capability_not_operational",
          message: "Shopify theme planning is disabled during the formal Kairos runtime reset. The staging-theme workflow must pass acceptance testing before this capability is re-enabled.",
        },
      }, 503);
    }

    if (url.pathname === "/api/actions" && request.method === "POST") {
      return json({
        error: {
          code: "external_mutation_disabled",
          message: "External Shopify mutation is disabled during the formal Kairos runtime reset.",
        },
      }, 503);
    }

    return reconciledWorker.fetch(request, env, ctx);
  },
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": RESET_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
