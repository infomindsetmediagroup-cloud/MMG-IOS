import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-customer-delivery-v2.js";
import { handleKairosAPI, KAIROS_API_RUNTIME_BUILD, KAIROS_API_CONTRACT_VERSION } from "./kairos-api-runtime-v1.js";
import { handleGovernedKairosAPI, handleKairosAPIGovernanceObjectRequest, KAIROS_API_GOVERNANCE_BUILD } from "./kairos-api-governance-v1.js";
import { handleContextualKairosAPI, KAIROS_CONTEXT_ORCHESTRATOR_BUILD } from "./kairos-context-orchestrator-v1.js";
import { handleKairosKnowledgeObjectRequest, KAIROS_KNOWLEDGE_VAULT_BUILD } from "./kairos-knowledge-vault-v1.js";
import { handleKairosKnowledgeLifecycleObjectRequest, KAIROS_KNOWLEDGE_LIFECYCLE_BUILD } from "./kairos-knowledge-lifecycle-v1.js";
import { KAIROS_DEPARTMENT_REGISTRY_BUILD } from "./kairos-department-registry-v1.js";
import { handleKairosToolApprovalAPI, handleKairosToolApprovalObjectRequest, KAIROS_TOOL_APPROVAL_BUILD } from "./kairos-tool-approval-v1.js";
import { KAIROS_TOOL_REGISTRY_BUILD } from "./kairos-tool-registry-v1.js";
import { KAIROS_TOOL_ARGUMENTS_BUILD } from "./kairos-tool-arguments-v1.js";
import { executeKairosTool, KAIROS_TOOL_EXECUTORS_BUILD } from "./kairos-tool-executors-v1.js";
import { handleToolAwareKairosObjective, KAIROS_TOOL_OBJECTIVE_INTEGRATION_BUILD } from "./kairos-tool-objective-integration-v1.js";
import { handleKairosObservabilityAPI, handleKairosObservabilityObjectRequest, KAIROS_OBSERVABILITY_STORE_BUILD } from "./kairos-observability-store-v1.js";
import { observeKairosResponse, withKairosObservabilityStart, KAIROS_OBSERVABILITY_RUNTIME_BUILD } from "./kairos-observability-runtime-v1.js";
import { KAIROS_OBSERVABILITY_EVENTS_BUILD } from "./kairos-observability-events-v1.js";
import { handleKairosOperationsHealth, KAIROS_OPERATIONS_HEALTH_BUILD } from "./kairos-operations-health-v1.js";
import { handleKairosIncidentAPI, handleKairosIncidentObjectRequest, KAIROS_INCIDENT_STORE_BUILD } from "./kairos-incident-store-v1.js";
import { KAIROS_INCIDENT_LIFECYCLE_BUILD } from "./kairos-incident-lifecycle-v1.js";
import { handleKairosReleaseAPI, handleKairosReleaseObjectRequest, KAIROS_RELEASE_STORE_BUILD } from "./kairos-release-store-v1.js";
import { KAIROS_RELEASE_RECOVERY_BUILD } from "./kairos-release-recovery-v1.js";
import { handleKairosProductionReadinessAPI, handleKairosProductionReadinessObjectRequest, KAIROS_PRODUCTION_READINESS_STORE_BUILD } from "./kairos-production-readiness-store-v1.js";
import { KAIROS_PRODUCTION_READINESS_CERTIFICATION_BUILD } from "./kairos-production-readiness-certification-v1.js";
import { handleKairosControlledLaunchAPI, handleKairosControlledLaunchObjectRequest, KAIROS_CONTROLLED_LAUNCH_STORE_BUILD } from "./kairos-controlled-launch-store-v1.js";
import { KAIROS_CONTROLLED_LAUNCH_GOVERNANCE_BUILD } from "./kairos-controlled-launch-governance-v1.js";
import { handleKairosPostLaunchAssuranceAPI, handleKairosPostLaunchAssuranceObjectRequest, KAIROS_POST_LAUNCH_ASSURANCE_STORE_BUILD } from "./kairos-post-launch-assurance-store-v1.js";
import { KAIROS_POST_LAUNCH_ASSURANCE_BUILD } from "./kairos-post-launch-assurance-v1.js";
import { handleKairosOperationalContinuityAPI, handleKairosOperationalContinuityObjectRequest, KAIROS_OPERATIONAL_CONTINUITY_STORE_BUILD } from "./kairos-operational-continuity-store-v1.js";
import { KAIROS_OPERATIONAL_CONTINUITY_BUILD } from "./kairos-operational-continuity-v1.js";
import { handleKairosContinuousOperationalReviewAPI, handleKairosContinuousOperationalReviewObjectRequest, KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_STORE_BUILD } from "./kairos-continuous-operational-review-store-v1.js";
import { KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_BUILD } from "./kairos-continuous-operational-review-v1.js";
import { handleKairosPolicyExceptionAPI, handleKairosPolicyExceptionObjectRequest, KAIROS_POLICY_EXCEPTION_STORE_BUILD } from "./kairos-policy-exception-store-v1.js";
import { KAIROS_POLICY_EXCEPTION_GOVERNANCE_BUILD } from "./kairos-policy-exception-governance-v1.js";
import { handleLocalInference, handleLocalInferenceObjectRequest, KAIROS_LOCAL_INFERENCE_BUILD } from "./kairos-local-inference-v1.js";
import { handleManuscriptGeneration, handleManuscriptGenerationObjectRequest, resumeManuscriptGenerationAlarm, KAIROS_MANUSCRIPT_GENERATION_BUILD } from "./kairos-manuscript-generation-job-v1.js";
import { handleCanonicalManuscriptStart, KAIROS_MANUSCRIPT_START_ROUTER_BUILD } from "./kairos-manuscript-start-router-v1.js";
import { handlePastedManuscriptSource, handlePastedManuscriptSourceObjectRequest, KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD } from "./kairos-pasted-manuscript-source-v1.js";
import { handleKairosRuntimeHealth, KAIROS_RUNTIME_HEALTH_BUILD, KAIROS_CONTRACT_VERSION } from "./kairos-runtime-health-v1.js";
import { handleKairosProjectAgentAPI, routeKairosProjectAgentRequest, KAIROS_PROJECT_AGENT_API_BUILD } from "./kairos-project-agent-api-v1.js";
import { KairosProjectAgent, KAIROS_PROJECT_AGENT_BUILD } from "./kairos-project-agent-v1.js";
import { KairosProjectFoundationWorkflow, KAIROS_PROJECT_FOUNDATION_WORKFLOW_BUILD } from "./kairos-project-foundation-workflow-v1.js";
import { KairosManuscriptGenerationWorkflow, KAIROS_MANUSCRIPT_GENERATION_WORKFLOW_BUILD } from "./kairos-manuscript-generation-workflow-v1.js";

const BUILD = "kairos-production-entry-policy-exception-governance-20260726-24";

export { KairosProjectAgent, KairosProjectFoundationWorkflow };
export { KairosManuscriptGenerationWorkflow };

export class KairosProject extends CurrentKairosProject {
  constructor(state, env) { super(state, env); this.state = state; this.env = env; }
  async fetch(request) {
    const apiGovernance = await handleKairosAPIGovernanceObjectRequest(this.state, request); if (apiGovernance) return stamp(apiGovernance);
    const toolApproval = await handleKairosToolApprovalObjectRequest(this.state, request); if (toolApproval) return stamp(toolApproval);
    const policyException = await handleKairosPolicyExceptionObjectRequest(this.state, request); if (policyException) return stamp(policyException);
    const operationalReview = await handleKairosContinuousOperationalReviewObjectRequest(this.state, request); if (operationalReview) return stamp(operationalReview);
    const continuity = await handleKairosOperationalContinuityObjectRequest(this.state, request); if (continuity) return stamp(continuity);
    const assurance = await handleKairosPostLaunchAssuranceObjectRequest(this.state, request); if (assurance) return stamp(assurance);
    const controlledLaunch = await handleKairosControlledLaunchObjectRequest(this.state, request); if (controlledLaunch) return stamp(controlledLaunch);
    const readiness = await handleKairosProductionReadinessObjectRequest(this.state, request); if (readiness) return stamp(readiness);
    const release = await handleKairosReleaseObjectRequest(this.state, request); if (release) return stamp(release);
    const incident = await handleKairosIncidentObjectRequest(this.state, request); if (incident) return stamp(incident);
    const observability = await handleKairosObservabilityObjectRequest(this.state, request); if (observability) return stamp(observability);
    const knowledgeLifecycle = await handleKairosKnowledgeLifecycleObjectRequest(this.state, request); if (knowledgeLifecycle) return stamp(knowledgeLifecycle);
    const knowledge = await handleKairosKnowledgeObjectRequest(this.state, request); if (knowledge) return stamp(knowledge);
    const pastedSource = await handlePastedManuscriptSourceObjectRequest(this.state, request); if (pastedSource) return stamp(pastedSource);
    const generation = await handleManuscriptGenerationObjectRequest(this.state, this.env, request); if (generation) return stamp(generation);
    const localInference = await handleLocalInferenceObjectRequest(this.state, request); if (localInference) return stamp(localInference);
    return stamp(await super.fetch(request));
  }
  async alarm() { const handled = await resumeManuscriptGenerationAlarm(this.state, this.env); if (handled) return; if (typeof super.alarm === "function") return super.alarm(); }
}

export default {
  async fetch(request, env, ctx) {
    const observedRequest = withKairosObservabilityStart(request);
    const health = await handleKairosOperationsHealth(observedRequest.clone(), env); if (health) return stamp(health);
    const policyException = await handleKairosPolicyExceptionAPI(observedRequest.clone(), env); if (policyException) return stamp(policyException);
    const operationalReview = await handleKairosContinuousOperationalReviewAPI(observedRequest.clone(), env); if (operationalReview) return stamp(operationalReview);
    const continuity = await handleKairosOperationalContinuityAPI(observedRequest.clone(), env); if (continuity) return stamp(continuity);
    const assurance = await handleKairosPostLaunchAssuranceAPI(observedRequest.clone(), env); if (assurance) return stamp(assurance);
    const controlledLaunch = await handleKairosControlledLaunchAPI(observedRequest.clone(), env); if (controlledLaunch) return stamp(controlledLaunch);
    const readiness = await handleKairosProductionReadinessAPI(observedRequest.clone(), env); if (readiness) return stamp(readiness);
    const releases = await handleKairosReleaseAPI(observedRequest.clone(), env); if (releases) return stamp(releases);
    const incidents = await handleKairosIncidentAPI(observedRequest.clone(), env); if (incidents) return stamp(incidents);
    const operations = await handleKairosObservabilityAPI(observedRequest.clone(), env); if (operations) return stamp(operations);
    const toolApproval = await handleKairosToolApprovalAPI(observedRequest.clone(), env, (input) => executeKairosTool({ ...input, env })); if (toolApproval) return stamp(await observeKairosResponse(observedRequest, toolApproval, env, ctx));
    const kairosAPI = await handleGovernedKairosAPI(observedRequest.clone(), env, (governedRequest) => handleToolAwareKairosObjective(governedRequest, env, (toolAwareRequest) => handleContextualKairosAPI(toolAwareRequest, env, (contextualRequest) => handleKairosAPI(contextualRequest, env)))); if (kairosAPI) return stamp(await observeKairosResponse(observedRequest, kairosAPI, env, ctx));
    const projectAgentAPI = await handleKairosProjectAgentAPI(observedRequest.clone(), env); if (projectAgentAPI) return stamp(projectAgentAPI);
    const agentResponse = await routeKairosProjectAgentRequest(observedRequest, env); if (agentResponse) return agentResponse;
    const runtimeHealth = handleKairosRuntimeHealth(observedRequest.clone(), env); if (runtimeHealth) return stamp(runtimeHealth);
    const pastedSource = await handlePastedManuscriptSource(observedRequest.clone(), env); if (pastedSource) return stamp(pastedSource);
    const canonicalStart = await handleCanonicalManuscriptStart(observedRequest.clone(), env); if (canonicalStart) return stamp(canonicalStart);
    const generation = await handleManuscriptGeneration(observedRequest.clone(), env); if (generation) return stamp(generation);
    const localInference = await handleLocalInference(observedRequest.clone(), env); if (localInference) return stamp(localInference);
    return stamp(await currentRuntime.fetch(observedRequest, env, ctx));
  },
  async scheduled(controller, env, ctx) { if (typeof currentRuntime.scheduled === "function") return currentRuntime.scheduled(controller, env, ctx); },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-API-Runtime", KAIROS_API_RUNTIME_BUILD);
  headers.set("X-Kairos-API-Contract", KAIROS_API_CONTRACT_VERSION);
  headers.set("X-Kairos-API-Governance", KAIROS_API_GOVERNANCE_BUILD);
  headers.set("X-Kairos-Context-Orchestrator", KAIROS_CONTEXT_ORCHESTRATOR_BUILD);
  headers.set("X-Kairos-Knowledge-Vault", KAIROS_KNOWLEDGE_VAULT_BUILD);
  headers.set("X-Kairos-Knowledge-Lifecycle", KAIROS_KNOWLEDGE_LIFECYCLE_BUILD);
  headers.set("X-Kairos-Department-Registry", KAIROS_DEPARTMENT_REGISTRY_BUILD);
  headers.set("X-Kairos-Tool-Registry", KAIROS_TOOL_REGISTRY_BUILD);
  headers.set("X-Kairos-Tool-Arguments", KAIROS_TOOL_ARGUMENTS_BUILD);
  headers.set("X-Kairos-Tool-Approval", KAIROS_TOOL_APPROVAL_BUILD);
  headers.set("X-Kairos-Tool-Executors", KAIROS_TOOL_EXECUTORS_BUILD);
  headers.set("X-Kairos-Tool-Objective-Integration", KAIROS_TOOL_OBJECTIVE_INTEGRATION_BUILD);
  headers.set("X-Kairos-Observability-Events", KAIROS_OBSERVABILITY_EVENTS_BUILD);
  headers.set("X-Kairos-Observability-Store", KAIROS_OBSERVABILITY_STORE_BUILD);
  headers.set("X-Kairos-Observability-Runtime", KAIROS_OBSERVABILITY_RUNTIME_BUILD);
  headers.set("X-Kairos-Operations-Health", KAIROS_OPERATIONS_HEALTH_BUILD);
  headers.set("X-Kairos-Incident-Lifecycle", KAIROS_INCIDENT_LIFECYCLE_BUILD);
  headers.set("X-Kairos-Incident-Store", KAIROS_INCIDENT_STORE_BUILD);
  headers.set("X-Kairos-Release-Recovery", KAIROS_RELEASE_RECOVERY_BUILD);
  headers.set("X-Kairos-Release-Store", KAIROS_RELEASE_STORE_BUILD);
  headers.set("X-Kairos-Production-Readiness-Certification", KAIROS_PRODUCTION_READINESS_CERTIFICATION_BUILD);
  headers.set("X-Kairos-Production-Readiness-Store", KAIROS_PRODUCTION_READINESS_STORE_BUILD);
  headers.set("X-Kairos-Controlled-Launch-Governance", KAIROS_CONTROLLED_LAUNCH_GOVERNANCE_BUILD);
  headers.set("X-Kairos-Controlled-Launch-Store", KAIROS_CONTROLLED_LAUNCH_STORE_BUILD);
  headers.set("X-Kairos-Post-Launch-Assurance", KAIROS_POST_LAUNCH_ASSURANCE_BUILD);
  headers.set("X-Kairos-Post-Launch-Assurance-Store", KAIROS_POST_LAUNCH_ASSURANCE_STORE_BUILD);
  headers.set("X-Kairos-Operational-Continuity", KAIROS_OPERATIONAL_CONTINUITY_BUILD);
  headers.set("X-Kairos-Operational-Continuity-Store", KAIROS_OPERATIONAL_CONTINUITY_STORE_BUILD);
  headers.set("X-Kairos-Continuous-Operational-Review", KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_BUILD);
  headers.set("X-Kairos-Continuous-Operational-Review-Store", KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_STORE_BUILD);
  headers.set("X-Kairos-Policy-Exception-Governance", KAIROS_POLICY_EXCEPTION_GOVERNANCE_BUILD);
  headers.set("X-Kairos-Policy-Exception-Store", KAIROS_POLICY_EXCEPTION_STORE_BUILD);
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