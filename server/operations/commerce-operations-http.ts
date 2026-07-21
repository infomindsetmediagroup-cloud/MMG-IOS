import {
  executeMMGCommerceOperationsCommand,
  type MMGCommerceOperationsCommand,
  type MMGCommerceOperationsPrincipal,
} from "./commerce-operations-service.js";
import {
  executeMMGCommerceRolloutCommand,
  type MMGCommerceRolloutDependencies,
} from "./commerce-rollout-service.js";

export interface MMGCommerceOperationsAuthenticator {
  authenticate(request: Request): Promise<MMGCommerceOperationsPrincipal | null>;
}

export interface MMGCommerceOperationsHTTPDependencies
  extends MMGCommerceRolloutDependencies {
  authenticator: MMGCommerceOperationsAuthenticator;
  allowedOrigins: ReadonlySet<string>;
}

const MAX_BODY_BYTES = 32 * 1024;
const ACTIONS = new Set([
  "inspect",
  "evaluate",
  "run_consistency_audit",
  "acknowledge_incident",
  "apply_mitigation",
  "resolve_incident",
  "close_incident",
  "set_control",
  "advance_rollout",
  "pause_rollout",
]);
const ENVIRONMENTS = new Set(["staging", "production"]);
const CONTROLS = new Set([
  "product_publication",
  "subscription_checkout",
  "webhook_ingestion",
  "delivery_scheduler",
  "delivery_dispatcher",
  "recommendation_automation",
  "signed_library_access",
  "thank_you_handoff",
]);
const MODES = new Set(["enabled", "disabled", "observe_only", "drain_only"]);
const STAGES = new Set([
  "internal",
  "pilot",
  "limited",
  "expanded",
  "full",
  "paused",
]);

const headers = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });

const json = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: headers() });

const errorStatus = (code: string): number => {
  if (code.includes("BODY_TOO_LARGE")) return 413;
  if (
    code.includes("AUTH") ||
    code.includes("ROLE_REQUIRED") ||
    code.includes("FORBIDDEN") ||
    code.includes("INTERNAL_MARKER_REQUIRED")
  ) {
    return 403;
  }
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("COLLISION") || code.includes("CONFLICT")) return 409;
  if (code.includes("BLOCKED") || code.includes("REQUIRED")) return 409;
  if (code.includes("INVALID") || code.includes("INCOMPLETE")) return 400;
  return 500;
};

const readJSON = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("MMG_OPERATIONS_CONTENT_TYPE_INVALID");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error("MMG_OPERATIONS_BODY_TOO_LARGE");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new Error("MMG_OPERATIONS_BODY_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("MMG_OPERATIONS_JSON_INVALID");
  }
};

const assertOrigin = (
  request: Request,
  dependencies: MMGCommerceOperationsHTTPDependencies,
): void => {
  const marker = request.headers.get("x-mmg-internal-request");
  if (!marker) throw new Error("MMG_OPERATIONS_INTERNAL_MARKER_REQUIRED");
  const origin = request.headers.get("origin");
  if (origin && !dependencies.allowedOrigins.has(origin)) {
    throw new Error("MMG_OPERATIONS_ORIGIN_FORBIDDEN");
  }
};

const requiredEnum = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  code: string,
): T => {
  const normalized = String(value ?? "").trim();
  if (!allowed.has(normalized)) throw new Error(code);
  return normalized as T;
};

const optionalEnum = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  code: string,
): T | undefined => {
  if (value === undefined) return undefined;
  return requiredEnum<T>(value, allowed, code);
};

const commandFrom = (
  payload: Record<string, unknown>,
): MMGCommerceOperationsCommand => ({
  requestId: String(payload.requestId ?? ""),
  action: requiredEnum<MMGCommerceOperationsCommand["action"]>(
    payload.action,
    ACTIONS,
    "MMG_OPERATIONS_ACTION_INVALID",
  ),
  environment: requiredEnum<MMGCommerceOperationsCommand["environment"]>(
    payload.environment,
    ENVIRONMENTS,
    "MMG_OPERATIONS_ENVIRONMENT_INVALID",
  ),
  releaseId:
    payload.releaseId === null || payload.releaseId === undefined
      ? null
      : String(payload.releaseId),
  incidentId:
    payload.incidentId === undefined ? undefined : String(payload.incidentId),
  control: optionalEnum<NonNullable<MMGCommerceOperationsCommand["control"]>>(
    payload.control,
    CONTROLS,
    "MMG_OPERATIONS_CONTROL_INVALID",
  ),
  mode: optionalEnum<NonNullable<MMGCommerceOperationsCommand["mode"]>>(
    payload.mode,
    MODES,
    "MMG_OPERATIONS_CONTROL_MODE_INVALID",
  ),
  targetStage: optionalEnum<
    NonNullable<MMGCommerceOperationsCommand["targetStage"]>
  >(payload.targetStage, STAGES, "MMG_OPERATIONS_ROLLOUT_STAGE_INVALID"),
  expectedVersion:
    payload.expectedVersion === undefined
      ? undefined
      : Number(payload.expectedVersion),
  reason: payload.reason === undefined ? undefined : String(payload.reason),
  allowAutomaticContainment: payload.allowAutomaticContainment === true,
});

export const handleMMGCommerceOperationsRequest = async (
  request: Request,
  dependencies: MMGCommerceOperationsHTTPDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  try {
    assertOrigin(request, dependencies);
    const principal = await dependencies.authenticator.authenticate(request);
    if (!principal) throw new Error("MMG_OPERATIONS_AUTH_REQUIRED");
    const payload = await readJSON(request);
    const command = commandFrom(payload);
    const result = ["advance_rollout", "pause_rollout"].includes(command.action)
      ? await executeMMGCommerceRolloutCommand({
          command,
          principal,
          dependencies,
        })
      : await executeMMGCommerceOperationsCommand({
          command,
          principal,
          dependencies,
        });
    return json(result.body, result.status);
  } catch (error) {
    const code = error instanceof Error ? error.message : "MMG_OPERATIONS_FAILED";
    return json(
      {
        ok: false,
        status: "failed",
        error: {
          code: code.split(":", 1)[0],
          message: "The commerce operations command could not be completed.",
        },
      },
      errorStatus(code),
    );
  }
};
