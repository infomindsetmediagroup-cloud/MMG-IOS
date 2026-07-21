import {
  executeMMGStagingIntegrationCommand,
  type MMGStagingIntegrationAction,
  type MMGStagingIntegrationDependencies,
  type MMGStagingIntegrationPrincipal,
} from "./staging-integration-service.js";

export interface MMGStagingIntegrationAuthenticator {
  authenticate(request: Request): Promise<MMGStagingIntegrationPrincipal | null>;
}

export interface MMGStagingIntegrationHTTPDependencies
  extends MMGStagingIntegrationDependencies {
  authenticator: MMGStagingIntegrationAuthenticator;
  allowedOrigins: ReadonlySet<string>;
}

const MAX_BODY_BYTES = 16 * 1024;
const ACTIONS = new Set<MMGStagingIntegrationAction>([
  "inspect",
  "bootstrap",
  "verify",
]);

const json = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

const payload = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("MMG_STAGING_INTEGRATION_CONTENT_TYPE_INVALID");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error("MMG_STAGING_INTEGRATION_BODY_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("MMG_STAGING_INTEGRATION_JSON_INVALID");
  }
};

export const handleMMGStagingIntegrationRequest = async (
  request: Request,
  dependencies: MMGStagingIntegrationHTTPDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  try {
    if (!request.headers.get("x-mmg-internal-request")) {
      throw new Error("MMG_STAGING_INTEGRATION_INTERNAL_MARKER_REQUIRED");
    }
    const origin = request.headers.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      throw new Error("MMG_STAGING_INTEGRATION_ORIGIN_FORBIDDEN");
    }
    const principal = await dependencies.authenticator.authenticate(request);
    if (!principal) throw new Error("MMG_STAGING_INTEGRATION_AUTH_REQUIRED");
    const body = await payload(request);
    if (body.environment !== "staging") {
      throw new Error("MMG_STAGING_INTEGRATION_STAGING_ONLY");
    }
    if (body.publicationAllowed !== false || body.liveCustomerDataAllowed !== false) {
      throw new Error("MMG_STAGING_INTEGRATION_SAFETY_CONTRACT_VIOLATION");
    }
    const action = String(body.action ?? "") as MMGStagingIntegrationAction;
    if (!ACTIONS.has(action)) {
      throw new Error("MMG_STAGING_INTEGRATION_ACTION_INVALID");
    }
    const result = await executeMMGStagingIntegrationCommand({
      command: {
        requestId: String(body.requestId ?? ""),
        integrationRunId: String(body.integrationRunId ?? ""),
        releaseId: String(body.releaseId ?? ""),
        releaseCommitSha: String(body.releaseCommitSha ?? ""),
        action,
      },
      principal,
      dependencies,
    });
    return json(result.body, result.status);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "MMG_STAGING_INTEGRATION_FAILED";
    const code = raw.split(":", 1)[0];
    const status = code.includes("BODY_TOO_LARGE")
      ? 413
      : code.includes("AUTH") || code.includes("ROLE") || code.includes("ORIGIN")
        ? 403
        : code.includes("STAGING_ONLY") ||
            code.includes("SAFETY") ||
            code.includes("BLOCKED") ||
            code.includes("COLLISION")
          ? 409
          : 400;
    return json(
      {
        ok: false,
        status: "failed",
        error: {
          code,
          message: "The staging commerce integration command could not be completed.",
        },
      },
      status,
    );
  }
};
