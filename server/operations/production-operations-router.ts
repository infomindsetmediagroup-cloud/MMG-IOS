import type { MMGCommerceStagingRehearsalHTTPDependencies } from "./commerce-staging-rehearsal-http.js";
import { handleMMGCommerceStagingRehearsalRequest } from "./commerce-staging-rehearsal-http.js";
import type { MMGCommerceStagingRehearsalAdapterHTTPDependencies } from "./commerce-staging-rehearsal-adapter-http.js";
import { handleMMGCommerceStagingRehearsalAdapterRequest } from "./commerce-staging-rehearsal-adapter-http.js";
import type { MMGRuntimeControlHTTPDependencies } from "./runtime-control-http.js";
import { handleMMGRuntimeControlRequest } from "./runtime-control-http.js";
import type { MMGStagingIntegrationHTTPDependencies } from "./staging-integration-http.js";
import { handleMMGStagingIntegrationRequest } from "./staging-integration-http.js";

export interface MMGProductionOperationsRuntimeHandlers {
  handleOperations(request: Request): Promise<Response>;
  handleDashboard(request: Request): Promise<Response>;
}

export interface MMGProductionOperationsRouterDependencies {
  runtime: MMGProductionOperationsRuntimeHandlers;
  rehearsal: MMGCommerceStagingRehearsalHTTPDependencies;
  rehearsalAdapter: MMGCommerceStagingRehearsalAdapterHTTPDependencies;
  runtimeControl: MMGRuntimeControlHTTPDependencies;
  stagingIntegration?: MMGStagingIntegrationHTTPDependencies;
}

export const MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST = Object.freeze({
  operations: "/api/internal/commerce/operations",
  dashboard: "/api/admin/commerce/operations",
  rehearsal: "/api/internal/commerce/rehearsal",
  rehearsalAdapter: "/api/internal/commerce/rehearsal/adapter",
  stagingIntegration: "/api/internal/commerce/staging-integration",
  control: "/api/internal/runtime-controls/control",
  rollout: "/api/internal/runtime-controls/rollout",
});

export const routeMMGProductionOperationsRequest = async (
  request: Request,
  dependencies: MMGProductionOperationsRouterDependencies,
): Promise<Response | null> => {
  const pathname = new URL(request.url).pathname;
  if (pathname === MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST.operations) {
    return dependencies.runtime.handleOperations(request);
  }
  if (pathname === MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST.dashboard) {
    return dependencies.runtime.handleDashboard(request);
  }
  if (pathname === MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST.rehearsal) {
    return handleMMGCommerceStagingRehearsalRequest(request, dependencies.rehearsal);
  }
  if (pathname === MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST.rehearsalAdapter) {
    return handleMMGCommerceStagingRehearsalAdapterRequest(
      request,
      dependencies.rehearsalAdapter,
    );
  }
  if (pathname === MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST.stagingIntegration) {
    if (!dependencies.stagingIntegration) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: "unavailable",
          error: { code: "MMG_STAGING_INTEGRATION_NOT_CONFIGURED" },
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, private, max-age=0",
          },
        },
      );
    }
    return handleMMGStagingIntegrationRequest(
      request,
      dependencies.stagingIntegration,
    );
  }
  if (
    pathname === MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST.control ||
    pathname === MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST.rollout
  ) {
    return handleMMGRuntimeControlRequest(request, dependencies.runtimeControl);
  }
  return null;
};
