import baselineRuntime, { KairosProject } from "./kairos-production-entry.js";
import {
  handleAutonomousPromptRequest,
  KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
  runAutonomousScheduledCycle,
} from "./kairos-autonomous-prompt-controller-v1.js";
import {
  handleHomepagePromptBindingRepair,
  KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD,
} from "./kairos-homepage-prompt-binding-repair-v1.js";
import {
  KAIROS_FULL_THEME_BASELINE_BUILD,
  restoreApprovedHomepageBaseline,
} from "./kairos-approved-baseline-restore-v1.js";
import {
  handleNeuronFreeHomepagePlan,
  KAIROS_NEURON_FREE_HOMEPAGE_BUILD,
} from "./kairos-neuron-free-homepage-planner-v1.js";
import {
  handleDirectHomepagePlan,
  KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD,
} from "./kairos-direct-homepage-plan-v1.js";
import {
  handleDirectHomepageExecution,
  KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
} from "./kairos-direct-homepage-execution-v1.js";
import {
  handleZeroNeuronChildRequest,
  KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD,
} from "./kairos-zero-neuron-child-router-v1.js";
import { KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD } from "./kairos-internal-doctrine-registry-v1.js";
import {
  applyWebsiteGovernanceToPlanResponse,
  buildPrivateGovernedPlanningRequest,
  governWebsitePlanningRequest,
  handleWebsiteGovernanceStatus,
  KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
} from "./kairos-website-planning-governance-v1.js";
import {
  applyHomepageContinuationMetadata,
  buildDeterministicHomepageContinuationRequest,
  KAIROS_HOMEPAGE_CONTINUATION_BUILD,
} from "./kairos-homepage-continuation-v1.js";
import {
  handleWholeHomepagePlan,
  KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD,
} from "./kairos-whole-homepage-planner-v1.js";

const BUILD = "kairos-production-entry-autonomous-20260717-11";
const PLAN_PATH = "/api/shopify/staging/plan/jobs";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const internalEnv = workersAIBlockedEnv(env);

    try {
      const governanceStatus = handleWebsiteGovernanceStatus(request);
      if (governanceStatus) return stamp(governanceStatus, null, null, null);

      const url = new URL(request.url);
      const isPlanningRequest = request.method === "POST" && url.pathname === PLAN_PATH;
      let baselineRefresh = null;
      let governedPlanning = { request, context: null, payload: null, originalObjective: "" };
      let continuation = { request, active: false, originalObjective: "", canonicalFieldCount: 0 };
      let deterministicPlanningRequest = request;
      let privatePlanningRequest = request;

      if (isPlanningRequest) {
        const rawPayload = await safeRequestJSON(request.clone());
        const declaredRequest = rawPayload?.requestType || rawPayload?.pageType || rawPayload?.resourceType
          ? request
          : rebuildJSONRequest(request, { ...rawPayload, requestType: "homepage" });
        governedPlanning = await governWebsitePlanningRequest(declaredRequest);
        continuation = await buildDeterministicHomepageContinuationRequest(
          governedPlanning.request,
          {
            ...(governedPlanning.payload || rawPayload),
            objective: governedPlanning.originalObjective || rawPayload?.objective || "",
          },
        );
        deterministicPlanningRequest = continuation.active ? continuation.request : governedPlanning.request;
        privatePlanningRequest = continuation.active
          ? continuation.request
          : buildPrivateGovernedPlanningRequest(declaredRequest, governedPlanning);
        if (governedPlanning.context?.pageType === "homepage" && !continuation.active) {
          baselineRefresh = await restoreApprovedHomepageBaseline(internalEnv);
        }
      }

      const baselineInternalDelegate = delegatedRequest => baselineRuntime.fetch(delegatedRequest, internalEnv, ctx);
      const autonomousDelegate = nextRequest => handleAutonomousPromptRequest(
        nextRequest,
        internalEnv,
        ctx,
        baselineInternalDelegate,
      );

      const zeroNeuronChild = await handleZeroNeuronChildRequest(
        request,
        internalEnv,
        ctx,
        baselineInternalDelegate,
      );
      if (zeroNeuronChild) return stamp(zeroNeuronChild, baselineRefresh, governedPlanning.context, continuation);

      const directExecution = await handleDirectHomepageExecution(request, internalEnv, ctx);
      if (directExecution) return stamp(directExecution, baselineRefresh, governedPlanning.context, continuation);

      const wholeHomepagePlan = await handleWholeHomepagePlan(
        deterministicPlanningRequest,
        internalEnv,
        continuation,
      );
      if (wholeHomepagePlan) {
        const continuedResponse = await applyHomepageContinuationMetadata(request, wholeHomepagePlan, continuation);
        const governedResponse = await applyWebsiteGovernanceToPlanResponse(request, continuedResponse, governedPlanning.context);
        return stamp(governedResponse, baselineRefresh, governedPlanning.context, continuation);
      }

      const directPlan = await handleDirectHomepagePlan(deterministicPlanningRequest, internalEnv, ctx);
      if (directPlan) {
        const continuedResponse = await applyHomepageContinuationMetadata(request, directPlan, continuation);
        const governedResponse = await applyWebsiteGovernanceToPlanResponse(request, continuedResponse, governedPlanning.context);
        return stamp(governedResponse, baselineRefresh, governedPlanning.context, continuation);
      }

      const neuronFreePlan = await handleNeuronFreeHomepagePlan(
        deterministicPlanningRequest,
        internalEnv,
        ctx,
        autonomousDelegate,
      );
      if (neuronFreePlan) {
        const continuedResponse = await applyHomepageContinuationMetadata(request, neuronFreePlan, continuation);
        const governedResponse = await applyWebsiteGovernanceToPlanResponse(request, continuedResponse, governedPlanning.context);
        return stamp(governedResponse, baselineRefresh, governedPlanning.context, continuation);
      }

      const bindingRepair = await handleHomepagePromptBindingRepair(
        deterministicPlanningRequest,
        internalEnv,
        ctx,
        autonomousDelegate,
      );
      if (bindingRepair) {
        const continuedResponse = await applyHomepageContinuationMetadata(request, bindingRepair, continuation);
        const governedResponse = await applyWebsiteGovernanceToPlanResponse(request, continuedResponse, governedPlanning.context);
        return stamp(governedResponse, baselineRefresh, governedPlanning.context, continuation);
      }

      const routedRequest = isPlanningRequest ? privatePlanningRequest : request;
      const handled = await autonomousDelegate(routedRequest);
      if (handled) {
        const governedResponse = isPlanningRequest
          ? await applyWebsiteGovernanceToPlanResponse(request, handled, governedPlanning.context)
          : handled;
        return stamp(governedResponse, baselineRefresh, governedPlanning.context, continuation);
      }

      const baselineResponse = await baselineRuntime.fetch(routedRequest, internalEnv, ctx);
      const governedResponse = isPlanningRequest
        ? await applyWebsiteGovernanceToPlanResponse(request, baselineResponse, governedPlanning.context)
        : baselineResponse;
      return stamp(governedResponse, baselineRefresh, governedPlanning.context, continuation);
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        controller: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
        zeroNeuronChildRouter: KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD,
        doctrineRegistry: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
        websitePlanningGovernance: KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
        homepageContinuation: KAIROS_HOMEPAGE_CONTINUATION_BUILD,
        wholeHomepagePlanner: KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD,
        directHomepagePlan: KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD,
        directHomepageExecution: KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
        neuronFreeHomepage: KAIROS_NEURON_FREE_HOMEPAGE_BUILD,
        promptBinding: KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD,
        fullThemeBaseline: KAIROS_FULL_THEME_BASELINE_BUILD,
        error: {
          code: error?.code || "autonomous_entry_failed",
          message: error instanceof Error ? error.message : "Kairos could not complete this request.",
        },
        safeguards: {
          liveThemeChanged: false,
          dirtyStagingRejected: true,
          sourceOfTruth: "current-live-main-theme-or-managed-approved-staging",
          workersAIAvailableToRequests: false,
          workersAIUsed: false,
          neuronsConsumed: 0,
          childRetrievalMode: "deterministic-internal",
          generativeInferenceMode: "kairos-private-runtime-only",
          websiteDoctrineInheritedAutomatically: true,
          websiteLinkDestinationsMutableByTextPlan: false,
          websiteDesignMutationAuthorizedByCopyObjective: false,
          homepageHeroOnlyCompletionAccepted: false,
          homepageWholePagePlannerEnabled: true,
          homepageWholePageMaximumOperations: 96,
          homepageTemplateOnlyMutation: false,
          homepageMarkupBackedSettingsCovered: true,
          homepagePageBoundSectionSourcesCovered: true,
          homepageContinuationPrivateRuntimeRequired: false,
          homepageContinuationDuplicatesMain: false,
          homepageContinuationPreservesApprovedStaging: true,
          labeledHomepagePromptsRequireWorkersAI: false,
          labeledHomepagePromptsUseSecondBindingPass: false,
          approvedDirectPackagesUseApprovalTimeRebinding: false,
        },
      }, Number(error?.status || error?.statusCode || 500));
    }
  },

  async scheduled(controller, env, ctx) {
    const internalEnv = workersAIBlockedEnv(env);
    if (typeof baselineRuntime.scheduled === "function") await baselineRuntime.scheduled(controller, internalEnv, ctx);
    ctx.waitUntil(Promise.resolve(runAutonomousScheduledCycle(controller, internalEnv, ctx)).catch(() => null));
  },
};

function workersAIBlockedEnv(env) {
  return new Proxy(env || {}, {
    get(target, property, receiver) {
      if (property === "AI") return undefined;
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (property === "AI") return false;
      return Reflect.has(target, property);
    },
  });
}

function stamp(response, baselineRefresh = null, governanceContext = null, continuation = null) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Autonomous-Entry", BUILD);
  headers.set("X-Kairos-Prompt-Controller", KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD);
  headers.set("X-Kairos-Zero-Neuron-Child-Router", KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD);
  headers.set("X-Kairos-Doctrine-Registry", KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD);
  headers.set("X-Kairos-Website-Governance", KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD);
  headers.set("X-Kairos-Homepage-Continuation", KAIROS_HOMEPAGE_CONTINUATION_BUILD);
  headers.set("X-Kairos-Whole-Homepage-Planner", KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD);
  headers.set("X-Kairos-Direct-Homepage-Plan", KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD);
  headers.set("X-Kairos-Direct-Homepage-Execution", KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD);
  headers.set("X-Kairos-Neuron-Free-Homepage", KAIROS_NEURON_FREE_HOMEPAGE_BUILD);
  headers.set("X-Kairos-Prompt-Binding-Build", KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD);
  headers.set("X-Kairos-Full-Theme-Baseline", KAIROS_FULL_THEME_BASELINE_BUILD);
  headers.set("X-Kairos-Workers-AI-Available", "false");
  headers.set("X-Kairos-Workers-AI-Used", "false");
  headers.set("X-Kairos-Neurons-Consumed", "0");
  headers.set("X-Kairos-Website-Doctrine-Inherited", governanceContext?.applied ? "true" : "false");
  headers.set("X-Kairos-Homepage-Continuation-Active", continuation?.active ? "true" : "false");
  if (continuation?.active) {
    headers.set("X-Kairos-Managed-Staging-Reused", "true");
    headers.set("X-Kairos-Main-Duplicated", "false");
    headers.set("X-Kairos-Private-Runtime-Used", "false");
  }
  if (governanceContext?.pageType) headers.set("X-Kairos-Website-Page-Type", governanceContext.pageType);
  headers.set("X-Kairos-Visual-Baseline", "tuesday-command-center-6f96b10d");
  if (baselineRefresh?.targetTheme?.gid) {
    headers.set("X-Kairos-Staging-Refreshed", "full-main-theme-duplicate");
    headers.set("X-Kairos-Staging-Theme-ID", String(baselineRefresh.targetTheme.gid).slice(-80));
  }
  if (headers.get("Content-Type")?.includes("text/html")) headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function rebuildJSONRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(payload),
    redirect: request.redirect,
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Autonomous-Entry": BUILD,
      "X-Kairos-Prompt-Controller": KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
      "X-Kairos-Zero-Neuron-Child-Router": KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD,
      "X-Kairos-Doctrine-Registry": KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
      "X-Kairos-Website-Governance": KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
      "X-Kairos-Homepage-Continuation": KAIROS_HOMEPAGE_CONTINUATION_BUILD,
      "X-Kairos-Whole-Homepage-Planner": KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD,
      "X-Kairos-Direct-Homepage-Plan": KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD,
      "X-Kairos-Direct-Homepage-Execution": KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
      "X-Kairos-Neuron-Free-Homepage": KAIROS_NEURON_FREE_HOMEPAGE_BUILD,
      "X-Kairos-Prompt-Binding-Build": KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD,
      "X-Kairos-Full-Theme-Baseline": KAIROS_FULL_THEME_BASELINE_BUILD,
      "X-Kairos-Workers-AI-Available": "false",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}
