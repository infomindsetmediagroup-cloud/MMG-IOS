import {
  buildMMGCommerceOperationsDashboard,
  type MMGCommerceOperationsDashboardPrincipal,
} from "./commerce-operations-dashboard.js";
import type { MMGCommerceOperationsEnvironment } from "./commerce-operations-control.js";
import type { MMGCommerceOperationsRepository } from "./commerce-operations-service.js";

export interface MMGCommerceOperationsDashboardAuthenticator {
  authenticate(
    request: Request,
  ): Promise<MMGCommerceOperationsDashboardPrincipal | null>;
}

export interface MMGCommerceOperationsDashboardHTTPDependencies {
  authenticator: MMGCommerceOperationsDashboardAuthenticator;
  repository: MMGCommerceOperationsRepository;
  now(): Date;
}

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

const environmentFrom = (request: Request): MMGCommerceOperationsEnvironment => {
  const value = new URL(request.url).searchParams.get("environment") ?? "production";
  if (value !== "staging" && value !== "production") {
    throw new Error("MMG_OPERATIONS_ENVIRONMENT_INVALID");
  }
  return value;
};

export const handleMMGCommerceOperationsDashboardRequest = async (
  request: Request,
  dependencies: MMGCommerceOperationsDashboardHTTPDependencies,
): Promise<Response> => {
  if (request.method !== "GET") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  try {
    const principal = await dependencies.authenticator.authenticate(request);
    if (!principal) throw new Error("MMG_OPERATIONS_AUTH_REQUIRED");
    const dashboard = await buildMMGCommerceOperationsDashboard({
      environment: environmentFrom(request),
      principal,
      repository: dependencies.repository,
      generatedAt: dependencies.now(),
    });
    return json({ ok: true, dashboard });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MMG_OPERATIONS_DASHBOARD_FAILED";
    const status = code.includes("AUTH") || code.includes("ROLE_REQUIRED") ? 403 : 400;
    return json(
      {
        ok: false,
        error: {
          code,
          message: "The commerce operations dashboard is unavailable.",
        },
      },
      status,
    );
  }
};
