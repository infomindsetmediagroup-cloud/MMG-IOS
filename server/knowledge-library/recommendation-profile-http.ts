import {
  getMMGLearningProfile,
  saveMMGLearningProfile,
  type MMGLearningProfilePrincipal,
  type MMGLearningProfileRepository,
} from "./recommendation-profile.js";

const MAX_BODY_BYTES = 8192;

export interface MMGLearningProfileHttpDependencies {
  repository: MMGLearningProfileRepository;
  authenticate(request: Request): Promise<MMGLearningProfilePrincipal | null>;
  validateSameOrigin(request: Request): boolean;
  validateCsrf(input: {
    request: Request;
    principal: MMGLearningProfilePrincipal;
    token: string;
  }): Promise<boolean>;
  now(): Date;
}

const headers = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });

const response = (body: Record<string, unknown>, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: headers() });

const failure = (
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  allow?: string,
): Response => {
  const responseHeaders = headers();
  if (allow) responseHeaders.set("Allow", allow);
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, retryable } }),
    { status, headers: responseHeaders },
  );
};

const errorCode = (error: unknown): string =>
  error instanceof Error && /^MMG_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "MMG_LEARNING_PROFILE_INTERNAL_ERROR";

export const handleMMGLearningProfileRequest = async (
  request: Request,
  dependencies: MMGLearningProfileHttpDependencies,
): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "PUT") {
    return failure(
      405,
      "MMG_LEARNING_PROFILE_METHOD_NOT_ALLOWED",
      "Only GET and PUT are supported by the learning-profile endpoint.",
      false,
      "GET, PUT",
    );
  }

  const principal = await dependencies.authenticate(request);
  if (!principal) {
    return failure(
      401,
      "MMG_LEARNING_PROFILE_AUTHENTICATION_REQUIRED",
      "Sign in through the Customer Portal to manage your learning profile.",
      false,
    );
  }

  try {
    if (request.method === "GET") {
      const result = await getMMGLearningProfile({
        repository: dependencies.repository,
        principal,
      });
      return response(result.body, result.status);
    }

    if (!dependencies.validateSameOrigin(request)) {
      return failure(
        403,
        "MMG_LEARNING_PROFILE_ORIGIN_INVALID",
        "The learning-profile update did not originate from the Customer Portal.",
        false,
      );
    }

    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return failure(
        413,
        "MMG_LEARNING_PROFILE_BODY_TOO_LARGE",
        "The learning-profile update exceeded the accepted size.",
        false,
      );
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return failure(
        413,
        "MMG_LEARNING_PROFILE_BODY_TOO_LARGE",
        "The learning-profile update exceeded the accepted size.",
        false,
      );
    }

    const csrfToken = request.headers.get("X-MMG-CSRF-Token")?.trim() ?? "";
    if (
      !csrfToken ||
      !(await dependencies.validateCsrf({ request, principal, token: csrfToken }))
    ) {
      return failure(
        403,
        "MMG_LEARNING_PROFILE_CSRF_INVALID",
        "The learning-profile security token is invalid or expired.",
        false,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return failure(
        400,
        "MMG_LEARNING_PROFILE_JSON_INVALID",
        "The learning-profile update is not valid JSON.",
        false,
      );
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return failure(
        400,
        "MMG_LEARNING_PROFILE_PAYLOAD_INVALID",
        "The learning-profile update is incomplete.",
        false,
      );
    }

    const result = await saveMMGLearningProfile({
      repository: dependencies.repository,
      principal,
      payload: payload as Record<string, unknown>,
      occurredAt: dependencies.now(),
    });
    return response(result.body, result.status);
  } catch (error) {
    const code = errorCode(error);
    const validation = code.startsWith("MMG_LEARNING_PROFILE_") &&
      code !== "MMG_LEARNING_PROFILE_INTERNAL_ERROR" &&
      code !== "MMG_LEARNING_PROFILE_SAVE_FAILED";
    return failure(
      validation ? 400 : 500,
      code,
      validation
        ? "The learning-profile fields do not meet the MMG onboarding contract."
        : "The learning profile could not be saved.",
      !validation,
    );
  }
};