import { describe, expect, it, vi } from "vitest";
import {
  MMGShopifyAdminSubscriptionContractGateway,
  MMG_SUBSCRIPTION_CONTRACT_QUERY,
} from "../server/shopify/shopify-subscription-contract-gateway.js";

const graphqlContract = {
  id: "gid://shopify/SubscriptionContract/400",
  status: "ACTIVE",
  revisionId: "7",
  updatedAt: "2026-07-20T19:59:00.000Z",
  nextBillingDate: "2026-08-20T20:00:00.000Z",
  currencyCode: "USD",
  customer: { id: "gid://shopify/Customer/500" },
  originOrder: {
    id: "gid://shopify/Order/600",
    createdAt: "2026-07-20T20:00:00.000Z",
  },
  billingPolicy: { interval: "MONTH", intervalCount: 1 },
  deliveryPolicy: { interval: "MONTH", intervalCount: 1 },
  lines: {
    nodes: [
      {
        productId: "gid://shopify/Product/100",
        variantId: "gid://shopify/ProductVariant/301",
        sellingPlanId: "gid://shopify/SellingPlan/200",
        quantity: 1,
        requiresShipping: false,
      },
    ],
  },
  orders: {
    nodes: [
      {
        id: "gid://shopify/Order/601",
        createdAt: "2026-07-20T20:00:00.000Z",
      },
    ],
  },
};

describe("MMG Shopify Admin subscription contract gateway", () => {
  it("queries the authoritative contract with a server-side Admin token", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { subscriptionContract: graphqlContract } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const gateway = new MMGShopifyAdminSubscriptionContractGateway({
      accessTokenForShop: vi.fn().mockResolvedValue("server-token"),
      fetcher,
    });

    const result = await gateway.loadContractSnapshot({
      shopDomain: "mindsetmediagroup.myshopify.com",
      contractId: "gid://shopify/SubscriptionContract/400",
      apiVersion: "2026-07",
      topic: "subscription_billing_attempts/success",
      billingOrderId: "gid://shopify/Order/601",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://mindsetmediagroup.myshopify.com/admin/api/2026-07/graphql.json",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Shopify-Access-Token": "server-token",
        }),
      }),
    );
    const call = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(call.body))).toEqual({
      query: MMG_SUBSCRIPTION_CONTRACT_QUERY,
      variables: { contractId: "gid://shopify/SubscriptionContract/400" },
    });
    expect(result).toEqual({
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
        productId: "gid://shopify/Product/100",
        variantId: "gid://shopify/ProductVariant/301",
        sellingPlanId: "gid://shopify/SellingPlan/200",
        quantity: 1,
      },
    });
  });

  it("requires a server-side token and exactly one complete nonshipping line", async () => {
    const noToken = new MMGShopifyAdminSubscriptionContractGateway({
      accessTokenForShop: vi.fn().mockResolvedValue(null),
      fetcher: vi.fn(),
    });
    await expect(
      noToken.loadContractSnapshot({
        shopDomain: "mindsetmediagroup.myshopify.com",
        contractId: "gid://shopify/SubscriptionContract/400",
        apiVersion: "2026-07",
        topic: "subscription_contracts/create",
        billingOrderId: null,
      }),
    ).rejects.toThrow("MMG_SHOPIFY_ADMIN_TOKEN_NOT_AVAILABLE");

    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            subscriptionContract: {
              ...graphqlContract,
              lines: { nodes: [graphqlContract.lines.nodes[0], graphqlContract.lines.nodes[0]] },
            },
          },
        }),
        { status: 200 },
      ),
    );
    const invalid = new MMGShopifyAdminSubscriptionContractGateway({
      accessTokenForShop: vi.fn().mockResolvedValue("server-token"),
      fetcher,
    });
    await expect(
      invalid.loadContractSnapshot({
        shopDomain: "mindsetmediagroup.myshopify.com",
        contractId: "gid://shopify/SubscriptionContract/400",
        apiVersion: "2026-07",
        topic: "subscription_contracts/create",
        billingOrderId: null,
      }),
    ).rejects.toThrow("MMG_SHOPIFY_CONTRACT_LINE_COUNT_MISMATCH");
  });

  it("returns null while Shopify has not propagated the contract", async () => {
    const gateway = new MMGShopifyAdminSubscriptionContractGateway({
      accessTokenForShop: vi.fn().mockResolvedValue("server-token"),
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { subscriptionContract: null } }),
          { status: 200 },
        ),
      ),
    });
    await expect(
      gateway.loadContractSnapshot({
        shopDomain: "mindsetmediagroup.myshopify.com",
        contractId: "gid://shopify/SubscriptionContract/400",
        apiVersion: "2026-07",
        topic: "subscription_contracts/create",
        billingOrderId: null,
      }),
    ).resolves.toBeNull();
  });
});
