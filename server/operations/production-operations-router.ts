import type { MMGCommerceStagingRehearsalHTTPDependencies } from "./commerce-staging-rehearsal-http.js";
import { handleMMGCommerceStagingRehearsalRequest } from "./commerce-staging-rehearsal-http.js";

export interface MMGProductionOperationsRuntimeHandlers {
  handleOperations(request: Request): Promise<Response>;
  handleDashboard(request: Request): Promise<Response>;
}

export interface MMGProductionOperationsRouterDependencies {
  runtime: MMGProductionOperationsRuntimeHandlers;
  rehearsal: MMGCommerceStagingRehearsalHTTPDependencies;
}

export const MMG_PRODUCTION_OPERATIONS_ROUTE_MANIFEST = Object.freeze({
  operations: "/api/internal/commerce/operations",
  dashboard: "/api/admin/commerce/operations",
  rehearsal: "/api/internal/commerce/rehearsal",
  rehearsalAdapter: "/api/internal/commerce/rehearsal/adapter",
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
  return null;
};
