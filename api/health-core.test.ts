import { describe, expect, it } from "vitest";
import { buildHealthResponse } from "./health-core.js";

describe("buildHealthResponse", () => {
  const now = new Date("2026-07-10T17:00:00.000Z");

  it("reports ready only when every required runtime value is configured", () => {
    const response = buildHealthResponse(
      {
        OPENAI_API_KEY: "provider-key",
        OPENAI_MODEL: "gpt-model",
      KAIROS_RUNTIME_TOKEN: "gateway-token",
        SHOPIFY_STORE_DOMAIN: "mindset-media-group.myshopify.com",
        SHOPIFY_ADMIN_ACCESS_TOKEN: "shopify-token",
      },
      now,
    );

    expect(response).toEqual({
      service: "kairos-runtime",
      status: "ready",
      configured: {
        providerCredential: true,
        providerModel: true,
        gatewayCredential: true,
      },
      capabilities: {
        shopifyHomepageAudit: true,
      },
      timestamp: "2026-07-10T17:00:00.000Z",
    });
  });

  it("reports degraded without exposing secret values", () => {
    const response = buildHealthResponse(
      {
        OPENAI_API_KEY: "   ",
        OPENAI_MODEL: "gpt-model",
      },
      now,
    );

    expect(response.status).toBe("degraded");
    expect(response.configured).toEqual({
      providerCredential: false,
      providerModel: true,
      gatewayCredential: false,
    });
    expect(response.capabilities.shopifyHomepageAudit).toBe(false);
    expect(JSON.stringify(response)).not.toContain("provider-key");
    expect(JSON.stringify(response)).not.toContain("gateway-token");
  });
});
