import localRuntime, {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-execution-v1.js";

export { KairosProject, KairosProjectAgent, KairosProjectFoundationWorkflow, KairosManuscriptGenerationWorkflow };

export const KAIROS_LOCAL_ONLY_ENTRY_BUILD = "kairos-local-only-entry-20260730-1";

const LEGACY_MANUSCRIPT_GENERATION = /^\/api\/production-registry\/manuscripts\/[a-z0-9-]{8,}\/generation-job$/i;
const REVENUE_GENERATION = /^\/api\/kairos\/revenue\/(bootstrap-live-runtime|execute-content-batch|execute-visual-batch|execute-package-batch)$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "POST" && (LEGACY_MANUSCRIPT_GENERATION.test(url.pathname) || REVENUE_GENERATION.test(url.pathname))) {
      return localRequired(url.pathname);
    }

    return localRuntime.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof localRuntime.scheduled === "function") return localRuntime.scheduled(controller, env, ctx);
    return undefined;
  },
};

function localRequired(pathname) {
  return new Response(JSON.stringify({
    status: "blocked",
    error: {
      code: "LOCAL_INFERENCE_REQUIRED",
      message: "This legacy backend generation route is disabled. Kairos production must run locally through the same-origin browser WebGPU runtime.",
    },
    route: pathname,
    inference: {
      provider: "browser-webgpu",
      runtime: "same-origin-webllm",
      noCost: true,
      externalPaidAPIUsed: false,
      cloudflareNeuronsUsed: 0,
      backendProviderCalls: false,
    },
    build: KAIROS_LOCAL_ONLY_ENTRY_BUILD,
  }), {
    status: 409,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Local-Only": KAIROS_LOCAL_ONLY_ENTRY_BUILD,
      "X-Kairos-External-Provider": "disabled",
    },
  });
}
