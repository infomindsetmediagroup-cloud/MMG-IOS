import previousRuntime, { KairosProject } from "./kairos-production-entry-package-images-v1.js";
import { inspectShopifyAuthConfiguration } from "./kairos-shopify-auth-v1.js";

const BUILD = "kairos-publishing-readiness-20260722-2";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/kairos/readiness") {
      return readiness(env);
    }
    return previousRuntime.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof previousRuntime.scheduled === "function") {
      return previousRuntime.scheduled(controller, env, ctx);
    }
  },
};

function readiness(env) {
  const shopifyAuth = inspectShopifyAuthConfiguration(env);
  const checks = {
    durableObjectBinding: Boolean(env.KAIROS_PROJECTS),
    imagesBinding: Boolean(env.IMAGES && typeof env.IMAGES.input === "function"),
    aiBinding: Boolean(env.AI),
    assetsBinding: Boolean(env.ASSETS),
    apiTokenConfigured: nonEmpty(env.KAIROS_API_TOKEN),
    mediaSigningSecretConfigured: nonEmpty(env.KAIROS_MEDIA_SIGNING_SECRET),
    shopifyDomainConfigured: nonEmpty(env.SHOPIFY_STORE_DOMAIN),
    shopifyAuthenticationConfigured: shopifyAuth.authenticationConfigured,
    shopifyClientIdConfigured: shopifyAuth.clientIdConfigured,
    shopifyClientSecretConfigured: shopifyAuth.clientSecretConfigured,
    shopifyStaticAdminTokenConfigured: shopifyAuth.staticTokenConfigured,
    storefrontOriginSecure: /^https:\/\//.test(String(env.MMG_STOREFRONT_ORIGIN || "")),
  };

  const required = [
    "durableObjectBinding",
    "imagesBinding",
    "assetsBinding",
    "apiTokenConfigured",
    "mediaSigningSecretConfigured",
    "shopifyDomainConfigured",
    "shopifyAuthenticationConfigured",
    "storefrontOriginSecure",
  ];
  const missing = required.filter((name) => checks[name] !== true);
  const ready = missing.length === 0;

  return new Response(JSON.stringify({
    status: ready ? "ready" : "not-ready",
    build: BUILD,
    ready,
    checks,
    missing,
    shopifyAuthenticationMode: shopifyAuth.preferredMode,
    safeguards: {
      shopifyTargetStatus: "DRAFT",
      livePublicationAuthorized: false,
      storefrontThemeMutationAuthorized: false,
    },
  }), {
    status: ready ? 200 : 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Readiness-Build": BUILD,
    },
  });
}

function nonEmpty(value) {
  return String(value || "").trim().length > 0;
}
