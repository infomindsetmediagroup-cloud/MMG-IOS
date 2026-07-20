import { describe, expect, it, vi } from "vitest";
import { handleMMGShopifySubscriptionWebhookRequest } from "../server/shopify/subscription-webhook-http.js";
import type { MMGShopifySubscriptionWebhookHttpDependencies } from "../server/shopify/subscription-webhook-http.js";

const body = JSON.stringify({
  admin_graphql_api_id: "gid://shopify/SubscriptionContract/400",
  admin_graphql_api_customer_id: "gid://shopify/Customer/500",
  admin_graphql_api_origin_order_id: "gid://shopify/Order/600",
  revision_id: "1",
});

const request = (overrides: {
  method?: string;
  hmac?: string;
  shop?: string;
  topic?: string;
  version?: string;
  body?: string;
} = {}): Request =>
  new Request("https://mmg-ios.vercel.app/api/shopify/webhooks/subscriptions", {
    method: overrides.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": overrides.hmac ?? "valid-hmac",
      "X-Shopify-Shop-Domain":
        overrides.shop ?? "mindsetmediagroup.myshopify.com",
      "X-Shopify-Topic": overrides.topic ?? "subscription_contracts/create",
      "X-Shopify-API-Version": overrides.version ?? "2026-07",
      "X-Shopify-Webhook-Id": "webhook-12345678",
      "X-Shopify-Event-Id": "event-12345678",
      "X-Shopify-Triggered-At": "2026-07-20T20:00:00.000Z",
      "X-Shopify-Name": "mmg-subscription-reconciliation",
    },
    body: overrides.method === "GET" ? undefined : overrides.body ?? body,
  });

const dependencies = (): MMGShopifySubscriptionWebhookHttpDependencies => ({
  clientSecret: "client-secret",
  expectedShopDomain: "mindsetmediagroup.myshopify.com",
  expectedApiVersion: "2026-07",
  runtimeMapping: {
    productGid: "gid://shopify/Product/100",
    sellingPlanGid: "gid://shopify/SellingPlan/200",
    variantGids: {
      monthly: "gid://shopify/ProductVariant/301",
      biweekly: "gid://shopify/ProductVariant/302",
      weekly: "gid://shopify/ProductVariant/303",
    },
  },
  verifyHmac: vi.fn().mockReturnValue(true),
  now: vi.fn().mockReturnValue(new Date("2026-07-20T20:00:01.000Z")),
  gateway: {
    loadContractSnapshot: vi.fn().mockResolvedValue({
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
        productId: "gid://shopify/Product/100",
        variantId: "gid://shopify/ProductVariant/301",
        sellingPlanId: "gid://shopify/SellingPlan/200",
        quantity: 1,
      },
    }),
  },
  repository: {
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
  },
});

const responseBody = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

describe("MMG Shopify subscription webhook HTTP handler", () => {
  it("accepts only POST", async () => {
    const response = await handleMMGShopifySubscriptionWebhookRequest(
      request({ method: "GET" }),
      dependencies(),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("verifies HMAC before claiming or parsing the delivery", async () => {
    const deps = dependencies();
    vi.mocked(deps.verifyHmac!).mockReturnValue(false);
    const response = await handleMMGShopifySubscriptionWebhookRequest(
      request({ body: "not-json" }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(deps.repository.claimWebhookDelivery).not.toHaveBeenCalled();
  });

  it("blocks a different shop and mismatched API version", async () => {
    const wrongShop = await handleMMGShopifySubscriptionWebhookRequest(
      request({ shop: "different-store.myshopify.com" }),
      dependencies(),
    );
    expect(wrongShop.status).toBe(403);

    const wrongVersion = await handleMMGShopifySubscriptionWebhookRequest(
      request({ version: "2026-04" }),
      dependencies(),
    );
    expect(wrongVersion.status).toBe(409);
  });

  it("acknowledges a previously processed duplicate without reconciliation", async () => {
    const deps = dependencies();
    vi.mocked(deps.repository.claimWebhookDelivery).mockResolvedValue(
      "duplicate_processed",
    );
    const response = await handleMMGShopifySubscriptionWebhookRequest(
      request(),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      ok: true,
      status: "duplicate_ignored",
    });
    expect(deps.repository.reconcileSubscription).not.toHaveBeenCalled();
  });

  it("reconciles and marks a verified event processed", async () => {
    const deps = dependencies();
    const response = await handleMMGShopifySubscriptionWebhookRequest(
      request(),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      ok: true,
      status: "reconciled",
    });
    expect(deps.repository.markWebhookProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: "webhook-12345678",
        outcome: expect.objectContaining({ cycleCreated: true }),
      }),
    );
  });

  it("acknowledges permanently noncanonical contracts to stop retries", async () => {
    const deps = dependencies();
    vi.mocked(deps.gateway.loadContractSnapshot).mockResolvedValue({
      ...(await deps.gateway.loadContractSnapshot({
        shopDomain: "mindsetmediagroup.myshopify.com",
        contractId: "gid://shopify/SubscriptionContract/400",
        apiVersion: "2026-07",
        topic: "subscription_contracts/create",
        billingOrderId: null,
      }))!,
      canonicalLine: {
        productId: "gid://shopify/Product/999",
        variantId: "gid://shopify/ProductVariant/301",
        sellingPlanId: "gid://shopify/SellingPlan/200",
        quantity: 1,
      },
    });

    const response = await handleMMGShopifySubscriptionWebhookRequest(
      request(),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual(
      expect.objectContaining({ status: "noncanonical_ignored" }),
    );
    expect(deps.repository.markWebhookProcessed).toHaveBeenCalled();
  });

  it("returns 503 and records retryable processing failure", async () => {
    const deps = dependencies();
    vi.mocked(deps.gateway.loadContractSnapshot).mockResolvedValue(null);
    const response = await handleMMGShopifySubscriptionWebhookRequest(
      request(),
      deps,
    );
    expect(response.status).toBe(503);
    expect(deps.repository.markWebhookFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: "webhook-12345678",
        retryable: true,
      }),
    );
  });
});
