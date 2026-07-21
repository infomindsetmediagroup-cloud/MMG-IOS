import {
  executeMMGStagingReadinessInspection,
  type MMGStagingReadinessDependencies,
  type MMGStagingReadinessPrincipal,
} from "./staging-readiness-service.js";

export interface MMGStagingReadinessAuthenticator {
  authenticate(request: Request): Promise<MMGStagingReadinessPrincipal | null>;
}

export interface MMGStagingReadinessHTTPDependencies
  extends MMGStagingReadinessDependencies {
  authenticator: MMGStagingReadinessAuthenticator;
  allowedOrigins: ReadonlySet<string>;
}

const MAX_BODY_BYTES = 16 * 1024;

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

const parseBody = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("MMG_STAGING_READINESS_CONTENT_TYPE_INVALID");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error("MMG_STAGING_READINESS_BODY_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("MMG_STAGING_READINESS_JSON_INVALID");
  }
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const nullableBoolean = (value: unknown): boolean | null =>
  value === true || value === false ? value : null;

export const handleMMGStagingReadinessRequest = async (
  request: Request,
  dependencies: MMGStagingReadinessHTTPDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  try {
    if (!request.headers.get("x-mmg-internal-request")) {
      throw new Error("MMG_STAGING_READINESS_INTERNAL_MARKER_REQUIRED");
    }
    const origin = request.headers.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      throw new Error("MMG_STAGING_READINESS_ORIGIN_FORBIDDEN");
    }
    const principal = await dependencies.authenticator.authenticate(request);
    if (!principal) throw new Error("MMG_STAGING_READINESS_AUTH_REQUIRED");
    const body = await parseBody(request);
    const tooling = object(body.tooling);
    const githubEnvironment = object(body.githubEnvironment);
    const report = await executeMMGStagingReadinessInspection({
      command: {
        requestId: String(body.requestId ?? ""),
        environment: String(body.environment ?? "") as "staging",
        releaseId: String(body.releaseId ?? ""),
        releaseCommitSha: String(body.releaseCommitSha ?? ""),
        tooling: {
          nodeMajor:
            tooling.nodeMajor === null || tooling.nodeMajor === undefined
              ? null
              : Number(tooling.nodeMajor),
          psqlAvailable: nullableBoolean(tooling.psqlAvailable),
          sha256ToolAvailable: nullableBoolean(tooling.sha256ToolAvailable),
          migrationRunnerPresent: tooling.migrationRunnerPresent === true,
          releaseRegistrationPresent:
            tooling.releaseRegistrationPresent === true,
          workflowPresent: tooling.workflowPresent === true,
        },
        githubEnvironment: {
          configured: nullableBoolean(githubEnvironment.configured),
          requiredSecretNamesPresent: nullableBoolean(
            githubEnvironment.requiredSecretNamesPresent,
          ),
        },
        publicationAllowed: body.publicationAllowed as false,
        liveCustomerDataAllowed: body.liveCustomerDataAllowed as false,
      },
      principal,
      dependencies,
    });
    return json({ ok: true, status: report.status, report }, 200);
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "MMG_STAGING_READINESS_FAILED";
    const code = raw.split(":", 1)[0];
    const status = code.includes("BODY_TOO_LARGE")
      ? 413
      : code.includes("AUTH") ||
          code.includes("ROLE_REQUIRED") ||
          code.includes("ORIGIN_FORBIDDEN")
        ? 403
        : code.includes("STAGING_ONLY") || code.includes("SAFETY")
          ? 409
          : 400;
    return json(
      {
        ok: false,
        status: "failed",
        error: {
          code,
          message: "The staging readiness inspection could not be completed.",
        },
      },
      status,
    );
  }
};
