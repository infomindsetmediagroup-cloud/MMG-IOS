import test from "node:test";
import assert from "node:assert/strict";
import { handleCanonicalPublishingRequest } from "../src/kairos-canonical-publishing-router-v1.js";
import { CANONICAL_CONFIRMATIONS } from "../src/kairos-canonical-publishing-contract-v1.js";

const PROJECT_ID = "project-12345678";
const ORIGIN = "https://kairos.example";

function productionReadyRecord(overrides = {}) {
  return {
    status: "production-ready",
    metadata: {
      title: "Creator Systems",
      author: "Michael King",
      publisher: "Michael King",
    },
    vault: {
      integrity: { passed: true },
      assets: [
        { filename: "customer-spec-sheet.pdf" },
        { filename: "kdp-interior-6x9.pdf" },
        { filename: "digital-asset-edition-v2.pdf" },
        { filename: "cover-portrait-2048x3072.png" },
        { filename: "cover-thumbnail-2048x2048.png" },
        { filename: "README.txt" },
        { filename: "complete-production-package.zip" },
      ],
    },
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

test("status exposes the canonical package URL and sanitizes legacy identity", async () => {
  const calls = [];
  const response = await handleCanonicalPublishingRequest(
    new Request(`${ORIGIN}/api/kairos/publishing/manuscripts/${PROJECT_ID}/status`),
    {},
    {},
    {
      manuscriptPipeline: async (request) => {
        calls.push(new URL(request.url).pathname);
        return jsonResponse(productionReadyRecord());
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls, [
    `/api/production-registry/manuscripts/${PROJECT_ID}/auto-pipeline`,
  ]);
  assert.equal(body.canonicalPackage.ready, true);
  assert.equal(
    body.canonicalPackage.downloadURL,
    `/api/kairos/publishing/manuscripts/${PROJECT_ID}/package`,
  );
  assert.equal(body.metadata.author, "Mindset Media Group™");
  assert.equal(JSON.stringify(body).includes("Michael King"), false);
});

test("package route preserves verified bytes and uses the exact canonical filename", async () => {
  const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const calls = [];
  const response = await handleCanonicalPublishingRequest(
    new Request(`${ORIGIN}/api/kairos/publishing/manuscripts/${PROJECT_ID}/package`),
    {},
    {},
    {
      manuscriptPipeline: async (request) => {
        const path = new URL(request.url).pathname;
        calls.push({ method: request.method, path });
        if (path.endsWith("/auto-pipeline")) {
          return jsonResponse(productionReadyRecord());
        }
        if (path.endsWith(`/admin-asset-vault/projects/${PROJECT_ID}/package`)) {
          return new Response(zipBytes, {
            status: 200,
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition":
                'attachment; filename="complete-production-package.zip"',
            },
          });
        }
        throw new Error(`Unexpected path: ${path}`);
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/zip");
  assert.equal(
    response.headers.get("Content-Disposition"),
    'attachment; filename="Creator-Systems_Digital-Asset-Edition-V2_Customer-Package.zip"',
  );
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    zipBytes,
  );
  assert.deepEqual(calls, [
    {
      method: "GET",
      path: `/api/production-registry/manuscripts/${PROJECT_ID}/auto-pipeline`,
    },
    {
      method: "GET",
      path: `/api/admin-asset-vault/projects/${PROJECT_ID}/package`,
    },
  ]);
});

test("Shopify draft route blocks execution without the exact confirmation", async () => {
  const calls = [];
  const response = await handleCanonicalPublishingRequest(
    new Request(
      `${ORIGIN}/api/kairos/publishing/manuscripts/${PROJECT_ID}/shopify-draft`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "CREATE DRAFT" }),
      },
    ),
    {},
    {},
    {
      manuscriptPipeline: async (request) => {
        calls.push(new URL(request.url).pathname);
        return jsonResponse(productionReadyRecord());
      },
    },
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "SHOPIFY_DRAFT_CONFIRMATION_REQUIRED");
  assert.deepEqual(calls, [
    `/api/production-registry/manuscripts/${PROJECT_ID}/auto-pipeline`,
  ]);
});

test("Shopify draft route delegates only after package verification and exact approval", async () => {
  const calls = [];
  const response = await handleCanonicalPublishingRequest(
    new Request(
      `${ORIGIN}/api/kairos/publishing/manuscripts/${PROJECT_ID}/shopify-draft`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: CANONICAL_CONFIRMATIONS.shopifyDraft,
        }),
      },
    ),
    {},
    {},
    {
      manuscriptPipeline: async (request) => {
        const path = new URL(request.url).pathname;
        calls.push({
          method: request.method,
          path,
          body: request.method === "POST" ? await request.clone().json() : null,
        });
        if (request.method === "GET") return jsonResponse(productionReadyRecord());
        return jsonResponse({
          ...productionReadyRecord(),
          shopify: { status: "draft-created" },
        });
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.shopify.status, "draft-created");
  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].path,
    `/api/production-registry/manuscripts/${PROJECT_ID}/auto-pipeline/shopify-draft`,
  );
  assert.equal(
    calls[1].body.confirmation,
    CANONICAL_CONFIRMATIONS.shopifyDraft,
  );
});
