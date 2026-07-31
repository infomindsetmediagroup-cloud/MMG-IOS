import canonicalRuntime, {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-only-v1.js";
import {
  handleDedicatedManuscriptSource,
  KairosManuscriptSource,
  KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
} from "./kairos-manuscript-source-shard-v1.js";

export {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
  KairosManuscriptSource,
};

export const KAIROS_LOCAL_CANONICAL_ENTRY_BUILD = "kairos-local-canonical-entry-20260730-1";

const PROVIDER_INDEPENDENT_OPERATIONAL_PATHS = new Set([
  "/api/hub/run",
  "/api/workflows",
]);

export default {
  async fetch(request, env, ctx) {
    const dedicatedSource = await handleDedicatedManuscriptSource(request, env);
    if (dedicatedSource) return stamp(dedicatedSource);

    const url = new URL(request.url);
    const runtimeEnv = PROVIDER_INDEPENDENT_OPERATIONAL_PATHS.has(url.pathname)
      ? operationalCompatibilityEnv(env)
      : providerBlockedEnv(env);
    return stamp(await canonicalRuntime.fetch(request, runtimeEnv, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof canonicalRuntime.scheduled === "function") {
      return canonicalRuntime.scheduled(controller, providerBlockedEnv(env), ctx);
    }
    return undefined;
  },
};

function providerBlockedEnv(env) {
  return new Proxy(env || {}, {
    get(target, property) {
      if (property === "OPENAI_API_KEY" || property === "KAIROS_MODEL_AUTH_TOKEN") return "";
      if (property === "KAIROS_MODEL_PROVIDER") return "browser-webgpu";
      if (property === "KAIROS_MODEL_ENDPOINT") return "";
      if (property === "KAIROS_MODEL_NAME" || property === "KAIROS_OPENAI_MODEL") return "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
      if (property === "KAIROS_LOCAL_INFERENCE_ENABLED" || property === "KAIROS_NO_COST_MODE") return "true";
      return Reflect.get(target, property);
    },
  });
}

function operationalCompatibilityEnv(env) {
  const blocked = providerBlockedEnv(env);
  return new Proxy(blocked, {
    get(target, property) {
      // The retired operational module still uses key presence as a readiness
      // flag for objective intake and workflow projection. These two routes are
      // non-generative, so a non-secret sentinel preserves compatibility without
      // permitting or performing any external provider request.
      if (property === "OPENAI_API_KEY") return "kairos-local-readiness-sentinel-not-a-provider-key";
      return Reflect.get(target, property);
    },
  });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Canonical-Local", KAIROS_LOCAL_CANONICAL_ENTRY_BUILD);
  headers.set("X-Kairos-Inference-Provider", "browser-webgpu");
  headers.set("X-Kairos-External-Provider", "disabled");
  headers.set("X-Kairos-OpenAI-Calls", "disabled");
  headers.set("X-Kairos-Source-Shard", headers.get("X-Kairos-Source-Shard") || KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
