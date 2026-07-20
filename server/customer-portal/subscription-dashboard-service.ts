import {
  buildMMGCustomerPortalSubscriptionDashboard,
  type MMGCustomerPortalSubscriptionDashboard,
  type MMGPortalDashboardLinks,
} from "./subscription-dashboard.js";
import type { MMGCustomerPortalSubscriptionRepository } from "./subscription-dashboard-repository.js";

export interface MMGCustomerPortalDashboardPrincipal {
  customerId: string;
  sessionId: string;
}

export interface MMGCustomerPortalDashboardSuccess {
  status: 200;
  body: {
    ok: true;
    dashboard: MMGCustomerPortalSubscriptionDashboard;
  };
}

export interface MMGCustomerPortalDashboardFailure {
  status: 404;
  body: {
    ok: false;
    error: {
      code: "SUBSCRIPTION_DASHBOARD_NOT_FOUND";
      message: string;
      retryable: false;
    };
  };
}

export type MMGCustomerPortalDashboardResponse =
  | MMGCustomerPortalDashboardSuccess
  | MMGCustomerPortalDashboardFailure;

export const getMMGCustomerPortalSubscriptionDashboard = async (input: {
  repository: MMGCustomerPortalSubscriptionRepository;
  principal: MMGCustomerPortalDashboardPrincipal;
  links: MMGPortalDashboardLinks;
  asOf: Date;
}): Promise<MMGCustomerPortalDashboardResponse> => {
  const subscription = await input.repository.loadSubscriptionDashboardRecord(
    input.principal.customerId,
    input.asOf,
  );

  if (!subscription) {
    return {
      status: 404,
      body: {
        ok: false,
        error: {
          code: "SUBSCRIPTION_DASHBOARD_NOT_FOUND",
          message: "No MMG Knowledge Subscription record is available for this customer.",
          retryable: false,
        },
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      dashboard: buildMMGCustomerPortalSubscriptionDashboard({
        subscription,
        links: input.links,
      }),
    },
  };
};
