import type { MMGCommerceOperationsState } from "./commerce-operations-service.js";
import type {
  MMGCommerceRehearsalScenario,
  MMGCommerceRightsDigest,
} from "./commerce-staging-rehearsal.js";
import type { MMGCommerceRolloutStage } from "./commerce-operations-control.js";

export type MMGCommerceRehearsalAdapterAction =
  | "bootstrap_safe_state"
  | "inject_scenario"
  | "clear_scenario"
  | "evaluate"
  | "recover_scenario"
  | "run_consistency_audit"
  | "grant_stage_approval"
  | "advance_observation"
  | "advance_rollout"
  | "read_rights_digest"
  | "teardown";

export interface MMGCommerceRehearsalAdapterPrincipal {
  actorId: string;
  roles: string[];
}

export interface MMGCommerceRehearsalAdapterAuthenticator {
  authenticate(request: Request): Promise<MMGCommerceRehearsalAdapterPrincipal | null>;
}

export interface MMGCommerceStagingFixtureExecutor {
  bootstrapSafeState(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<void>;
  setScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario | null;
    occurredAt: Date;
    actorId: string;
  }): Promise<void>;
  evaluate(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceOperationsState>;
  recoverScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceOperationsState>;
  runConsistencyAudit(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<{ passed: boolean; failedChecks: string[] }>;
  grantStageApproval(input: {
    runId: string;
    releaseId: string;
    fromStage: MMGCommerceRolloutStage;
    toStage: MMGCommerceRolloutStage;
    occurredAt: Date;
    actorId: string;
  }): Promise<void>;
  advanceObservation(input: {
    runId: string;
    releaseId: string;
    hours: number;
    occurredAt: Date;
    actorId: string;
  }): Promise<Date>;
  advanceRollout(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    targetStage: MMGCommerceRolloutStage;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceOperationsState>;
  readRightsDigest(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceRightsDigest>;
  teardown(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<void>;
}

export interface MMGCommerceStagingRehearsalAdapterHTTPDependencies {
  authenticator: MMGCommerceRehearsalAdapterAuthenticator;
  executor: MMGCommerceStagingFixtureExecutor;
  allowedOrigins: ReadonlySet<string>;
}

const ACTIONS = new Set<MMGCommerceRehearsalAdapterAction>([
  "bootstrap_safe_state",
  "inject_scenario",
  "clear_scenario",
  "evaluate",
  "recover_scenario",
  "run_consistency_audit",
  "grant_stage_approval",
  "advance_observation",
  "advance_rollout",
  "read_rights_digest",
  "teardown",
]);
const SCENARIOS = new Set<MMGCommerceRehearsalScenario>([
  "database_connectivity_sev1",
  "webhook_failure_sev2",
]);
const STAGES = new Set<MMGCommerceRolloutStage>([
  "internal",
  "pilot",
  "limited",
  "expanded",
  "full",
  "paused",
]);
const MAX_BODY_BYTES = 16 * 1024;

const response = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

const identifier = (value: unknown, code: string): string => {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) throw new Error(code);
  return normalized;
};

const occurredAt = (value: unknown): Date => {
  const date = new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) throw new Error("MMG_REHEARSAL_ADAPTER_TIME_INVALID");
  return date;
};

const readBody = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("MMG_REHEARSAL_ADAPTER_CONTENT_TYPE_INVALID");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error("MMG_REHEARSAL_ADAPTER_BODY_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("MMG_REHEARSAL_ADAPTER_JSON_INVALID");
  }
};

export const handleMMGCommerceStagingRehearsalAdapterRequest = async (
  request: Request,
  dependencies: MMGCommerceStagingRehearsalAdapterHTTPDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return response({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  try {
    if (!request.headers.get("x-mmg-internal-request")) {
      throw new Error("MMG_REHEARSAL_ADAPTER_INTERNAL_MARKER_REQUIRED");
    }
    const origin = request.headers.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      throw new Error("MMG_REHEARSAL_ADAPTER_ORIGIN_FORBIDDEN");
    }
    const principal = await dependencies.authenticator.authenticate(request);
    if (!principal) throw new Error("MMG_REHEARSAL_ADAPTER_AUTH_REQUIRED");
    if (!principal.roles.includes("mmg-commerce-rehearsal-adapter")) {
      throw new Error("MMG_REHEARSAL_ADAPTER_ROLE_REQUIRED");
    }
    const body = await readBody(request);
    if (body.environment !== "staging") throw new Error("MMG_REHEARSAL_STAGING_ONLY");
    if (body.publicationAllowed !== false || body.liveCustomerDataAllowed !== false) {
      throw new Error("MMG_REHEARSAL_SAFETY_CONTRACT_VIOLATION");
    }
    const action = String(body.action ?? "") as MMGCommerceRehearsalAdapterAction;
    if (!ACTIONS.has(action)) throw new Error("MMG_REHEARSAL_ADAPTER_ACTION_INVALID");
    const common = {
      runId: identifier(body.runId, "MMG_REHEARSAL_RUN_ID_INVALID"),
      releaseId: identifier(body.releaseId, "MMG_REHEARSAL_RELEASE_ID_INVALID"),
      occurredAt: occurredAt(body.occurredAt),
      actorId: principal.actorId,
    };

    if (action === "bootstrap_safe_state") {
      await dependencies.executor.bootstrapSafeState(common);
      return response({ ok: true, status: "bootstrapped" });
    }
    if (action === "inject_scenario" || action === "clear_scenario") {
      const scenario = String(body.scenario ?? "") as MMGCommerceRehearsalScenario;
      if (!SCENARIOS.has(scenario)) throw new Error("MMG_REHEARSAL_SCENARIO_INVALID");
      await dependencies.executor.setScenario({
        ...common,
        scenario: action === "inject_scenario" ? scenario : null,
      });
      return response({ ok: true, status: action === "inject_scenario" ? "injected" : "cleared" });
    }
    if (action === "evaluate") {
      const state = await dependencies.executor.evaluate({
        ...common,
        requestId: identifier(body.requestId, "MMG_REHEARSAL_REQUEST_ID_INVALID"),
      });
      return response({ ok: true, status: "evaluated", state });
    }
    if (action === "recover_scenario") {
      const scenario = String(body.scenario ?? "") as MMGCommerceRehearsalScenario;
      if (!SCENARIOS.has(scenario)) throw new Error("MMG_REHEARSAL_SCENARIO_INVALID");
      const state = await dependencies.executor.recoverScenario({ ...common, scenario });
      return response({ ok: true, status: "recovered", state });
    }
    if (action === "run_consistency_audit") {
      const audit = await dependencies.executor.runConsistencyAudit({
        ...common,
        requestId: identifier(body.requestId, "MMG_REHEARSAL_REQUEST_ID_INVALID"),
      });
      return response({ ok: true, status: "audited", ...audit });
    }
    if (action === "grant_stage_approval") {
      const fromStage = String(body.fromStage ?? "") as MMGCommerceRolloutStage;
      const toStage = String(body.toStage ?? "") as MMGCommerceRolloutStage;
      if (!STAGES.has(fromStage) || !STAGES.has(toStage)) {
        throw new Error("MMG_REHEARSAL_STAGE_INVALID");
      }
      await dependencies.executor.grantStageApproval({ ...common, fromStage, toStage });
      return response({ ok: true, status: "approved" });
    }
    if (action === "advance_observation") {
      const hours = Number(body.hours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
        throw new Error("MMG_REHEARSAL_OBSERVATION_ADVANCE_INVALID");
      }
      const clock = await dependencies.executor.advanceObservation({ ...common, hours });
      return response({ ok: true, status: "clock_advanced", clock: clock.toISOString() });
    }
    if (action === "advance_rollout") {
      const targetStage = String(body.targetStage ?? "") as MMGCommerceRolloutStage;
      if (!STAGES.has(targetStage)) throw new Error("MMG_REHEARSAL_STAGE_INVALID");
      const state = await dependencies.executor.advanceRollout({
        ...common,
        requestId: identifier(body.requestId, "MMG_REHEARSAL_REQUEST_ID_INVALID"),
        targetStage,
      });
      return response({ ok: true, status: "rollout_advanced", state });
    }
    if (action === "read_rights_digest") {
      const rightsDigest = await dependencies.executor.readRightsDigest(common);
      return response({ ok: true, status: "rights_read", rightsDigest });
    }
    await dependencies.executor.teardown(common);
    return response({ ok: true, status: "torn_down" });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "MMG_REHEARSAL_ADAPTER_FAILED";
    const status = code.includes("BODY_TOO_LARGE")
      ? 413
      : code.includes("AUTH") || code.includes("ROLE") || code.includes("ORIGIN")
        ? 403
        : code.includes("SAFETY") || code.includes("STAGING_ONLY")
          ? 409
          : 400;
    return response(
      {
        ok: false,
        status: "rejected",
        error: {
          code,
          message: "The staging rehearsal adapter request was rejected.",
        },
      },
      status,
    );
  }
};
