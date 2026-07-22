import previousRuntime, { KairosProject } from "./kairos-production-entry-publishing-readiness-v1.js";
import {
  inspectManuscriptOperation,
  KAIROS_MANUSCRIPT_OPERATION_BOUNDARY_BUILD,
} from "./kairos-manuscript-operation-boundary-v1.js";

const BUILD = "kairos-manuscript-online-20260722-1";
const STATUS_PATH = "/api/kairos/manuscripts/status";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === STATUS_PATH) {
      return status(env);
    }

    const decision = await inspectManuscriptOperation(request);
    if (!decision.allowed) {
      return json({
        status: "denied",
        build: BUILD,
        boundary: KAIROS_MANUSCRIPT_OPERATION_BOUNDARY_BUILD,
        manuscriptMode: true,
        shopifyWritesEnabled: false,
        error: {
          code: decision.code,
          message: decision.message,
        },
        operation: {
          method: decision.method,
          path: decision.path,
        },
      }, 403);
    }

    return stamp(await previousRuntime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (controller?.cron === "* * * * *") {
      console.warn("Minute-level website reconciliation is disabled in manuscript-only mode.");
      return;
    }

    if (typeof previousRuntime.scheduled === "function") {
      return previousRuntime.scheduled(controller, env, ctx);
    }
  },
};

function status(env) {
  const checks = {
    manuscriptRuntimeEnabled: String(env.KAIROS_MANUSCRIPT_RUNTIME_ENABLED || "").toLowerCase() === "true",
    durableObjectBinding: Boolean(env.KAIROS_PROJECTS),
    assetsBinding: Boolean(env.ASSETS && typeof env.ASSETS.fetch === "function"),
    imagesBinding: Boolean(env.IMAGES),
    aiBinding: Boolean(env.AI),
    apiTokenConfigured: nonEmpty(env.KAIROS_API_TOKEN),
    mediaSigningSecretConfigured: nonEmpty(env.KAIROS_MEDIA_SIGNING_SECRET),
    shopifyWritesDisabled: String(env.KAIROS_SHOPIFY_WRITES_ENABLED || "false").toLowerCase() !== "true",
  };

  const required = [
    "manuscriptRuntimeEnabled",
    "durableObjectBinding",
    "assetsBinding",
    "apiTokenConfigured",
    "mediaSigningSecretConfigured",
    "shopifyWritesDisabled",
  ];
  const missing = required.filter((name) => checks[name] !== true);
  const ready = missing.length === 0;

  return json({
    status: ready ? "online" : "not-ready",
    ready,
    build: BUILD,
    boundary: KAIROS_MANUSCRIPT_OPERATION_BOUNDARY_BUILD,
    mode: "manuscript-only",
    checks,
    missing,
    safeguards: {
      manuscriptOperationsOnly: true,
      shopifyAccess: "none",
      websiteMutationAuthorized: false,
      navigationMutationAuthorized: false,
      homepageMutationAuthorized: false,
      themeMutationAuthorized: false,
      productMutationAuthorized: false,
      minuteWebsiteCronEnabled: false,
    },
  }, ready ? 200 : 503);
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Manuscript-Online", BUILD);
  headers.set("X-Kairos-Manuscript-Boundary", KAIROS_MANUSCRIPT_OPERATION_BOUNDARY_BUILD);
  headers.set("X-Kairos-Operation-Mode", "manuscript-only");
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
      "X-Kairos-Manuscript-Online": BUILD,
      "X-Kairos-Manuscript-Boundary": KAIROS_MANUSCRIPT_OPERATION_BOUNDARY_BUILD,
      "X-Kairos-Operation-Mode": "manuscript-only",
    },
  });
}

function nonEmpty(value) {
  return String(value || "").trim().length > 0;
}
