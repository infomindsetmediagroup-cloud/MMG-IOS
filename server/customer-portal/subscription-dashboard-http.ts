import type { MMGPortalDashboardLinks } from "./subscription-dashboard.js";
import type { MMGCustomerPortalSubscriptionRepository } from "./subscription-dashboard-repository.js";
import {
  getMMGCustomerPortalSubscriptionDashboard,
  type MMGCustomerPortalDashboardPrincipal,
} from "./subscription-dashboard-service.js";

export interface MMGCustomerPortalSubscriptionHttpDependencies {
  repository: MMGCustomerPortalSubscriptionRepository;
  links: MMGPortalDashboardLinks;
  authenticate(request: Request): Promise<MMGCustomerPortalDashboardPrincipal | null>;
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
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
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

export const handleMMGCustomerPortalSubscriptionRequest = async (
  request: Request,
  dependencies: MMGCustomerPortalSubscriptionHttpDependencies,
): Promise<Response> => {
  if (request.method !== "GET") {
    return failure(
      405,
      "SUBSCRIPTION_DASHBOARD_METHOD_NOT_ALLOWED",
      "Only GET is supported by the subscription dashboard endpoint.",
      false,
      "GET",
    );
  }

  try {
    const principal = await dependencies.authenticate(request);
    if (!principal) {
      return failure(
        401,
        "SUBSCRIPTION_DASHBOARD_AUTHENTICATION_REQUIRED",
        "Sign in through the Customer Portal to view your membership dashboard.",
        false,
      );
    }

    const serviceResponse = await getMMGCustomerPortalSubscriptionDashboard({
      repository: dependencies.repository,
      principal,
      links: dependencies.links,
      asOf: dependencies.now(),
    });

    return new Response(JSON.stringify(serviceResponse.body), {
      status: serviceResponse.status,
      headers: responseHeaders(),
    });
  } catch {
    return failure(
      500,
      "SUBSCRIPTION_DASHBOARD_INTERNAL_ERROR",
      "The Customer Portal could not load the membership dashboard.",
      true,
    );
  }
};
