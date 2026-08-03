import canonicalRuntime, {
  KairosProject,
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
import { handleManuscriptRequest } from "./manuscript-studio-v1.js";
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

export {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
  KairosAutonomyLedger,
};

export class KairosManuscriptSource extends BaseKairosManuscriptSource {
  async fetch(request) {
    const packageState = await handleManuscriptPackageStateObjectRequest(this.state, request);
    if (packageState) return packageState;
    return super.fetch(request);
  }
}

export const KAIROS_LOCAL_CANONICAL_ENTRY_BUILD =
  "kairos-local-canonical-entry-20260802-4-complete-autonomous-operations";

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

    const packageState = await handleManuscriptPackageState(request, env, ctx);
    if (packageState) return stamp(packageState);

    const dedicatedSource = await handleDedicatedManuscriptSource(request, env);
    if (dedicatedSource) return stamp(dedicatedSource);

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
  headers.set("X-Kairos-Source-Shard", KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);
  headers.set("X-Kairos-Package-State-Build", headers.get("X-Kairos-Package-State-Build") || KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD);
  headers.set("X-Kairos-Autonomy-API-Build", headers.get("X-Kairos-Autonomy-API-Build") || KAIROS_AUTONOMY_API_BUILD);
  headers.set("X-Kairos-Autonomy-Scheduler-Build", headers.get("X-Kairos-Autonomy-Scheduler-Build") || KAIROS_AUTONOMY_SCHEDULER_BUILD);
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
