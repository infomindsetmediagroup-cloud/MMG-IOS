import { getMMGEntitlementDashboard } from "./entitlement-service.js";
import type { MMGEntitlementOwnershipRepository } from "./persistence.js";
import type { MMGPickerPrincipal } from "./picker-service.js";

export interface MMGEntitlementHttpDependencies {
  repository: MMGEntitlementOwnershipRepository;
  authenticate(request: Request): Promise<MMGPickerPrincipal | null>;
  now(): Date;
}

const responseHeaders = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });

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
    JSON.stringify({
      ok: false,
      error: { code, message, retryable },
    }),
    { status, headers },
  );
};

export const handleMMGEntitlementRequest = async (
  request: Request,
  dependencies: MMGEntitlementHttpDependencies,
): Promise<Response> => {
  if (request.method !== "GET") {
    return failure(
      405,
      "ENTITLEMENT_METHOD_NOT_ALLOWED",
      "Only GET is supported by the entitlement endpoint.",
      false,
      "GET",
    );
  }

  try {
    const principal = await dependencies.authenticate(request);
    if (!principal) {
      return failure(
        401,
        "ENTITLEMENT_AUTHENTICATION_REQUIRED",
        "Sign in through the Customer Portal to view your membership entitlement.",
        false,
      );
    }

    const serviceResponse = await getMMGEntitlementDashboard(
      dependencies.repository,
      principal,
      dependencies.now(),
    );

    return new Response(JSON.stringify(serviceResponse.body), {
      status: serviceResponse.status,
      headers: responseHeaders(),
    });
  } catch {
    return failure(
      500,
      "ENTITLEMENT_INTERNAL_ERROR",
      "The entitlement service encountered an unexpected error.",
      true,
    );
  }
};
