import type { MMGEntitlementOwnershipRepository, MMGEntitlementDashboardSnapshot } from "./persistence.js";
import type { MMGPickerPrincipal } from "./picker-service.js";

export interface MMGEntitlementServiceSuccess {
  status: 200;
  body: {
    ok: true;
    dashboard: MMGEntitlementDashboardSnapshot;
  };
}

export interface MMGEntitlementServiceFailure {
  status: 404;
  body: {
    ok: false;
    error: {
      code: "ENTITLEMENT_NOT_FOUND";
      message: string;
      retryable: false;
    };
  };
}

export type MMGEntitlementServiceResponse =
  | MMGEntitlementServiceSuccess
  | MMGEntitlementServiceFailure;

export const getMMGEntitlementDashboard = async (
  repository: MMGEntitlementOwnershipRepository,
  principal: MMGPickerPrincipal,
  asOf: Date,
): Promise<MMGEntitlementServiceResponse> => {
  const [counter, ownership] = await Promise.all([
    repository.getEntitlementCounter(principal),
    repository.getOwnershipSnapshot(principal, asOf),
  ]);

  if (!counter) {
    return {
      status: 404,
      body: {
        ok: false,
        error: {
          code: "ENTITLEMENT_NOT_FOUND",
          message: "No active MMG Knowledge Subscription entitlement is available.",
          retryable: false,
        },
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      dashboard: {
        schemaVersion: "1.0.0",
        counter,
        ownership: {
          totalOwnedAssets: ownership.totalOwnedAssets,
        },
      },
    },
  };
};
