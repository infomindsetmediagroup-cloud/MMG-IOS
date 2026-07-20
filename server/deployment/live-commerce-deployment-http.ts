import {
  executeMMGCommerceDeploymentCommand,
  type MMGCommerceDeploymentCommand,
  type MMGCommerceDeploymentPrincipal,
  type MMGCommerceDeploymentServiceDependencies,
} from "./live-commerce-deployment-service.js";

const MAX_BODY_BYTES = 32_768;

export interface MMGCommerceDeploymentHttpDependencies
  extends MMGCommerceDeploymentServiceDependencies {
  authorize(request: Request): Promise<MMGCommerceDeploymentPrincipal | null>;
  validateSameOriginOrInternal(request: Request): boolean;
}

const responseHeaders = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    Vary: "Authorization",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });

const json = (body: Record<string, unknown>, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders() });

const failure = (
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  allow?: string,
): Response => {
  const headers = responseHeaders();
  if (allow) headers.set("Allow", allow);
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, retryable } }),
    { status, headers },
  );
};

const errorCode = (error: unknown): string => {
  if (error instanceof Error && /^MMG_[A-Z0-9_:,./-]+$/.test(error.message)) {
    return error.message;
  }
  return "MMG_COMMERCE_DEPLOYMENT_INTERNAL_ERROR";
};

const retryable = (code: string): boolean =>
  ![
    "MMG_DEPLOYMENT_ROLE_REQUIRED",
    "MMG_PRODUCTION_RELEASE_ROLE_REQUIRED",
    "MMG_DEPLOYMENT_APPROVAL_REQUIRED",
    "MMG_DEPLOYMENT_ACTION_NOT_APPROVED",
    "MMG_DEPLOYMENT_APPROVAL_COMMIT_MISMATCH",
    "MMG_DEPLOYMENT_APPROVAL_ENVIRONMENT_MISMATCH",
    "MMG_DEPLOYMENT_REQUEST_ID_COLLISION",
    "MMG_DEPLOYMENT_PUBLICATION_REQUIRES_FRESH_E2E",
  ].some((prefix) => code.startsWith(prefix));

const parseCommand = (value: unknown): MMGCommerceDeploymentCommand => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MMG_DEPLOYMENT_PAYLOAD_INVALID");
  }
  const input = value as Record<string, unknown>;
  const action = String(input.action ?? "") as MMGCommerceDeploymentCommand["action"];
  const environment = String(
    input.environment ?? "",
  ) as MMGCommerceDeploymentCommand["environment"];
  if (!["plan", "execute", "verify", "publish", "rollback"].includes(action)) {
    throw new Error("MMG_DEPLOYMENT_ACTION_INVALID");
  }
  if (!["staging", "production"].includes(environment)) {
    throw new Error("MMG_DEPLOYMENT_ENVIRONMENT_INVALID");
  }
  return {
    requestId: String(input.requestId ?? ""),
    releaseId: String(input.releaseId ?? ""),
    environment,
    action,
    releaseCommitSha: String(input.releaseCommitSha ?? ""),
    includePublication: input.includePublication === true,
    expectedReleaseVersion:
      input.expectedReleaseVersion === undefined
        ? undefined
        : Number(input.expectedReleaseVersion),
  };
};

export const handleMMGCommerceDeploymentRequest = async (
  request: Request,
  dependencies: MMGCommerceDeploymentHttpDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return failure(
      405,
      "MMG_DEPLOYMENT_METHOD_NOT_ALLOWED",
      "Only POST is supported by the internal commerce deployment endpoint.",
      false,
      "POST",
    );
  }
  if (!dependencies.validateSameOriginOrInternal(request)) {
    return failure(
      403,
      "MMG_DEPLOYMENT_ORIGIN_INVALID",
      "The deployment request did not originate from an approved internal control plane.",
      false,
    );
  }

  const principal = await dependencies.authorize(request);
  if (!principal) {
    return failure(
      401,
      "MMG_DEPLOYMENT_AUTHENTICATION_REQUIRED",
      "A valid internal deployment credential is required.",
      false,
    );
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return failure(
      413,
      "MMG_DEPLOYMENT_BODY_TOO_LARGE",
      "The deployment request exceeded the accepted size.",
      false,
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return failure(
      400,
      "MMG_DEPLOYMENT_BODY_UNREADABLE",
      "The deployment request body could not be read.",
      false,
    );
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return failure(
      413,
      "MMG_DEPLOYMENT_BODY_TOO_LARGE",
      "The deployment request exceeded the accepted size.",
      false,
    );
  }

  try {
    const command = parseCommand(JSON.parse(raw));
    const result = await executeMMGCommerceDeploymentCommand({
      command,
      principal,
      dependencies,
    });
    return json(result.body, result.status);
  } catch (error) {
    const code = errorCode(error);
    const isRetryable = retryable(code);
    const validation =
      code.includes("INVALID") ||
      code.includes("REQUIRED") ||
      code.includes("MISMATCH") ||
      code.includes("COLLISION") ||
      code.includes("CONFLICT") ||
      code.includes("BLOCKED") ||
      code.includes("EXPIRED");
    return failure(
      validation ? 409 : 500,
      code,
      validation
        ? "The controlled commerce deployment request did not satisfy its release contract."
        : "The controlled commerce deployment could not be completed.",
      isRetryable,
    );
  }
};
