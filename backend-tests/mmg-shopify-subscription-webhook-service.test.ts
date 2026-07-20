import { describe, expect, it, vi } from "vitest";
import type { MMGShopifySubscriptionWebhookRepository } from "../server/shopify/subscription-webhook-repository.js";
import {
  MMGShopifySubscriptionReconciliationError,
  reconcileMMGShopifySubscriptionWebhook,
  type MMGShopifySubscriptionContractGateway,
} from "../server/shopify/subscription-webhook-service.js";
import type {
  MMGShopifySubscriptionContractSnapshot,
  MMGShopifySubscriptionRuntimeMapping,
  MMGShopifyWebhookMetadata,
} from "../server/shopify/subscription-webhook-reconciliation.js";

const runtimeMapping: MMGShopifySubscriptionRuntimeMapping = {
  productGid: "gid://shopify/Product/100",
  sellingPlanGid: "gid://shopify/SellingPlan/200",
  variantGids: {
    monthly: "gid://shopify/ProductVariant/301",
    biweekly: "gid://shopify/ProductVariant/302",
    weekly: "gid://shopify/ProductVariant/303",
  },
};

const metadata: MMGShopifyWebhookMetadata = {
  webhookId: "webhook-12345678",
  eventId: "event-12345678",
  topic: "subscription_contracts/create",
  shopDomain: "mindsetmediagroup.myshopify.com",
  apiVersion: "2026-07",
  triggeredAt: "2026-07-20T20:00:00.000Z",
  subscriptionName: "mmg-subscription-reconciliation",
};

const snapshot = (
  overrides: Partial<MMGShopifySubscriptionContractSnapshot> = {},
): MMGShopifySubscriptionContractSnapshot => ({
  contractId: "gid://shopify/SubscriptionContract/400",
  customerId: "gid://shopify/Customer/500",
  originOrderId: "gid://shopify/Order/600",
  revisionId: "7",
  status: "ACTIVE",
  updatedAt: "2026-07-20T19:59:00.000Z",
  currencyCode: "USD",
  nextBillingDate: "2026-08-20T20:00:00.000Z",
  currentPeriodStart: "2026-07-20T20:00:00.000Z",
  currentPeriodEnd: "2026-08-20T20:00:00.000Z",
  billingPolicy: { interval: "MONTH", intervalCount: 1 },
  deliveryPolicy: { interval: "MONTH", intervalCount: 1 },
  canonicalLine: {
    productId: runtimeMapping.productGid,
    variantId: runtimeMapping.variantGids.monthly,
    sellingPlanId: runtimeMapping.sellingPlanGid,
    quantity: 1,
  },
  ...overrides,
});

const repository = (): MMGShopifySubscriptionWebhookRepository => ({
  claimWebhookDelivery: vi.fn().mockResolvedValue("claimed"),
  markWebhookProcessed: vi.fn().mockResolvedValue(undefined),
  markWebhookFailed: vi.fn().mockResolvedValue(undefined),
  reconcileSubscription: vi.fn().mockResolvedValue({
    entitlementId: "entitlement-1",
    cycleId: "cycle-1",
    cycleCreated: true,
    orderLinkUpdated: true,
    staleIgnored: false,
  }),
});

const gateway = (
  value: MMGShopifySubscriptionContractSnapshot | null = snapshot(),
): MMGShopifySubscriptionContractGateway => ({
  loadContractSnapshot: vi.fn().mockResolvedValue(value),
});

describe("MMG Shopify subscription webhook service", () => {
  it("reloads the contract and reconciles a validated canonical command", async () => {
    const repo = repository();
    const contractGateway = gateway();
    const result = await reconcileMMGShopifySubscriptionWebhook({
      dependencies: {
        repository: repo,
        gateway: contractGateway,
        runtimeMapping,
      },
      metadata,
      payload: {
        admin_graphql_api_id: "gid://shopify/SubscriptionContract/400",
        admin_graphql_api_customer_id: "gid://shopify/Customer/500",
        admin_graphql_api_origin_order_id: "gid://shopify/Order/600",
        revision_id: "7",
      },
    });

    expect(contractGateway.loadContractSnapshot).toHaveBeenCalledWith({
      shopDomain: metadata.shopDomain,
      contractId: "gid://shopify/SubscriptionContract/400",
      apiVersion: "2026-07",
      topic: "subscription_contracts/create",
      billingOrderId: null,
    });
    expect(repo.reconcileSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        planCode: "monthly",
        entitlementStatus: "active",
      }),
    );
    expect(result.cycleCreated).toBe(true);
  });

  it("treats delayed Shopify contract propagation as retryable", async () => {
    await expect(
      reconcileMMGShopifySubscriptionWebhook({
        dependencies: {
          repository: repository(),
          gateway: gateway(null),
          runtimeMapping,
        },
        metadata,
        payload: {
          admin_graphql_api_id: "gid://shopify/SubscriptionContract/400",
        },
      }),
    ).rejects.toMatchObject({
      code: "MMG_SHOPIFY_SUBSCRIPTION_CONTRACT_NOT_AVAILABLE",
      retryable: true,
    } satisfies Partial<MMGShopifySubscriptionReconciliationError>);
  });

  it("rejects a payload customer mismatch before persistence", async () => {
    const repo = repository();
    await expect(
      reconcileMMGShopifySubscriptionWebhook({
        dependencies: {
          repository: repo,
          gateway: gateway(),
          runtimeMapping,
        },
        metadata,
        payload: {
          admin_graphql_api_id: "gid://shopify/SubscriptionContract/400",
          admin_graphql_api_customer_id: "gid://shopify/Customer/999",
        },
      }),
    ).rejects.toMatchObject({
      code: "MMG_SHOPIFY_PAYLOAD_CUSTOMER_MISMATCH",
      retryable: true,
    });
    expect(repo.reconcileSubscription).not.toHaveBeenCalled();
  });

  it("passes a billing order ID into the authoritative reload", async () => {
    const contractGateway = gateway();
    await reconcileMMGShopifySubscriptionWebhook({
      dependencies: {
        repository: repository(),
        gateway: contractGateway,
        runtimeMapping,
      },
      metadata: {
        ...metadata,
        topic: "subscription_billing_attempts/success",
      },
      payload: {
        idempotency_key: "billing-attempt-12345678",
        admin_graphql_api_subscription_contract_id:
          "gid://shopify/SubscriptionContract/400",
        admin_graphql_api_order_id: "gid://shopify/Order/601",
        ready: true,
      },
    });

    expect(contractGateway.loadContractSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ billingOrderId: "gid://shopify/Order/601" }),
    );
  });

  it("marks canonical identity mismatches as nonretryable", async () => {
    await expect(
      reconcileMMGShopifySubscriptionWebhook({
        dependencies: {
          repository: repository(),
          gateway: gateway(
            snapshot({
              canonicalLine: {
                ...snapshot().canonicalLine,
                productId: "gid://shopify/Product/999",
              },
            }),
          ),
          runtimeMapping,
        },
        metadata,
        payload: {
          admin_graphql_api_id: "gid://shopify/SubscriptionContract/400",
        },
      }),
    ).rejects.toMatchObject({
      code: "MMG_SHOPIFY_NONCANONICAL_SUBSCRIPTION_PRODUCT",
      retryable: false,
    });
  });
});
