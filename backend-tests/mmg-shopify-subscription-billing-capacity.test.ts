import { describe, expect, it, vi } from "vitest";
import type { MMGShopifySubscriptionWebhookRepository } from "../server/shopify/subscription-webhook-repository.js";
import { reconcileMMGShopifySubscriptionWebhook } from "../server/shopify/subscription-webhook-service.js";

const repository = (): MMGShopifySubscriptionWebhookRepository => ({
  claimWebhookDelivery: vi.fn().mockResolvedValue("claimed"),
  markWebhookProcessed: vi.fn().mockResolvedValue(undefined),
  markWebhookFailed: vi.fn().mockResolvedValue(undefined),
  reconcileSubscription: vi.fn().mockResolvedValue({
    entitlementId: "entitlement-1",
    cycleId: null,
    cycleCreated: false,
    orderLinkUpdated: false,
    staleIgnored: false,
  }),
});

const runtimeMapping = {
  productGid: "gid://shopify/Product/100",
  sellingPlanGid: "gid://shopify/SellingPlan/200",
  variantGids: {
    monthly: "gid://shopify/ProductVariant/301",
    biweekly: "gid://shopify/ProductVariant/302",
    weekly: "gid://shopify/ProductVariant/303",
  },
} as const;

const gateway = {
  loadContractSnapshot: vi.fn().mockResolvedValue({
    contractId: "gid://shopify/SubscriptionContract/400",
    customerId: "gid://shopify/Customer/500",
    originOrderId: "gid://shopify/Order/600",
    revisionId: "8",
    status: "ACTIVE" as const,
    updatedAt: "2026-07-20T19:59:00.000Z",
    currencyCode: "USD" as const,
    nextBillingDate: "2026-08-20T20:00:00.000Z",
    currentPeriodStart: "2026-07-20T20:00:00.000Z",
    currentPeriodEnd: "2026-08-20T20:00:00.000Z",
    billingPolicy: { interval: "MONTH" as const, intervalCount: 1 as const },
    deliveryPolicy: { interval: "MONTH" as const, intervalCount: 1 as const },
    canonicalLine: {
      productId: "gid://shopify/Product/100",
      variantId: "gid://shopify/ProductVariant/301",
      sellingPlanId: "gid://shopify/SellingPlan/200",
      quantity: 1,
    },
  }),
};

const metadata = (
  topic:
    | "subscription_billing_attempts/success"
    | "subscription_billing_attempts/failure"
    | "subscription_billing_attempts/challenged",
) => ({
  webhookId: `webhook-${topic}-12345678`,
  eventId: null,
  topic,
  shopDomain: "mindsetmediagroup.myshopify.com",
  apiVersion: "2026-07",
  triggeredAt: "2026-07-20T20:00:00.000Z",
  subscriptionName: "mmg-subscription-reconciliation",
});

const payload = (ready: boolean) => ({
  idempotency_key: "billing-attempt-12345678",
  admin_graphql_api_subscription_contract_id:
    "gid://shopify/SubscriptionContract/400",
  admin_graphql_api_order_id: ready ? "gid://shopify/Order/601" : undefined,
  ready,
  error_code: ready ? undefined : "PAYMENT_FAILED",
  error_message: ready ? undefined : "Payment could not be completed.",
});

describe("MMG Shopify billing capacity gate", () => {
  it.each([
    "subscription_billing_attempts/failure",
    "subscription_billing_attempts/challenged",
  ] as const)("does not create period capacity from %s", async (topic) => {
    const repo = repository();
    await reconcileMMGShopifySubscriptionWebhook({
      dependencies: { repository: repo, gateway, runtimeMapping },
      metadata: metadata(topic),
      payload: payload(false),
    });

    expect(repo.reconcileSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({
          currentPeriodStart: null,
          currentPeriodEnd: null,
        }),
      }),
    );
  });

  it("retains authoritative period capacity for a ready success", async () => {
    const repo = repository();
    await reconcileMMGShopifySubscriptionWebhook({
      dependencies: { repository: repo, gateway, runtimeMapping },
      metadata: metadata("subscription_billing_attempts/success"),
      payload: payload(true),
    });

    expect(repo.reconcileSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({
          currentPeriodStart: "2026-07-20T20:00:00.000Z",
          currentPeriodEnd: "2026-08-20T20:00:00.000Z",
        }),
      }),
    );
  });
});
