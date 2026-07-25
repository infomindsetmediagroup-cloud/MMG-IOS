import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-customer-delivery-v2.js";
import {
  handleLocalInference,
  handleLocalInferenceObjectRequest,
  KAIROS_LOCAL_INFERENCE_BUILD,
} from "./kairos-local-inference-v1.js";
import {
  handleManuscriptGeneration,
  handleManuscriptGenerationObjectRequest,
  resumeManuscriptGenerationAlarm,
  KAIROS_MANUSCRIPT_GENERATION_BUILD,
} from "./kairos-manuscript-generation-job-v1.js";

const BUILD = "kairos-production-entry-backend-generation-20260725-2";

export class KairosProject extends CurrentKairosProject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const generation = await handleManuscriptGenerationObjectRequest(this.state, this.env, request);
    if (generation) return stamp(generation);
    const localInference = await handleLocalInferenceObjectRequest(this.state, request);
    if (localInference) return stamp(localInference);
    return stamp(await super.fetch(request));
  }

  async alarm() {
    const handled = await resumeManuscriptGenerationAlarm(this.state, this.env);
    if (handled) return;
    if (typeof super.alarm === "function") return super.alarm();
  }
}

export default {
  async fetch(request, env, ctx) {
    const generation = await handleManuscriptGeneration(request.clone(), env);
    if (generation) return stamp(generation);
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
  headers.set("X-Kairos-Manuscript-Generation", KAIROS_MANUSCRIPT_GENERATION_BUILD);
  headers.set("X-Kairos-Local-Inference-Entry", BUILD);
  headers.set("X-Kairos-Inference-Cost-Mode", "backend-provider-governed");
  headers.set("X-Kairos-Cloudflare-Neurons", "0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
