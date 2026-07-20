import { describe, expect, it, vi } from "vitest";
import { handleMMGThankYouFirstTitleHandoffRequest } from "../server/checkout/thank-you-handoff-http.js";
import type { MMGThankYouHandoffHttpDependencies } from "../server/checkout/thank-you-handoff-http.js";

const endpoint = "https://kairos.example/api/checkout/thank-you/subscription-handoff";

const dependencies = (): MMGThankYouHandoffHttpDependencies => ({
  authenticateSessionToken: vi.fn().mockResolvedValue({
    shopDomain: "mindsetmediagroup.myshopify.com",
    customerId: "gid://shopify/Customer/42",
    tokenId: "session-token-jti-123456",
  }),
  repository: {
    recordVerifiedSubscriptionOrder: vi.fn().mockResolvedValue(undefined),
    loadEntitlementForOrder: vi.fn().mockResolvedValue(null),
  },
  orderGateway: {
    loadVerifiedOrder: vi.fn().mockResolvedValue({
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
    }),
  },
  canonicalProductId: "gid://shopify/Product/100",
  canonicalProductHandle: "mmg-knowledge-subscription",
  links: {
    selectionUrl: "/pages/knowledge-library?mode=subscription-selection&handoff=first-package",
    customerPortalUrl: "/pages/customer-portal",
    myLibraryUrl: "/pages/customer-portal#my-library",
    customerServiceUrl: "/pages/customer-service",
    membershipUrl: "/products/mmg-knowledge-subscription",
  },
  now: () => new Date("2026-07-20T21:01:00.000Z"),
});

const request = (input?: {
  method?: string;
  authorization?: string | null;
  body?: string;
}): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  const authorization =
    input && Object.prototype.hasOwnProperty.call(input, "authorization")
      ? input.authorization
      : "Bearer signed-shopify-session-token";
  if (authorization) headers.set("Authorization", authorization);

  return new Request(endpoint, {
    method: input?.method ?? "POST",
    headers,
    body:
      (input?.method ?? "POST") === "POST"
        ? input?.body ??
          JSON.stringify({
            orderId: "gid://shopify/Order/123456789",
            checkoutToken: "checkout-token-123456789",
          })
        : undefined,
  });
};

describe("MMG thank-you handoff HTTP endpoint", () => {
  it("supports CORS preflight for checkout extension origins", async () => {
    const response = await handleMMGThankYouFirstTitleHandoffRequest(
      request({ method: "OPTIONS" }),
      dependencies(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
  });

  it("rejects unsupported methods", async () => {
    const response = await handleMMGThankYouFirstTitleHandoffRequest(
      request({ method: "GET" }),
      dependencies(),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("requires a bearer session token", async () => {
    const deps = dependencies();
    const response = await handleMMGThankYouFirstTitleHandoffRequest(
      request({ authorization: null }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(deps.authenticateSessionToken).not.toHaveBeenCalled();
  });

  it("rejects an unverified session token", async () => {
    const deps = dependencies();
    vi.mocked(deps.authenticateSessionToken).mockResolvedValue(null);

    const response = await handleMMGThankYouFirstTitleHandoffRequest(request(), deps);

    expect(response.status).toBe(401);
  });

  it("rejects malformed or oversized JSON", async () => {
    const malformed = await handleMMGThankYouFirstTitleHandoffRequest(
      request({ body: "{" }),
      dependencies(),
    );
    expect(malformed.status).toBe(400);

    const oversized = await handleMMGThankYouFirstTitleHandoffRequest(
      request({ body: JSON.stringify({ orderId: "x".repeat(5000), checkoutToken: "token" }) }),
      dependencies(),
    );
    expect(oversized.status).toBe(400);
  });

  it("returns a private non-cacheable customer-safe handoff", async () => {
    const response = await handleMMGThankYouFirstTitleHandoffRequest(
      request(),
      dependencies(),
    );
    const body = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(body.ok).toBe(true);
    expect(serialized).not.toContain("provider_contract_id");
    expect(serialized).not.toContain("checkout-token-123456789");
    expect(serialized).not.toContain("gid://shopify/Customer/42");
  });
});
