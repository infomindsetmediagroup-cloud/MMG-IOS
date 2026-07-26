// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleKairosToolApprovalAPI, handleKairosToolApprovalObjectRequest } from "../cloudflare/mmg-ios/src/kairos-tool-approval-v1.js";

function storage() {
  const map = new Map();
  return { async get(key){ return map.get(key); }, async put(key, value){ map.set(key, value); }, map };
}

function env(state) {
  const stub = { fetch: (request) => handleKairosToolApprovalObjectRequest(state, request) };
  return {
    KAIROS_API_ACCESS_TOKEN: "service-secret",
    KAIROS_PROJECTS: { idFromName: () => "registry", get: () => stub },
    SHOPIFY_SHOP_DOMAIN: "example.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shopify-secret",
    SHOPIFY_ADMIN_SCOPES: "read_products,write_products,write_publications",
    SHOPIFY_ADMIN_API_VERSION: "2026-07",
  };
}

function apiRequest(path, body) {
  return new Request(`https://kairos.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer service-secret" },
    body: JSON.stringify(body),
  });
}

function productPayload({ title = "Before", descriptionHtml = "<p>Before</p>", status = "DRAFT", seoTitle = "Before SEO", seoDescription = "Before description", updatedAt = "2026-07-25T20:00:00Z" } = {}) {
  return {
    data: {
      product: {
        id: "gid://shopify/Product/1",
        title,
        handle: "sample-product",
        status,
        descriptionHtml,
        vendor: "MMG",
        productType: "Digital",
        tags: [],
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt,
        publishedAt: null,
        onlineStoreUrl: null,
        seo: { title: seoTitle, description: seoDescription },
        featuredMedia: null,
        variants: { nodes: [] },
      },
    },
  };
}

async function propose(runtimeEnv) {
  const response = await handleKairosToolApprovalAPI(apiRequest("/api/kairos/tools/propose", {
    toolId: "shopify.product.update",
    arguments: { productId: "gid://shopify/Product/1", changes: { title: "After" } },
  }), runtimeEnv);
  return response.json();
}

afterEach(() => vi.restoreAllMocks());

describe("Shopify production readiness", () => {
  it("keeps approval pending when the pre-mutation snapshot fails", async () => {
    const state = { storage: storage() };
    const runtimeEnv = env(state);
    const proposal = await propose(runtimeEnv);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "read unavailable" }] }), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await handleKairosToolApprovalAPI(apiRequest("/api/kairos/tools/continue", {
      approvalId: proposal.approvalId,
      confirmation: `APPROVE ${proposal.approvalId}`,
    }), runtimeEnv, async () => ({ mutated: true }));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("PRE_MUTATION_SNAPSHOT_FAILED");
    const record = state.storage.map.get(`kairos-tool-approval:${proposal.approvalId}`);
    expect(record.status).toBe("pending");
    expect(record.usedAt).toBeNull();
  });

  it("refuses to consume a product-update approval without a before snapshot", async () => {
    const state = { storage: storage() };
    const runtimeEnv = env(state);
    const proposal = await propose(runtimeEnv);
    const internal = await handleKairosToolApprovalObjectRequest(state, new Request("https://kairos.internal/registry/kairos-tools/approval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "consume", identity: "service-token", approvalId: proposal.approvalId, confirmation: `APPROVE ${proposal.approvalId}` }),
    }));
    expect(internal.status).toBe(409);
    expect((await internal.json()).error.code).toBe("PRE_MUTATION_SNAPSHOT_REQUIRED");
  });

  it("persists before/after snapshots, verification, and rollback planning", async () => {
    const state = { storage: storage() };
    const runtimeEnv = env(state);
    const proposal = await propose(runtimeEnv);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(productPayload()), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(productPayload({ title: "After", updatedAt: "2026-07-25T20:01:00Z" })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleKairosToolApprovalAPI(apiRequest("/api/kairos/tools/continue", {
      approvalId: proposal.approvalId,
      confirmation: `APPROVE ${proposal.approvalId}`,
    }), runtimeEnv, async () => ({ verified: true, mutated: true, product: { id: "gid://shopify/Product/1", title: "After" } }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verification.verified).toBe(true);
    expect(body.verification.changedFields).toEqual(["title"]);
    expect(body.verification.rollbackPlan.requiresNewApproval).toBe(true);
    expect(body.verification.rollbackPlan.automatic).toBe(false);

    const record = state.storage.map.get(`kairos-tool-approval:${proposal.approvalId}`);
    expect(record.status).toBe("completed");
    expect(record.preMutationSnapshot.phase).toBe("before");
    expect(record.postMutationSnapshot.phase).toBe("after");
    expect(record.verification.verified).toBe(true);
    const audit = state.storage.map.get("kairos-tool-approval:audit");
    expect(audit.map((item) => item.event)).toEqual(expect.arrayContaining(["pre_snapshot_captured", "post_snapshot_captured", "verification_passed"]));
  });
});
