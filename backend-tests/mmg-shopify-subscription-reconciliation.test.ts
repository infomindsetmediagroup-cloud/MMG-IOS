import { describe, expect, it } from "vitest";
import {
  MMG_SHOPIFY_SUBSCRIPTION_WEBHOOK_TOPICS,
  buildMMGShopifySubscriptionReconciliationCommand,
  mapMMGShopifyContractStatus,
  validateMMGShopifySubscriptionContract,
  type MMGShopifySubscriptionContractSnapshot,
  type MMGShopifySubscriptionRuntimeMapping,
  type MMGShopifyWebhookMetadata,
} from "../server/shopify/subscription-webhook-reconciliation.js";

const mapping: MMGShopifySubscriptionRuntimeMapping = {
  productGid: "gid://shopify/Product/100",
  sellingPlanGid: "gid://shopify/SellingPlan/200",
  variantGids: {
    monthly: "gid://shopify/ProductVariant/301",
    biweekly: "gid://shopify/ProductVariant/302",
    weekly: "gid://shopify/ProductVariant/303",
  },
};

const metadata = (
  topic: MMGShopifyWebhookMetadata["topic"] = "subscription_contracts/create",
): MMGShopifyWebhookMetadata => ({
  webhookId: "webhook-12345678",
  eventId: "event-12345678",
  topic,
  shopDomain: "mindsetmediagroup.myshopify.com",
  apiVersion: "2026-07",
  triggeredAt: "2026-07-20T20:00:00.000Z",
  subscriptionName: "mmg-subscription-reconciliation",
});

const contract = (
  overrides: Partial<MMGShopifySubscriptionContractSnapshot> = {},
): MMGShopifySubscriptionContractSnapshot => ({
  contractId: "gid://shopify/SubscriptionContract/400",
  customerId: "gid://shopify/Customer/500",
  originOrderId: "gid://shopify/Order/600",
  revisionId: "1",
  status: "ACTIVE",
  updatedAt: "2026-07-20T19:59:00.000Z",
  currencyCode: "USD",
  nextBillingDate: "2026-08-20T20:00:00.000Z",
  currentPeriodStart: "2026-07-20T20:00:00.000Z",
  currentPeriodEnd: "2026-08-20T20:00:00.000Z",
  billingPolicy: { interval: "MONTH", intervalCount: 1 },
  deliveryPolicy: { interval: "MONTH", intervalCount: 1 },
  canonicalLine: {
    productId: mapping.productGid,
    variantId: mapping.variantGids.monthly,
    sellingPlanId: mapping.sellingPlanGid,
    quantity: 1,
  },
  ...overrides,
});

describe("MMG Shopify subscription reconciliation domain", () => {
  it("locks the exact five subscription webhook topics", () => {
    expect(MMG_SHOPIFY_SUBSCRIPTION_WEBHOOK_TOPICS).toEqual([
      "subscription_contracts/create",
      "subscription_contracts/update",
      "subscription_billing_attempts/success",
      "subscription_billing_attempts/failure",
      "subscription_billing_attempts/challenged",
    ]);
  });

  it("maps every Shopify contract status without collapsing failed billing", () => {
    expect(mapMMGShopifyContractStatus("ACTIVE")).toBe("active");
    expect(mapMMGShopifyContractStatus("PAUSED")).toBe("paused");
    expect(mapMMGShopifyContractStatus("FAILED")).toBe("failed");
    expect(mapMMGShopifyContractStatus("CANCELLED")).toBe("canceled");
    expect(mapMMGShopifyContractStatus("EXPIRED")).toBe("expired");
  });

  it.each([
    ["monthly", mapping.variantGids.monthly],
    ["biweekly", mapping.variantGids.biweekly],
    ["weekly", mapping.variantGids.weekly],
  ] as const)("maps the %s plan only from the provisioned variant GID", (planCode, variantId) => {
    expect(
      validateMMGShopifySubscriptionContract({
        contract: contract({ canonicalLine: { ...contract().canonicalLine, variantId } }),
        mapping,
        expectedShopDomain: "mindsetmediagroup.myshopify.com",
      }),
    ).toBe(planCode);
  });

  it("rejects a noncanonical product or selling plan", () => {
    expect(() =>
      validateMMGShopifySubscriptionContract({
        contract: contract({
          canonicalLine: {
            ...contract().canonicalLine,
            productId: "gid://shopify/Product/999",
          },
        }),
        mapping,
        expectedShopDomain: "mindsetmediagroup.myshopify.com",
      }),
    ).toThrow("MMG_SHOPIFY_NONCANONICAL_SUBSCRIPTION_PRODUCT");

    expect(() =>
      validateMMGShopifySubscriptionContract({
        contract: contract({
          canonicalLine: {
            ...contract().canonicalLine,
            sellingPlanId: "gid://shopify/SellingPlan/999",
          },
        }),
        mapping,
        expectedShopDomain: "mindsetmediagroup.myshopify.com",
      }),
    ).toThrow("MMG_SHOPIFY_NONCANONICAL_SELLING_PLAN");
  });

  it("rejects nonmonthly policy, non-USD currency, and quantity drift", () => {
    expect(() =>
      validateMMGShopifySubscriptionContract({
        contract: contract({
          billingPolicy: { interval: "MONTH", intervalCount: 2 as 1 },
        }),
        mapping,
        expectedShopDomain: "mindsetmediagroup.myshopify.com",
      }),
    ).toThrow("MMG_SHOPIFY_SUBSCRIPTION_POLICY_MISMATCH");

    expect(() =>
      validateMMGShopifySubscriptionContract({
        contract: contract({ currencyCode: "EUR" as "USD" }),
        mapping,
        expectedShopDomain: "mindsetmediagroup.myshopify.com",
      }),
    ).toThrow("MMG_SHOPIFY_SUBSCRIPTION_CURRENCY_MISMATCH");

    expect(() =>
      validateMMGShopifySubscriptionContract({
        contract: contract({
          canonicalLine: { ...contract().canonicalLine, quantity: 2 },
        }),
        mapping,
        expectedShopDomain: "mindsetmediagroup.myshopify.com",
      }),
    ).toThrow("MMG_SHOPIFY_SUBSCRIPTION_QUANTITY_MISMATCH");
  });

  it("builds an idempotent successful billing-attempt command", () => {
    const result = buildMMGShopifySubscriptionReconciliationCommand({
      metadata: metadata("subscription_billing_attempts/success"),
      payload: {
        idempotency_key: "billing-attempt-12345678",
        admin_graphql_api_subscription_contract_id:
          "gid://shopify/SubscriptionContract/400",
        admin_graphql_api_order_id: "gid://shopify/Order/601",
        ready: true,
      },
      contract: contract(),
      mapping,
    });

    expect(result.planCode).toBe("monthly");
    expect(result.entitlementStatus).toBe("active");
    expect(result.billingAttempt).toEqual({
      idempotencyKey: "billing-attempt-12345678",
      state: "succeeded",
      orderId: "gid://shopify/Order/601",
      ready: true,
      errorCode: null,
      errorMessage: null,
    });
  });

  it("requires the webhook contract identity to match the authoritative snapshot", () => {
    expect(() =>
      buildMMGShopifySubscriptionReconciliationCommand({
        metadata: metadata(),
        payload: {
          admin_graphql_api_id: "gid://shopify/SubscriptionContract/999",
        },
        contract: contract(),
        mapping,
      }),
    ).toThrow("MMG_SHOPIFY_WEBHOOK_CONTRACT_MISMATCH");
  });
});
