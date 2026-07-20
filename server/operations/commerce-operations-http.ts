import {
  executeMMGCommerceOperationsCommand,
  type MMGCommerceOperationsCommand,
  type MMGCommerceOperationsDependencies,
  type MMGCommerceOperationsPrincipal,
} from "./commerce-operations-service.js";

export interface MMGCommerceOperationsAuthenticator {
  authenticate(request: Request): Promise<MMGCommerceOperationsPrincipal | null>;
}

export interface MMGCommerceOperationsHTTPDependencies
  extends MMGCommerceOperationsDependencies {
  authenticator: MMGCommerceOperationsAuthenticator;
  allowedOrigins: ReadonlySet<string>;
}

const MAX_BODY_BYTES = 32 * 1024;

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
  if (code.includes("AUTH") || code.includes("ROLE_REQUIRED")) return 403;
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("COLLISION") || code.includes("CONFLICT")) return 409;
  if (
    code.includes("BLOCKED") ||
    code.includes("FORBIDDEN") ||
    code.includes("REQUIRED")
  ) {
    return 409;
  }
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

const commandFrom = (payload: Record<string, unknown>): MMGCommerceOperationsCommand => ({
  requestId: String(payload.requestId ?? ""),
  action: String(payload.action ?? "") as MMGCommerceOperationsCommand["action"],
  environment: String(
    payload.environment ?? "",
  ) as MMGCommerceOperationsCommand["environment"],
  releaseId:
    payload.releaseId === null || payload.releaseId === undefined
      ? null
      : String(payload.releaseId),
  incidentId:
    payload.incidentId === undefined ? undefined : String(payload.incidentId),
  control:
    payload.control === undefined
      ? undefined
      : (String(payload.control) as MMGCommerceOperationsCommand["control"]),
  mode:
    payload.mode === undefined
      ? undefined
      : (String(payload.mode) as MMGCommerceOperationsCommand["mode"]),
  targetStage:
    payload.targetStage === undefined
      ? undefined
      : (String(
          payload.targetStage,
        ) as MMGCommerceOperationsCommand["targetStage"]),
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
    const result = await executeMMGCommerceOperationsCommand({
      command: commandFrom(payload),
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
