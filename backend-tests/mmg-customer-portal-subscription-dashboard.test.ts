import { describe, expect, it } from "vitest";
import {
  buildMMGCustomerPortalSubscriptionDashboard,
  type MMGPortalDashboardLinks,
  type MMGPortalSubscriptionRecord,
  type MMGPortalWindowRecord,
} from "../server/customer-portal/subscription-dashboard.js";

const links: MMGPortalDashboardLinks = {
  knowledgeLibraryUrl: "/pages/knowledge-library",
  selectionUrl: "/pages/knowledge-library#subscription-selection",
  myLibraryUrl: "/pages/knowledge-library#my-library",
  membershipUrl: "/products/mmg-knowledge-subscription",
  manageMembershipUrl: "/account",
  customerServiceUrl: "/pages/customer-service",
  subscriptionGuideUrl: "/pages/customer-portal#subscription-member-guide",
};

const windowRecord = (
  overrides: Partial<MMGPortalWindowRecord> = {},
): MMGPortalWindowRecord => ({
  id: "window-1",
  packageSequence: 1,
  type: "first_package",
  status: "open",
  totalUnits: 2,
  targetAssetCount: 2,
  opensAt: "2026-07-20T00:00:00.000Z",
  closesAt: "2026-07-22T00:00:00.000Z",
  confirmedAt: null,
  deliveryReadyAt: null,
  deliveredAt: null,
  deliveryReference: null,
  recoveryReason: null,
  selections: [],
  ...overrides,
});

const subscriptionRecord = (
  overrides: Partial<MMGPortalSubscriptionRecord> = {},
): MMGPortalSubscriptionRecord => ({
  status: "active",
  planCode: "weekly",
  currentPeriodStart: "2026-07-20T00:00:00.000Z",
  currentPeriodEnd: "2026-08-20T00:00:00.000Z",
  totalOwnedAssets: 6,
  cycle: {
    id: "cycle-1",
    status: "active",
    startsAt: "2026-07-20T00:00:00.000Z",
    endsAt: "2026-08-20T00:00:00.000Z",
    totalPackages: 4,
    confirmedPackages: 1,
    totalUnits: 8,
    consumedUnits: 2,
    windows: [windowRecord()],
  },
  ...overrides,
});

describe("MMG Customer Portal subscription dashboard", () => {
  it("locks the Weekly price and fixed four-package eight-asset entitlement", () => {
    const dashboard = buildMMGCustomerPortalSubscriptionDashboard({
      subscription: subscriptionRecord(),
      links,
    });

    expect(dashboard.membership.plan).toEqual({
      code: "weekly",
      displayName: "Weekly",
      monthlyPrice: 39.95,
      monthlyPriceCents: 3995,
      packagesPerBillingCycle: 4,
      assetsPerPackage: 2,
      assetsPerBillingCycle: 8,
    });
    expect(dashboard.progress).toEqual({
      totalPackages: 4,
      completedPackages: 1,
      remainingPackages: 3,
      totalAssets: 8,
      committedAssets: 2,
      remainingAssets: 6,
      totalOwnedAssets: 6,
    });
  });

  it("directs the first open package to choose two titles", () => {
    const dashboard = buildMMGCustomerPortalSubscriptionDashboard({
      subscription: subscriptionRecord(),
      links,
    });

    expect(dashboard.currentPackage?.type).toBe("first_package");
    expect(dashboard.currentPackage?.action.code).toBe("choose_first_titles");
    expect(dashboard.currentPackage?.action.href).toBe(links.selectionUrl);
    expect(dashboard.currentPackage?.targetAssetCount).toBe(2);
    expect(dashboard.currentPackage?.totalUnits).toBe(2);
  });

  it("prioritizes recovery over an open package", () => {
    const dashboard = buildMMGCustomerPortalSubscriptionDashboard({
      subscription: subscriptionRecord({
        cycle: {
          ...subscriptionRecord().cycle!,
          windows: [
            windowRecord({ id: "open-window", packageSequence: 2 }),
            windowRecord({
              id: "recovery-window",
              packageSequence: 1,
              status: "recovery_required",
              recoveryReason: "FIRST_PACKAGE_CUSTOMER_SELECTION_EXPIRED",
            }),
          ],
        },
      }),
      links,
    });

    expect(dashboard.currentPackage?.id).toBe("recovery-window");
    expect(dashboard.primaryAction.code).toBe("recovery_required");
    expect(dashboard.primaryAction.href).toBe(links.customerServiceUrl);
  });

  it("directs confirmed and delivered packages to My Library", () => {
    for (const status of ["confirmed", "delivery_ready", "delivered"] as const) {
      const dashboard = buildMMGCustomerPortalSubscriptionDashboard({
        subscription: subscriptionRecord({
          cycle: {
            ...subscriptionRecord().cycle!,
            windows: [windowRecord({ status, confirmedAt: "2026-07-21T00:00:00.000Z" })],
          },
        }),
        links,
      });

      expect(dashboard.primaryAction.code).toBe("view_delivery");
      expect(dashboard.primaryAction.href).toBe(links.myLibraryUrl);
    }
  });

  it("shows a renewal action for an inactive membership", () => {
    const dashboard = buildMMGCustomerPortalSubscriptionDashboard({
      subscription: subscriptionRecord({ status: "canceled", cycle: null }),
      links,
    });

    expect(dashboard.membership.active).toBe(false);
    expect(dashboard.primaryAction.code).toBe("renew_membership");
    expect(dashboard.primaryAction.href).toBe(links.membershipUrl);
    expect(dashboard.currentPackage).toBeNull();
  });

  it("keeps package history ordered by sequence", () => {
    const dashboard = buildMMGCustomerPortalSubscriptionDashboard({
      subscription: subscriptionRecord({
        cycle: {
          ...subscriptionRecord().cycle!,
          windows: [
            windowRecord({ id: "window-4", packageSequence: 4, status: "scheduled" }),
            windowRecord({ id: "window-1", packageSequence: 1, status: "delivered" }),
            windowRecord({ id: "window-3", packageSequence: 3, status: "scheduled" }),
            windowRecord({ id: "window-2", packageSequence: 2, status: "open" }),
          ],
        },
      }),
      links,
    });

    expect(dashboard.packages.map((item) => item.packageSequence)).toEqual([1, 2, 3, 4]);
  });
});
