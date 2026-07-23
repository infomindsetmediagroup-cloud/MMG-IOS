import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-customer-delivery-v2.js";
import {
  handleLocalInference,
  handleLocalInferenceObjectRequest,
  KAIROS_LOCAL_INFERENCE_BUILD,
} from "./kairos-local-inference-v1.js";

const BUILD = "kairos-production-entry-local-inference-20260723-1";

export class KairosProject extends CurrentKairosProject {
  async fetch(request) {
    const localInference = await handleLocalInferenceObjectRequest(this.state, request);
    if (localInference) return stamp(localInference);
    return stamp(await super.fetch(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    const localInference = await handleLocalInference(request.clone(), env);
    if (localInference) return stamp(localInference);
    return stamp(await currentRuntime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof currentRuntime.scheduled === "function") return currentRuntime.scheduled(controller, env, ctx);
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Local-Inference", KAIROS_LOCAL_INFERENCE_BUILD);
  headers.set("X-Kairos-Local-Inference-Entry", BUILD);
  headers.set("X-Kairos-Inference-Cost-Mode", "device-compute-no-paid-api");
  headers.set("X-Kairos-Cloudflare-Neurons", "0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
