import { describe, expect, it } from "vitest";
import { handleKairosCommerceOrchestrator } from "../cloudflare/mmg-ios/src/kairos-commerce-orchestrator-v1.js";

describe("Kairos commerce orchestrator", () => {
  it("reports the governed Publish-Ready vertical slice as ready", async () => {
    const response = await handleKairosCommerceOrchestrator(
      new Request("https://kairos.example.test/api/kairos/readiness"),
      {},
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      status: "ready",
      verticalSlice: "publish-ready-book-build-service",
      capabilities: {
        verifiedShopifyWebhook: true,
        idempotentOrderIngestion: true,
        publishingProjectCreation: true,
        customerPortalProjectCreation: true,
        approvalGates: true,
        automaticLivePublication: false,
      },
    });
  });

  it("rejects internal ingestion when the runtime token is absent", async () => {
    await expect(
      handleKairosCommerceOrchestrator(
        new Request("https://kairos.example.test/api/kairos/orders/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: 1, line_items: [] }),
        }),
        {},
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "kairos_internal_token_missing",
    });
  });

  it("ignores unsupported products without creating projects", async () => {
    const response = await handleKairosCommerceOrchestrator(
      new Request("https://kairos.example.test/api/kairos/orders/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          id: 123,
          name: "#123",
          line_items: [{ title: "Unrelated Product", sku: "OTHER-1", quantity: 1 }],
        }),
      }),
      { KAIROS_INTERNAL_TOKEN: "test-token" },
    );

    expect(response?.status).toBe(202);
    await expect(response?.json()).resolves.toMatchObject({
      status: "ignored",
    });
  });
});
