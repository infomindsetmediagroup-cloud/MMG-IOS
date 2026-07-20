import { describe, expect, it, vi } from "vitest";
import { resolveMMGThankYouFirstTitleHandoff } from "../server/checkout/thank-you-handoff-service.js";
import type {
  MMGThankYouHandoffRepository,
  MMGThankYouOrderGateway,
} from "../server/checkout/thank-you-handoff-repository.js";
import type { MMGVerifiedThankYouOrder } from "../server/checkout/thank-you-first-title-handoff.js";

const verifiedOrder = (
  overrides: Partial<MMGVerifiedThankYouOrder> = {},
): MMGVerifiedThankYouOrder => ({
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
      properties: { _mmg_subscription_plan_code: "monthly" },
    },
  ],
  ...overrides,
});

const links = {
  selectionUrl: "/pages/knowledge-library?mode=subscription-selection&handoff=first-package",
  customerPortalUrl: "/pages/customer-portal",
  myLibraryUrl: "/pages/customer-portal#my-library",
  customerServiceUrl: "/pages/customer-service",
  membershipUrl: "/products/mmg-knowledge-subscription",
};

const principal = {
  shopDomain: "mindsetmediagroup.myshopify.com",
  customerId: "gid://shopify/Customer/42",
  tokenId: "session-token-jti-123456",
};

const request = {
  orderId: "gid://shopify/Order/123456789",
  checkoutToken: "checkout-token-123456789",
};

const dependencies = (input?: {
  order?: MMGVerifiedThankYouOrder | null;
  entitlement?: Awaited<ReturnType<MMGThankYouHandoffRepository["loadEntitlementForOrder"]>>;
}) => {
  const repository: MMGThankYouHandoffRepository = {
    recordVerifiedSubscriptionOrder: vi.fn().mockResolvedValue(undefined),
    loadEntitlementForOrder: vi.fn().mockResolvedValue(input?.entitlement ?? null),
  };
  const orderGateway: MMGThankYouOrderGateway = {
    loadVerifiedOrder: vi.fn().mockResolvedValue(
      input && "order" in input ? input.order : verifiedOrder(),
    ),
  };

  return {
    repository,
    orderGateway,
    canonicalProductId: "gid://shopify/Product/100",
    canonicalProductHandle: "mmg-knowledge-subscription",
    links,
    now: () => new Date("2026-07-20T21:01:00.000Z"),
  };
};

describe("MMG thank-you handoff service", () => {
  it("rejects incomplete order context before calling Shopify", async () => {
    const deps = dependencies();
    const result = await resolveMMGThankYouFirstTitleHandoff(
      principal,
      { orderId: "bad", checkoutToken: "bad" },
      deps,
    );

    expect(result.status).toBe(400);
    expect(deps.orderGateway.loadVerifiedOrder).not.toHaveBeenCalled();
  });

  it("treats delayed Shopify order creation as retryable", async () => {
    const result = await resolveMMGThankYouFirstTitleHandoff(
      principal,
      request,
      dependencies({ order: null }),
    );

    expect(result.status).toBe(404);
    expect(result.body.ok).toBe(false);
    if (!result.body.ok) expect(result.body.error.retryable).toBe(true);
  });

  it("rejects a shop, order, or checkout-token mismatch", async () => {
    const result = await resolveMMGThankYouFirstTitleHandoff(
      principal,
      request,
      dependencies({
        order: verifiedOrder({ checkoutToken: "different-checkout-token" }),
      }),
    );

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
  });

  it("does not persist or display a handoff for non-subscription orders", async () => {
    const deps = dependencies({
      order: verifiedOrder({
        lines: [
          {
            ...verifiedOrder().lines[0],
            productId: "gid://shopify/Product/200",
            productHandle: "ai-image-mastery",
            sellingPlanId: null,
            properties: {},
          },
        ],
      }),
    });

    const result = await resolveMMGThankYouFirstTitleHandoff(principal, request, deps);

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    if (result.body.ok) expect(result.body.handoff.state).toBe("not_applicable");
    expect(deps.repository.recordVerifiedSubscriptionOrder).not.toHaveBeenCalled();
  });

  it("records only a checkout-token hash for a verified subscription order", async () => {
    const deps = dependencies();
    await resolveMMGThankYouFirstTitleHandoff(principal, request, deps);

    expect(deps.repository.recordVerifiedSubscriptionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: principal.shopDomain,
        orderId: request.orderId,
        customerId: principal.customerId,
        planCode: "monthly",
        checkoutTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(
      (deps.repository.recordVerifiedSubscriptionOrder as ReturnType<typeof vi.fn>).mock
        .calls[0][0].checkoutTokenHash,
    ).not.toBe(request.checkoutToken);
  });

  it("does not guess an entitlement until webhook reconciliation links the order", async () => {
    const deps = dependencies({ entitlement: null });
    const result = await resolveMMGThankYouFirstTitleHandoff(principal, request, deps);

    expect(deps.repository.loadEntitlementForOrder).toHaveBeenCalledWith({
      shopDomain: principal.shopDomain,
      orderId: request.orderId,
      customerId: principal.customerId,
    });
    expect(result.body.ok).toBe(true);
    if (result.body.ok) expect(result.body.handoff.state).toBe("activation_pending");
  });

  it("rejects a signed-in customer that differs from the verified order customer", async () => {
    const result = await resolveMMGThankYouFirstTitleHandoff(
      { ...principal, customerId: "gid://shopify/Customer/999" },
      request,
      dependencies(),
    );

    expect(result.status).toBe(409);
  });
});
