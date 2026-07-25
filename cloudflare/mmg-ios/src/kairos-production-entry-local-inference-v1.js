import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-customer-delivery-v2.js";
import { handleLocalInference, handleLocalInferenceObjectRequest, KAIROS_LOCAL_INFERENCE_BUILD } from "./kairos-local-inference-v1.js";
import { handleManuscriptGeneration, handleManuscriptGenerationObjectRequest, resumeManuscriptGenerationAlarm, KAIROS_MANUSCRIPT_GENERATION_BUILD } from "./kairos-manuscript-generation-job-v1.js";
import { handleCanonicalManuscriptStart, KAIROS_MANUSCRIPT_START_ROUTER_BUILD } from "./kairos-manuscript-start-router-v1.js";
import { handlePastedManuscriptSource, handlePastedManuscriptSourceObjectRequest, KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD } from "./kairos-pasted-manuscript-source-v1.js";
import { handleKairosRuntimeHealth, KAIROS_RUNTIME_HEALTH_BUILD, KAIROS_CONTRACT_VERSION } from "./kairos-runtime-health-v1.js";
import { handleKairosProjectAgentAPI, routeKairosProjectAgentRequest, KAIROS_PROJECT_AGENT_API_BUILD } from "./kairos-project-agent-api-v1.js";
import { KairosProjectAgent, KAIROS_PROJECT_AGENT_BUILD } from "./kairos-project-agent-v1.js";
import { KairosProjectFoundationWorkflow, KAIROS_PROJECT_FOUNDATION_WORKFLOW_BUILD } from "./kairos-project-foundation-workflow-v1.js";
import { KairosManuscriptGenerationWorkflow, KAIROS_MANUSCRIPT_GENERATION_WORKFLOW_BUILD } from "./kairos-manuscript-generation-workflow-v1.js";

const BUILD = "kairos-production-entry-canonical-manuscript-start-20260725-7";

export { KairosProjectAgent, KairosProjectFoundationWorkflow };
export { KairosManuscriptGenerationWorkflow };

export class KairosProject extends CurrentKairosProject {
  constructor(state, env) { super(state, env); this.state = state; this.env = env; }
  async fetch(request) {
    const pastedSource = await handlePastedManuscriptSourceObjectRequest(this.state, request); if (pastedSource) return stamp(pastedSource);
    const generation = await handleManuscriptGenerationObjectRequest(this.state, this.env, request); if (generation) return stamp(generation);
    const localInference = await handleLocalInferenceObjectRequest(this.state, request); if (localInference) return stamp(localInference);
    return stamp(await super.fetch(request));
  }
  async alarm() { const handled = await resumeManuscriptGenerationAlarm(this.state, this.env); if (handled) return; if (typeof super.alarm === "function") return super.alarm(); }
}

export default {
  async fetch(request, env, ctx) {
    const projectAgentAPI = await handleKairosProjectAgentAPI(request.clone(), env); if (projectAgentAPI) return stamp(projectAgentAPI);
    const agentResponse = await routeKairosProjectAgentRequest(request, env); if (agentResponse) return agentResponse;
    const runtimeHealth = handleKairosRuntimeHealth(request.clone(), env); if (runtimeHealth) return stamp(runtimeHealth);
    const pastedSource = await handlePastedManuscriptSource(request.clone(), env); if (pastedSource) return stamp(pastedSource);
    const canonicalStart = await handleCanonicalManuscriptStart(request.clone(), env); if (canonicalStart) return stamp(canonicalStart);
    const generation = await handleManuscriptGeneration(request.clone(), env); if (generation) return stamp(generation);
    const localInference = await handleLocalInference(request.clone(), env); if (localInference) return stamp(localInference);
    return stamp(await currentRuntime.fetch(request, env, ctx));
  },
  async scheduled(controller, env, ctx) { if (typeof currentRuntime.scheduled === "function") return currentRuntime.scheduled(controller, env, ctx); },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Local-Inference", KAIROS_LOCAL_INFERENCE_BUILD);
  headers.set("X-Kairos-Manuscript-Generation", KAIROS_MANUSCRIPT_GENERATION_BUILD);
  headers.set("X-Kairos-Manuscript-Workflow", KAIROS_MANUSCRIPT_GENERATION_WORKFLOW_BUILD);
  headers.set("X-Kairos-Manuscript-Start-Router", KAIROS_MANUSCRIPT_START_ROUTER_BUILD);
  headers.set("X-Kairos-Pasted-Manuscript-Source", KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD);
  headers.set("X-Kairos-Runtime-Health", KAIROS_RUNTIME_HEALTH_BUILD);
  headers.set("X-Kairos-Project-Agent", KAIROS_PROJECT_AGENT_BUILD);
  headers.set("X-Kairos-Project-Agent-API", KAIROS_PROJECT_AGENT_API_BUILD);
  headers.set("X-Kairos-Project-Workflow", KAIROS_PROJECT_FOUNDATION_WORKFLOW_BUILD);
  headers.set("X-Kairos-Contract-Version", KAIROS_CONTRACT_VERSION);
  headers.set("X-Kairos-Local-Inference-Entry", BUILD);
  headers.set("X-Kairos-Inference-Cost-Mode", "backend-provider-governed");
  headers.set("X-Kairos-Cloudflare-Neurons", "0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
