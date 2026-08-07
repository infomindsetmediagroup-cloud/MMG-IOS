import canonicalRuntime, {
  KairosProject as BaseKairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-only-v1.js";
import {
  handleDedicatedManuscriptSource,
  KairosManuscriptSource as BaseKairosManuscriptSource,
  KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
} from "./kairos-manuscript-source-shard-v1.js";
import {
  handleManuscriptPackageState,
  handleManuscriptPackageStateObjectRequest,
  KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD,
} from "./kairos-manuscript-package-state-v1.js";
import {
  resolveCanonicalManuscriptRequest,
  KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD,
} from "./kairos-manuscript-canonical-identity-router-v1.js";
import { handleManuscriptRequest } from "./manuscript-studio-v1.js";
import {
  handleKairosDashboardRequest,
  KAIROS_DASHBOARD_BUILD,
} from "./kairos-dashboard-v3.js";
import { KairosAutonomyLedger } from "./autonomy/kairos-autonomy-ledger-v1.js";
import {
  handleAutonomyApiRequest,
  KAIROS_AUTONOMY_API_BUILD,
} from "./autonomy/kairos-autonomy-api-v5.js";
import {
  handleAutonomyScheduledEvent,
  KAIROS_AUTONOMY_SCHEDULER_BUILD,
  KAIROS_AUTONOMY_HEALTH_CRON,
} from "./autonomy/kairos-autonomy-scheduler-v2.js";
import {
  handleKairosCustomerRuntimeProjectionAPI,
  handleKairosCustomerRuntimeProjectionObjectRequest,
  KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD,
} from "./kairos-customer-runtime-projection-store-v1.js";
import {
  handleKairosCustomerAccountAuth,
  prepareKairosCustomerApiRequest,
  stampKairosCustomerSession,
  KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD,
} from "./kairos-customer-account-auth-v1.js";

export {
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
  KairosAutonomyLedger,
};

export class KairosProject extends BaseKairosProject {
  async fetch(request) {
    const customerProjectionResponse =
      await handleKairosCustomerRuntimeProjectionObjectRequest(
        this.state,
        request.clone(),
      );
    if (customerProjectionResponse) return customerProjectionResponse;
    return super.fetch(request);
  }
}

export class KairosManuscriptSource extends BaseKairosManuscriptSource {
  async fetch(request) {
    const packageState = await handleManuscriptPackageStateObjectRequest(this.state, request);
    if (packageState) return packageState;
    return super.fetch(request);
  }
}

export const KAIROS_LOCAL_CANONICAL_ENTRY_BUILD =
  "kairos-local-canonical-entry-20260807-2-customer-account-oauth";

const PROVIDER_INDEPENDENT_OPERATIONAL_PATHS = new Set([
  "/api/hub/run",
  "/api/workflows",
]);

const DIRECT_MANUSCRIPT_PATHS = new Set([
  "/api/manuscript/capabilities",
  "/api/manuscript/intake/advance",
  "/api/manuscript/review",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const autonomousEnv = providerBlockedEnv(env);

    const customerAuthResponse = await handleKairosCustomerAccountAuth(request, env);
    if (customerAuthResponse) return stamp(customerAuthResponse);

    const preparedCustomerRequest = await prepareKairosCustomerApiRequest(request, env);
    const customerResponse =
      await handleKairosCustomerRuntimeProjectionAPI(preparedCustomerRequest.request, env);
    if (customerResponse) {
      return stamp(stampKairosCustomerSession(customerResponse, preparedCustomerRequest.setCookie));
    }

    const dashboardResponse = await handleKairosDashboardRequest(request, env, ctx, {
      operationsEnv: autonomousEnv,
    });
    if (dashboardResponse) return stamp(dashboardResponse);

    const autonomyResponse = await handleAutonomyApiRequest(request, env, ctx, {
      dispatchEnv: autonomousEnv,
      operationsEnv: autonomousEnv,
    });
    if (autonomyResponse) return stamp(autonomyResponse);

    if (DIRECT_MANUSCRIPT_PATHS.has(url.pathname)) {
      try {
        const directManuscriptResponse = await handleManuscriptRequest(request);
        if (directManuscriptResponse) return stamp(directManuscriptResponse);
      } catch (error) {
        return stamp(json({
          status: "failed",
          error: {
            code: "MANUSCRIPT_INTAKE_FAILED",
            message: error instanceof Error ? error.message : "The manuscript could not advance into production intake.",
            retriable: true,
          },
          build: KAIROS_LOCAL_CANONICAL_ENTRY_BUILD,
        }, 400));
      }
    }

    const manuscriptIdentity = await resolveCanonicalManuscriptRequest(request, env);
    const canonicalRequest = manuscriptIdentity.request;

    const packageState = await handleManuscriptPackageState(canonicalRequest, env, ctx);
    if (packageState) return stamp(packageState, manuscriptIdentity);

    const dedicatedSource = await handleDedicatedManuscriptSource(canonicalRequest, env);
    if (dedicatedSource) return stamp(dedicatedSource, manuscriptIdentity);

    const runtimeEnv = PROVIDER_INDEPENDENT_OPERATIONAL_PATHS.has(url.pathname)
      ? operationalCompatibilityEnv(env)
      : autonomousEnv;
    return stamp(await canonicalRuntime.fetch(request, runtimeEnv, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (controller?.cron === KAIROS_AUTONOMY_HEALTH_CRON) {
      return handleAutonomyScheduledEvent(controller, providerBlockedEnv(env), ctx);
    }
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
      if (property === "OPENAI_API_KEY") return "kairos-local-readiness-sentinel-not-a-provider-key";
      return Reflect.get(target, property);
    },
  });
}

function stamp(response, manuscriptIdentity = null) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Canonical-Local", KAIROS_LOCAL_CANONICAL_ENTRY_BUILD);
  headers.set("X-Kairos-Inference-Provider", "browser-webgpu");
  headers.set("X-Kairos-External-Provider", "disabled");
  headers.set("X-Kairos-OpenAI-Calls", "disabled");
  headers.set("X-Kairos-Source-Shard", KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);
  headers.set("X-Kairos-Package-State-Build", headers.get("X-Kairos-Package-State-Build") || KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD);
  headers.set("X-Kairos-Manuscript-Identity-Build", KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD);
  headers.set("X-Kairos-Autonomy-API-Build", headers.get("X-Kairos-Autonomy-API-Build") || KAIROS_AUTONOMY_API_BUILD);
  headers.set("X-Kairos-Autonomy-Scheduler-Build", headers.get("X-Kairos-Autonomy-Scheduler-Build") || KAIROS_AUTONOMY_SCHEDULER_BUILD);
  headers.set("X-Kairos-Dashboard-Build", headers.get("X-Kairos-Dashboard-Build") || KAIROS_DASHBOARD_BUILD);
  headers.set("X-Kairos-Customer-Runtime-Store", headers.get("X-Kairos-Customer-Runtime-Store") || KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD);
  headers.set("X-Kairos-Customer-Auth", headers.get("X-Kairos-Customer-Auth") || KAIROS_CUSTOMER_ACCOUNT_AUTH_BUILD);
  if (manuscriptIdentity?.requestedProjectId) {
    headers.set("X-Kairos-Requested-Manuscript-Project", manuscriptIdentity.requestedProjectId);
  }
  if (manuscriptIdentity?.canonicalProjectId) {
    headers.set("X-Kairos-Canonical-Manuscript-Project", manuscriptIdentity.canonicalProjectId);
  }
  headers.set("X-Kairos-Manuscript-Identity-Resolved", manuscriptIdentity?.resolved ? "true" : "false");
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
    },
  });
}
