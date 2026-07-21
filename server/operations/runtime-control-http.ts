import type {
  MMGCommerceControlCode,
  MMGCommerceControlMode,
  MMGCommerceOperationsEnvironment,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";

export interface MMGRuntimeControlPrincipal {
  actorId: string;
  roles: string[];
}

export interface MMGRuntimeControlAuthenticator {
  authenticate(request: Request): Promise<MMGRuntimeControlPrincipal | null>;
}

export interface MMGRuntimeControlBoundary {
  applyControl(input: {
    environment: MMGCommerceOperationsEnvironment;
    control: MMGCommerceControlCode;
    mode: MMGCommerceControlMode;
    reasonCode: string;
    automatic: boolean;
    actorId: string;
    receiptId: string;
    occurredAt: Date;
  }): Promise<void>;
  applyRollout(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    actorId: string;
    receiptId: string;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGRuntimeControlHTTPDependencies {
  authenticator: MMGRuntimeControlAuthenticator;
  boundary: MMGRuntimeControlBoundary;
  allowedOrigins: ReadonlySet<string>;
}

const CONTROLS = new Set<MMGCommerceControlCode>([
  "product_publication",
  "subscription_checkout",
  "webhook_ingestion",
  "delivery_scheduler",
  "delivery_dispatcher",
  "recommendation_automation",
  "signed_library_access",
  "thank_you_handoff",
]);
const MODES = new Set<MMGCommerceControlMode>([
  "enabled",
  "disabled",
  "observe_only",
  "drain_only",
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

const json = (
  body: Record<string, unknown>,
  status = 200,
  receiptId?: string,
): Response => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (receiptId) headers.set("X-Request-Id", receiptId);
  return new Response(JSON.stringify(body), { status, headers });
};

const payload = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("MMG_RUNTIME_CONTROL_CONTENT_TYPE_INVALID");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new Error("MMG_RUNTIME_CONTROL_BODY_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("MMG_RUNTIME_CONTROL_JSON_INVALID");
  }
};

const identifier = (value: unknown, code: string): string => {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) throw new Error(code);
  return normalized;
};

const date = (value: unknown): Date => {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) throw new Error("MMG_RUNTIME_CONTROL_TIME_INVALID");
  return parsed;
};

export const handleMMGRuntimeControlRequest = async (
  request: Request,
  dependencies: MMGRuntimeControlHTTPDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  const receiptId = request.headers.get("x-mmg-control-receipt") ?? "";
  try {
    if (!request.headers.get("x-mmg-internal-request")) {
      throw new Error("MMG_RUNTIME_CONTROL_INTERNAL_MARKER_REQUIRED");
    }
    const origin = request.headers.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      throw new Error("MMG_RUNTIME_CONTROL_ORIGIN_FORBIDDEN");
    }
    const principal = await dependencies.authenticator.authenticate(request);
    if (!principal) throw new Error("MMG_RUNTIME_CONTROL_AUTH_REQUIRED");
    if (!principal.roles.includes("mmg-runtime-control")) {
      throw new Error("MMG_RUNTIME_CONTROL_ROLE_REQUIRED");
    }
    identifier(receiptId, "MMG_RUNTIME_CONTROL_RECEIPT_ID_INVALID");
    const body = await payload(request);
    const environment = String(body.environment ?? "");
    if (environment !== "staging" && environment !== "production") {
      throw new Error("MMG_RUNTIME_CONTROL_ENVIRONMENT_INVALID");
    }
    const occurredAt = date(body.occurredAt);
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith("/control")) {
      const control = String(body.control ?? "") as MMGCommerceControlCode;
      const mode = String(body.mode ?? "") as MMGCommerceControlMode;
      if (!CONTROLS.has(control)) throw new Error("MMG_RUNTIME_CONTROL_CODE_INVALID");
      if (!MODES.has(mode)) throw new Error("MMG_RUNTIME_CONTROL_MODE_INVALID");
      if (control === "webhook_ingestion" && mode === "disabled") {
        throw new Error("MMG_WEBHOOK_INGESTION_DISABLE_FORBIDDEN");
      }
      if (control === "product_publication" && mode === "enabled") {
        throw new Error("MMG_PUBLICATION_ENABLE_REQUIRES_DEPLOYMENT_CONTROL");
      }
      const reasonCode = String(body.reasonCode ?? "").trim();
      if (reasonCode.length < 1 || reasonCode.length > 200) {
        throw new Error("MMG_RUNTIME_CONTROL_REASON_INVALID");
      }
      await dependencies.boundary.applyControl({
        environment,
        control,
        mode,
        reasonCode,
        automatic: body.automatic === true,
        actorId: principal.actorId,
        receiptId,
        occurredAt,
      });
      return json({ ok: true, status: "applied" }, 200, receiptId);
    }
    if (pathname.endsWith("/rollout")) {
      const stage = String(body.stage ?? "") as MMGCommerceRolloutStage;
      if (!STAGES.has(stage)) throw new Error("MMG_RUNTIME_ROLLOUT_STAGE_INVALID");
      const cohortPercentage = Number(body.cohortPercentage);
      if (
        !Number.isFinite(cohortPercentage) ||
        cohortPercentage < 0 ||
        cohortPercentage > 100
      ) {
        throw new Error("MMG_RUNTIME_CONTROL_COHORT_INVALID");
      }
      await dependencies.boundary.applyRollout({
        environment,
        releaseId: identifier(body.releaseId, "MMG_RUNTIME_ROLLOUT_RELEASE_INVALID"),
        stage,
        cohortPercentage,
        actorId: principal.actorId,
        receiptId,
        occurredAt,
      });
      return json({ ok: true, status: "applied" }, 200, receiptId);
    }
    throw new Error("MMG_RUNTIME_CONTROL_ROUTE_INVALID");
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "MMG_RUNTIME_CONTROL_FAILED";
    const status = code.includes("BODY_TOO_LARGE")
      ? 413
      : code.includes("AUTH") || code.includes("ROLE") || code.includes("ORIGIN")
        ? 403
        : code.includes("FORBIDDEN") || code.includes("REQUIRES")
          ? 409
          : 400;
    return json(
      {
        ok: false,
        status: "rejected",
        error: {
          code,
          message: "The runtime control request was rejected.",
        },
      },
      status,
      receiptId || undefined,
    );
  }
};
