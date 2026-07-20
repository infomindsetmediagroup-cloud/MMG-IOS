import { describe, expect, it } from "vitest";
import {
  buildMMGThankYouFirstTitleHandoff,
  findMMGSubscriptionLine,
  type MMGThankYouEntitlementSnapshot,
  type MMGVerifiedThankYouOrder,
} from "../server/checkout/thank-you-first-title-handoff.js";

const links = {
  selectionUrl:
    "https://themindsetmediagroup.com/pages/knowledge-library?mode=subscription-selection&handoff=first-package",
  customerPortalUrl: "https://themindsetmediagroup.com/pages/customer-portal",
  myLibraryUrl: "https://themindsetmediagroup.com/pages/customer-portal#my-library",
  customerServiceUrl: "https://themindsetmediagroup.com/pages/customer-service",
  membershipUrl: "https://themindsetmediagroup.com/products/mmg-knowledge-subscription",
};

const order = (overrides: Partial<MMGVerifiedThankYouOrder> = {}): MMGVerifiedThankYouOrder => ({
  orderId: "gid://shopify/Order/123456789",
  checkoutToken: "checkout-token-123456789",
  shopDomain: "mindsetmediagroup.myshopify.com",
  customerId: "gid://shopify/Customer/42",
  createdAt: "2026-07-20T21:00:00.000Z",
  lines: [
    {
      productId: "gid://shopify/Product/100",
      productHandle: "mmg-knowledge-subscription",
      variantId: "gid://shopify/ProductVariant/101",
      sellingPlanId: "gid://shopify/SellingPlan/102",
      properties: {
        _mmg_subscription_plan_code: "monthly",
        _mmg_recurring_consent: "confirmed",
      },
    },
  ],
  ...overrides,
});

const entitlement = (
  overrides: Partial<MMGThankYouEntitlementSnapshot> = {},
): MMGThankYouEntitlementSnapshot => ({
  entitlementId: "entitlement-1",
  customerId: "gid://shopify/Customer/42",
  status: "active",
  planCode: "monthly",
  firstWindow: {
    id: "window-1",
    type: "first_package",
    status: "open",
    selectedAssetCount: 0,
    targetAssetCount: 2,
    closesAt: "2026-07-22T21:00:00.000Z",
    recoveryReason: null,
  },
  ...overrides,
});

const build = (
  verifiedOrder: MMGVerifiedThankYouOrder,
  subscriptionEntitlement: MMGThankYouEntitlementSnapshot | null,
) =>
  buildMMGThankYouFirstTitleHandoff({
    order: verifiedOrder,
    entitlement: subscriptionEntitlement,
    links,
    canonicalProductId: "gid://shopify/Product/100",
    canonicalProductHandle: "mmg-knowledge-subscription",
  });

describe("MMG Thank-you first-title handoff", () => {
  it("requires the canonical product, selling plan, and approved private plan marker", () => {
    expect(
      findMMGSubscriptionLine(
        order(),
        "gid://shopify/Product/100",
        "mmg-knowledge-subscription",
      )?.planCode,
    ).toBe("monthly");

    expect(
      findMMGSubscriptionLine(
        order({
          lines: [
            {
              ...order().lines[0],
              sellingPlanId: null,
            },
          ],
        }),
        "gid://shopify/Product/100",
        "mmg-knowledge-subscription",
      ),
    ).toBeNull();

    expect(
      findMMGSubscriptionLine(
        order({
          lines: [
            {
              ...order().lines[0],
              productId: "gid://shopify/Product/999",
              productHandle: "another-subscription",
            },
          ],
        }),
        "gid://shopify/Product/100",
        "mmg-knowledge-subscription",
      ),
    ).toBeNull();
  });

  it("renders nothing for a non-subscription order", () => {
    const result = build(
      order({
        lines: [
          {
            ...order().lines[0],
            productId: "gid://shopify/Product/200",
            productHandle: "ai-image-mastery",
            sellingPlanId: null,
            properties: {},
          },
        ],
      }),
      null,
    );

    expect(result.state).toBe("not_applicable");
    expect(result.applicable).toBe(false);
    expect(result.action).toBeNull();
  });

  it("requires guest buyers to authenticate before private entitlement state", () => {
    const result = build(order({ customerId: null }), null);

    expect(result.state).toBe("sign_in_required");
    expect(result.action?.href).toBe(links.customerPortalUrl);
    expect(result.package).toBeNull();
  });

  it("keeps the handoff pending until the order is linked to an entitlement", () => {
    const result = build(order(), null);

    expect(result.state).toBe("activation_pending");
    expect(result.heading).toContain("being prepared");
    expect(result.action?.href).toBe(links.customerPortalUrl);
  });

  it("opens Choose Your First Two Titles for an untouched first window", () => {
    const result = build(order(), entitlement());

    expect(result.state).toBe("ready");
    expect(result.action).toEqual({
      label: "Choose your first two titles",
      href: links.selectionUrl,
    });
    expect(result.package).toEqual(
      expect.objectContaining({
        status: "open",
        selectedAssetCount: 0,
        targetAssetCount: 2,
      }),
    );
  });

  it("returns a customer to a partially completed first package", () => {
    const result = build(
      order(),
      entitlement({
        firstWindow: {
          ...entitlement().firstWindow!,
          selectedAssetCount: 1,
        },
      }),
    );

    expect(result.state).toBe("selection_in_progress");
    expect(result.action?.label).toBe("Continue title selection");
    expect(result.message).toContain("1 of 2");
  });

  it("routes expired first packages through governed recovery", () => {
    const result = build(
      order(),
      entitlement({
        firstWindow: {
          ...entitlement().firstWindow!,
          status: "recovery_required",
          recoveryReason: "FIRST_PACKAGE_EXPIRED",
        },
      }),
    );

    expect(result.state).toBe("recovery_required");
    expect(result.action?.href).toBe(links.customerServiceUrl);
  });

  it("routes confirmed and delivered first packages to My Library", () => {
    for (const status of ["confirmed", "delivery_ready", "delivered"] as const) {
      const result = build(
        order(),
        entitlement({
          firstWindow: {
            ...entitlement().firstWindow!,
            status,
            selectedAssetCount: 2,
          },
        }),
      );

      expect(result.state).toBe("completed");
      expect(result.action?.href).toBe(links.myLibraryUrl);
    }
  });

  it("uses the entitlement plan after webhook reconciliation", () => {
    const result = build(order(), entitlement({ planCode: "weekly" }));

    expect(result.membership).toEqual({
      planCode: "weekly",
      planName: "Weekly",
    });
  });
});
