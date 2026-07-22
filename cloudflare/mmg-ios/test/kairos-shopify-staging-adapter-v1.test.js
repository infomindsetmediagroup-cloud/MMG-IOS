import test from "node:test";
import assert from "node:assert/strict";
import { handleShopifyStagingObjectRequest } from "../src/kairos-shopify-staging-adapter-v1.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, value); }
}

function stages() {
  return ["INTAKE","SOURCE_VALIDATION","MANUSCRIPT_EXTRACTION","METADATA_INFERENCE","EDITORIAL_ANALYSIS","DELIVERABLE_GENERATION","PRODUCT_METADATA_GENERATION","PACKAGE_ASSEMBLY","REVIEW","SHOPIFY_STAGING_HANDOFF"]
    .map((name) => ({ name, status: name === "SHOPIFY_STAGING_HANDOFF" ? "PENDING" : "SUCCEEDED" }));
}

function project(overrides = {}) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    status: "APPROVED_FOR_SHOPIFY_STAGING",
    metadata: { title: "Guide" },
    sourceAssets: [{ id: "cover-1", role: "COVER_SOURCE", filename: "cover.png", sha256: "a".repeat(64), publicStagingUrl: "https://cdn.example/cover.png" }],
    artifacts: [{ id: "meta-1", kind: "PRODUCT_METADATA", filename: "shopify-product-metadata.json", sha256: "b".repeat(64), storageKey: "artifact:meta" }],
    stages: stages(),
    governance: { liveShopifyMutationAuthorized: false },
    run: { status: "REVIEW_REQUIRED" },
    ...overrides,
  };
}

function metadata(overrides = {}) {
  return {
    title: "Representative Guide",
    handle: "representative-guide",
    descriptionHtml: "<p>Guide.</p>",
    vendor: "Mindset Media Group",
    productType: "Digital Product",
    status: "DRAFT",
    tags: ["Digital Product"],
    seoTitle: "Representative Guide",
    metaDescription: "A representative guide.",
    liveMutationAuthorized: false,
    ...overrides,
  };
}

function state() { return { storage: new MemoryStorage() }; }
function env() { return { SHOPIFY_STORE_DOMAIN: "example.myshopify.com", SHOPIFY_ADMIN_ACCESS_TOKEN: "token" }; }

async function seed(durable, sourceProject = project(), sourceMetadata = metadata()) {
  await durable.storage.put("publishing:project", sourceProject);
  await durable.storage.put("artifact:meta", new TextEncoder().encode(JSON.stringify(sourceMetadata)));
}

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

test("creates a DRAFT product and persists staging receipt and rollback", async () => {
  const durable = state();
  await seed(durable);
  const restore = mockFetch(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.query, /productCreate/);
    assert.equal(body.variables.input.status, "DRAFT");
    assert.equal(body.variables.media[0].originalSource, "https://cdn.example/cover.png");
    return new Response(JSON.stringify({ data: { productCreate: { product: { id: "gid://shopify/Product/1", title: "Representative Guide", handle: "representative-guide", status: "DRAFT" }, userErrors: [] } } }), { status: 200 });
  });
  try {
    const response = await handleShopifyStagingObjectRequest(durable, new Request("https://internal.test/internal/publishing/projects/77777777-7777-4777-8777-777777777777/shopify-staging", { method: "POST" }), env());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.project.status, "COMPLETED");
    assert.equal(payload.receipt.status, "DRAFT");
    assert.equal(payload.receipt.publicationMutationExecuted, false);
    assert.equal(payload.rollback.action, "DELETE_CREATED_DRAFT");
    assert.equal(payload.project.stages.at(-1).status, "SUCCEEDED");
  } finally { restore(); }
});

test("updates only an existing DRAFT and captures rollback snapshot", async () => {
  const durable = state();
  const existing = project({ shopifyStaging: { receipt: { productId: "gid://shopify/Product/2" } } });
  await seed(durable, existing);
  let calls = 0;
  const restore = mockFetch(async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    if (calls === 1) {
      assert.match(body.query, /query KairosStagedProduct/);
      return new Response(JSON.stringify({ data: { product: { id: "gid://shopify/Product/2", title: "Old", handle: "old", descriptionHtml: "<p>Old</p>", vendor: "Mindset Media Group", productType: "Digital Product", status: "DRAFT", tags: [], seo: { title: "Old", description: "Old" } } } }), { status: 200 });
    }
    assert.match(body.query, /productUpdate/);
    assert.equal(body.variables.input.status, "DRAFT");
    return new Response(JSON.stringify({ data: { productUpdate: { product: { id: "gid://shopify/Product/2", title: "Representative Guide", handle: "representative-guide", status: "DRAFT" }, userErrors: [] } } }), { status: 200 });
  });
  try {
    const response = await handleShopifyStagingObjectRequest(durable, new Request("https://internal.test/internal/publishing/projects/77777777-7777-4777-8777-777777777777/shopify-staging", { method: "POST" }), env());
    const payload = await response.json();
    assert.equal(payload.receipt.mode, "UPDATE_DRAFT");
    assert.equal(payload.rollback.action, "RESTORE_DRAFT_SNAPSHOT");
    assert.equal(payload.rollback.input.title, "Old");
  } finally { restore(); }
});

test("blocks non-DRAFT metadata before calling Shopify", async () => {
  const durable = state();
  await seed(durable, project(), metadata({ status: "ACTIVE" }));
  const restore = mockFetch(async () => { throw new Error("must not call Shopify"); });
  try {
    await assert.rejects(
      () => handleShopifyStagingObjectRequest(durable, new Request("https://internal.test/internal/publishing/projects/77777777-7777-4777-8777-777777777777/shopify-staging", { method: "POST" }), env()),
      (error) => error.code === "metadata_not_draft",
    );
  } finally { restore(); }
});

test("rolls back a newly created draft with productDelete", async () => {
  const durable = state();
  const completed = project({
    status: "COMPLETED",
    stages: stages().map((stage) => stage.name === "SHOPIFY_STAGING_HANDOFF" ? { ...stage, status: "SUCCEEDED" } : stage),
    shopifyStaging: { rollbackAvailable: true, rollback: { action: "DELETE_CREATED_DRAFT", productId: "gid://shopify/Product/3" }, receipt: { productId: "gid://shopify/Product/3" } },
  });
  await seed(durable, completed);
  const restore = mockFetch(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.query, /productDelete/);
    return new Response(JSON.stringify({ data: { productDelete: { deletedProductId: "gid://shopify/Product/3", userErrors: [] } } }), { status: 200 });
  });
  try {
    const response = await handleShopifyStagingObjectRequest(durable, new Request("https://internal.test/internal/publishing/projects/77777777-7777-4777-8777-777777777777/shopify-staging/rollback", { method: "POST" }), env());
    const payload = await response.json();
    assert.equal(payload.status, "rolled-back");
    assert.equal(payload.project.status, "APPROVED_FOR_SHOPIFY_STAGING");
    assert.equal(payload.project.stages.at(-1).status, "PENDING");
  } finally { restore(); }
});
