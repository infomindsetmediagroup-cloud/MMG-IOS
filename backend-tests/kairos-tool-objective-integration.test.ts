// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleToolAwareKairosObjective } from "../cloudflare/mmg-ios/src/kairos-tool-objective-integration-v1.js";
import fs from "node:fs";

function request(body) {
  return new Request("https://kairos.test/api/kairos", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer service-secret" },
    body: JSON.stringify(body),
  });
}

function approvalEnv() {
  const map = new Map();
  const storage = { async get(key){ return map.get(key); }, async put(key, value){ map.set(key, value); } };
  return {
    KAIROS_API_ACCESS_TOKEN: "service-secret",
    KAIROS_PROJECTS: {
      idFromName: () => "registry",
      get: () => ({ fetch: async (internalRequest) => {
        const { handleKairosToolApprovalObjectRequest } = await import("../cloudflare/mmg-ios/src/kairos-tool-approval-v1.js");
        return handleKairosToolApprovalObjectRequest({ storage }, internalRequest);
      } }),
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Kairos tool-aware objective integration", () => {
  it("injects and returns verified read-only tool evidence", async () => {
    const response = await handleToolAwareKairosObjective(request({
      objective: "Summarize the MMG governance foundation.",
      toolRequest: { toolId: "knowledge.search", arguments: { query: "governance approval production" } },
    }), {}, async (enrichedRequest) => {
      const body = await enrichedRequest.json();
      expect(body.context).toContain("VERIFIED GOVERNED TOOL EVIDENCE");
      return new Response(JSON.stringify({ success: true, status: "completed", message: "Grounded response", actions: [], requiresApproval: false }), { headers: { "content-type": "application/json" } });
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.toolEvidence[0].verified).toBe(true);
    expect(body.toolEvidence[0].toolId).toBe("knowledge.search");
  });

  it("returns verified Shopify product evidence through the main objective contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      expect(init.headers["X-Shopify-Access-Token"]).toBe("shopify-secret");
      const outbound = JSON.parse(init.body);
      expect(outbound.variables.id).toBe("gid://shopify/Product/123");
      expect(outbound.query).toContain("query KairosProductRead");
      return new Response(JSON.stringify({
        data: {
          product: {
            id: "gid://shopify/Product/123",
            title: "Canonical Service Product",
            handle: "canonical-service-product",
            status: "ACTIVE",
            descriptionHtml: "<p>Governed product.</p>",
            vendor: "Mindset Media Group",
            productType: "Service",
            tags: ["canonical"],
            createdAt: "2026-07-01T00:00:00Z",
            updatedAt: "2026-07-25T00:00:00Z",
            publishedAt: "2026-07-25T00:00:00Z",
            onlineStoreUrl: "https://example.com/products/canonical-service-product",
            seo: { title: "Canonical Service Product", description: "Governed service product." },
            featuredMedia: null,
            variants: { nodes: [{ id: "gid://shopify/ProductVariant/456", title: "Default", sku: "CSP-001", barcode: null, price: "100.00", compareAtPrice: null, availableForSale: true, selectedOptions: [] }] },
          },
        },
        extensions: { cost: { requestedQueryCost: 12, actualQueryCost: 8, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1992, restoreRate: 100 } } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const env = {
      SHOPIFY_SHOP_DOMAIN: "mindset-media-group.myshopify.com",
      SHOPIFY_ADMIN_ACCESS_TOKEN: "shopify-secret",
      SHOPIFY_ADMIN_SCOPES: "read_products",
      SHOPIFY_ADMIN_API_VERSION: "2026-07",
    };
    const response = await handleToolAwareKairosObjective(request({
      objective: "Review the canonical Shopify service product.",
      toolRequest: { toolId: "shopify.product.read", arguments: { productId: "gid://shopify/Product/123" } },
    }), env, async (enrichedRequest) => {
      const body = await enrichedRequest.json();
      expect(body.context).toContain("Canonical Service Product");
      expect(body.context).toContain("VERIFIED GOVERNED TOOL EVIDENCE");
      return new Response(JSON.stringify({ success: true, status: "completed", message: "Verified Shopify product reviewed.", actions: [], requiresApproval: false }), { headers: { "content-type": "application/json" } });
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.toolEvidence[0].toolId).toBe("shopify.product.read");
    expect(body.toolEvidence[0].verified).toBe(true);
    expect(body.toolEvidence[0].result.product.title).toBe("Canonical Service Product");
    expect(body.toolEvidence[0].result.product.variants[0].price).toBe("100.00");
  });

  it("creates a reviewable mutation proposal without enabling continuation", async () => {
    const response = await handleToolAwareKairosObjective(request({
      objective: "Update the Shopify title.",
      toolRequest: { toolId: "shopify.product.update", arguments: { productId: "gid://shopify/Product/1", changes: { title: "Approved title" } } },
    }), approvalEnv(), async () => { throw new Error("provider must not run for mutation proposals"); });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.requiresApproval).toBe(true);
    expect(body.actions[0].executorAvailable).toBe(false);
    expect(body.actions[0].confirmationRequired).toMatch(/^APPROVE kap_/);
  });

  it("renders verified evidence and disabled approval continuation in the dashboard", () => {
    const source = fs.readFileSync("web/kairos-dashboard/scripts/objective-controller-v2.js", "utf8");
    expect(source).toContain("Verified tool evidence");
    expect(source).toContain("Continuation is disabled because no production executor is connected");
    expect(source).toContain('disabled aria-disabled="true"');
  });
});