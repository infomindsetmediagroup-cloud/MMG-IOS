import {
  resolveMMGThankYouFirstTitleHandoff,
  type MMGThankYouExtensionPrincipal,
  type MMGThankYouHandoffRequest,
  type MMGThankYouHandoffServiceDependencies,
} from "./thank-you-handoff-service.js";

export interface MMGThankYouHandoffHttpDependencies
  extends MMGThankYouHandoffServiceDependencies {
  authenticateSessionToken(request: Request): Promise<MMGThankYouExtensionPrincipal | null>;
}

const MAX_BODY_BYTES = 4096;

const responseHeaders = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    Vary: "Authorization",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(),
  });

const failure = (
  status: number,
  code: string,
  message: string,
  retryable: boolean,
): Response =>
  jsonResponse(status, {
    ok: false,
    error: { code, message, retryable },
  });

const parseRequest = async (
  request: Request,
): Promise<MMGThankYouHandoffRequest | null> => {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.orderId !== "string" || typeof record.checkoutToken !== "string") {
    return null;
  }

  return {
    orderId: record.orderId,
    checkoutToken: record.checkoutToken,
  };
};

export const handleMMGThankYouFirstTitleHandoffRequest = async (
  request: Request,
  dependencies: MMGThankYouHandoffHttpDependencies,
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders() });
  }

  if (request.method !== "POST") {
    const response = failure(
      405,
      "HANDOFF_METHOD_NOT_ALLOWED",
      "Only POST is supported by the thank-you handoff endpoint.",
      false,
    );
    response.headers.set("Allow", "POST, OPTIONS");
    return response;
  }

  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return failure(
      401,
      "HANDOFF_AUTHENTICATION_REQUIRED",
      "A valid Shopify checkout extension session token is required.",
      false,
    );
  }

  try {
    const principal = await dependencies.authenticateSessionToken(request);
    if (!principal) {
      return failure(
        401,
        "HANDOFF_AUTHENTICATION_REQUIRED",
        "The Shopify checkout session could not be authenticated.",
        false,
      );
    }

    const payload = await parseRequest(request);
    if (!payload) {
      return failure(
        400,
        "HANDOFF_INVALID_JSON",
        "The thank-you handoff request must include a valid order ID and checkout token.",
        false,
      );
    }

    const result = await resolveMMGThankYouFirstTitleHandoff(
      principal,
      payload,
      dependencies,
    );
    return jsonResponse(result.status, result.body);
  } catch {
    return failure(
      500,
      "HANDOFF_INTERNAL_ERROR",
      "The first-title handoff could not be resolved right now.",
      true,
    );
  }
};
