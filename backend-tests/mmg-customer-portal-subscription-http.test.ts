import { describe, expect, it } from "vitest";
import { handleMMGCustomerPortalSubscriptionRequest } from "../server/customer-portal/subscription-dashboard-http.js";
import type { MMGCustomerPortalSubscriptionRepository } from "../server/customer-portal/subscription-dashboard-repository.js";
import type { MMGPortalDashboardLinks } from "../server/customer-portal/subscription-dashboard.js";

const links: MMGPortalDashboardLinks = {
  knowledgeLibraryUrl: "/pages/knowledge-library",
  selectionUrl: "/pages/knowledge-library#subscription-selection",
  myLibraryUrl: "/pages/knowledge-library#my-library",
  membershipUrl: "/products/mmg-knowledge-subscription",
  manageMembershipUrl: "/account",
  customerServiceUrl: "/pages/customer-service",
  subscriptionGuideUrl: "/pages/customer-portal#subscription-member-guide",
};

const repository = (found = true): MMGCustomerPortalSubscriptionRepository => ({
  async loadSubscriptionDashboardRecord() {
    if (!found) return null;
    return {
      status: "active",
      planCode: "monthly",
      currentPeriodStart: "2026-07-20T00:00:00.000Z",
      currentPeriodEnd: "2026-08-20T00:00:00.000Z",
      totalOwnedAssets: 2,
      cycle: {
        id: "cycle-1",
        status: "active",
        startsAt: "2026-07-20T00:00:00.000Z",
        endsAt: "2026-08-20T00:00:00.000Z",
        totalPackages: 1,
        confirmedPackages: 0,
        totalUnits: 2,
        consumedUnits: 0,
        windows: [],
      },
    };
  },
});

const dependencies = (input: {
  authenticated?: boolean;
  found?: boolean;
}) => ({
  repository: repository(input.found ?? true),
  links,
  async authenticate() {
    return input.authenticated === false
      ? null
      : { customerId: "customer-1", sessionId: "session-1" };
  },
  now: () => new Date("2026-07-20T12:00:00.000Z"),
});

describe("MMG Customer Portal subscription HTTP handler", () => {
  it("rejects unsupported methods", async () => {
    const response = await handleMMGCustomerPortalSubscriptionRequest(
      new Request("https://example.com/api/customer-portal/subscription", {
        method: "POST",
      }),
      dependencies({}),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("requires an authenticated Customer Portal session", async () => {
    const response = await handleMMGCustomerPortalSubscriptionRequest(
      new Request("https://example.com/api/customer-portal/subscription"),
      dependencies({ authenticated: false }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("SUBSCRIPTION_DASHBOARD_AUTHENTICATION_REQUIRED");
  });

  it("returns a private customer-safe dashboard", async () => {
    const response = await handleMMGCustomerPortalSubscriptionRequest(
      new Request("https://example.com/api/customer-portal/subscription"),
      dependencies({}),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(body.dashboard.membership.plan.monthlyPriceCents).toBe(1495);
    expect(serialized).not.toContain("providerContractId");
    expect(serialized).not.toContain("deliveryPackageReference");
    expect(serialized).not.toContain("customer-1");
  });

  it("returns the governed no-subscription state", async () => {
    const response = await handleMMGCustomerPortalSubscriptionRequest(
      new Request("https://example.com/api/customer-portal/subscription"),
      dependencies({ found: false }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("SUBSCRIPTION_DASHBOARD_NOT_FOUND");
  });
});
