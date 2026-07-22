import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { handlePublishingPackageObjectRequest } from "../src/kairos-publishing-package-v1.js";
import { handleDeliverableRunObjectRequest } from "../src/kairos-deliverable-runner-v1.js";
import { renderCoverDerivatives } from "../src/kairos-cover-image-production-v1.js";
import { confirmRights, approvePackage } from "../src/kairos-package-assembly-v1.js";
import { handlePackageImageIntegrationObjectRequest } from "../src/kairos-package-image-integration-v1.js";
import { handleShopifyStagingObjectRequest } from "../src/kairos-shopify-staging-adapter-v1.js";

const PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const BASE = `https://internal.test/internal/publishing/projects/${PROJECT_ID}`;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
  async transaction(callback) { return callback(this); }
}

function state() { return { storage: new MemoryStorage() }; }
function jsonRequest(path, value) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}
function binaryRequest(path, bytes, mimeType, filename) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": mimeType, "X-Filename": filename },
    body: bytes,
  });
}
function manuscriptFixture() {
  const sections = [];
  sections.push("# Build With Clarity");
  sections.push("## Introduction");
  sections.push("This guide helps independent creators organize ideas, build durable systems, and move from intention to consistent execution. The method favors clear objectives, visible progress, and practical decisions.");
  for (let index = 1; index <= 18; index += 1) {
    sections.push(`## Chapter ${index}: Practical Momentum`);
    for (let paragraph = 1; paragraph <= 5; paragraph += 1) {
      sections.push(`Chapter ${index} section ${paragraph} explains how creators can define a useful objective, identify the smallest responsible action, document the result, and improve the process. The reader is encouraged to protect source material, verify assumptions, preserve ownership records, and make commercial decisions through deliberate review. Each completed action becomes evidence of progress and a reusable part of the operating system.`);
    }
    sections.push("- Define the objective clearly\n- Complete the smallest useful action\n- Review the evidence\n- Preserve the reusable result");
  }
  sections.push("## Conclusion");
  sections.push("Sustainable progress comes from clear objectives, governed execution, careful review, and reusable systems. Continue building one verified asset at a time.");
  return sections.join("\n\n");
}
function imagesBinding() {
  return {
    async info() { return { width: 1600, height: 2400, format: "image/png" }; },
    input() {
      return {
        transform(options) {
          assert.equal(options.fit, "pad");
          return {
            output(output) {
              assert.equal(output.format, "image/png");
              return {
                response() {
                  const marker = `${options.width}x${options.height}:png`;
                  return new Response(new TextEncoder().encode(marker), { status: 200, headers: { "Content-Type": "image/png" } });
                },
              };
            },
          };
        },
      };
    },
  };
}

async function readProject(durable) { return durable.storage.get("publishing:project"); }

function mockShopify() {
  const original = globalThis.fetch;
  let stagedProductId = null;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (/productCreate/.test(body.query)) {
      assert.equal(body.variables.input.status, "DRAFT");
      assert.equal(body.variables.media.length, 1);
      assert.match(body.variables.media[0].originalSource, /\/api\/kairos\/media\//);
      stagedProductId = "gid://shopify/Product/999";
      return new Response(JSON.stringify({ data: { productCreate: { product: { id: stagedProductId, title: body.variables.input.title, handle: body.variables.input.handle, status: "DRAFT" }, userErrors: [] } } }), { status: 200 });
    }
    if (/productDelete/.test(body.query)) {
      assert.equal(body.variables.input.id, stagedProductId);
      return new Response(JSON.stringify({ data: { productDelete: { deletedProductId: stagedProductId, userErrors: [] } } }), { status: 200 });
    }
    throw new Error("Unexpected Shopify operation");
  };
  return () => { globalThis.fetch = original; };
}

test("cover and manuscript produce a complete image-inclusive package, Shopify DRAFT, and rollback receipt", async () => {
  const durable = state();
  const env = {
    IMAGES: imagesBinding(),
    KAIROS_MEDIA_SIGNING_SECRET: "fixture-signing-secret-32-bytes-minimum",
    MMG_STOREFRONT_ORIGIN: "https://kairos.example",
    SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "fixture-token",
    SHOPIFY_ADMIN_API_VERSION: "2026-07",
  };

  let response = await handlePublishingPackageObjectRequest(durable, jsonRequest("", {
    workingTitle: "Build With Clarity",
    author: "Michael King",
    intendedAudience: "independent creators and entrepreneurs",
    productType: "GUIDE",
    notes: "Operational end-to-end fixture",
  }));
  assert.equal(response.status, 201);

  response = await handlePublishingPackageObjectRequest(durable, binaryRequest("/assets?role=COVER_SOURCE", new TextEncoder().encode("fixture-cover"), "image/png", "cover.png"));
  assert.equal(response.status, 201);
  response = await handlePublishingPackageObjectRequest(durable, binaryRequest("/assets?role=MANUSCRIPT_SOURCE", new TextEncoder().encode(manuscriptFixture()), "text/markdown", "manuscript.md"));
  assert.equal(response.status, 201);
  assert.equal((await readProject(durable)).status, "READY");

  response = await handleDeliverableRunObjectRequest(durable, new Request(`${BASE}/run`, { method: "POST" }), env);
  assert.equal(response.status, 202);
  let project = await readProject(durable);
  assert.equal(project.status, "RUNNING");
  assert.equal(project.run.currentStage, "PRODUCT_METADATA_GENERATION");
  assert.ok(project.artifacts.some((artifact) => artifact.kind === "FINAL_MANUSCRIPT"));
  assert.ok(project.artifacts.some((artifact) => artifact.kind === "PRODUCT_METADATA"));

  response = await renderCoverDerivatives(durable, jsonRequest("/cover/render", {
    confirmation: "APPROVE_NO_CROP_NO_REDRAW_RENDER",
    croppingAllowed: false,
    redrawingAllowed: false,
    background: "#ffffff",
  }), env);
  assert.equal(response.status, 200);
  project = await readProject(durable);
  const primary = project.artifacts.find((artifact) => artifact.kind === "STOREFRONT_PRIMARY_IMAGE");
  const social = project.artifacts.find((artifact) => artifact.kind === "STOREFRONT_SOCIAL_IMAGE");
  assert.deepEqual([primary.width, primary.height], [2048, 3072]);
  assert.deepEqual([social.width, social.height], [2048, 2048]);

  response = await confirmRights(durable, project, jsonRequest("/rights/confirm", {
    signerName: "Michael King",
    signerRole: "Owner",
    confirmations: { manuscriptRights: true, coverRights: true, thirdPartyRights: true },
  }));
  assert.equal(response.status, 200);

  response = await handlePackageImageIntegrationObjectRequest(durable, new Request(`${BASE}/package/assemble`, { method: "POST" }));
  assert.equal(response.status, 201);
  project = await readProject(durable);
  assert.equal(project.package.renderedImagesIncluded, true);
  assert.equal(project.package.renderedImageArtifactIds.length, 2);

  const zipArtifact = project.artifacts.find((artifact) => artifact.kind === "ZIP_ARCHIVE");
  const zipBytes = await durable.storage.get(zipArtifact.storageKey);
  const files = unzipSync(zipBytes);
  assert.ok(Object.keys(files).some((name) => name.startsWith("images/") && name.endsWith("product-2048x3072.png")));
  assert.ok(Object.keys(files).some((name) => name.startsWith("images/") && name.endsWith("social-2048x2048.png")));
  assert.ok(files["package-manifest.json"]);

  response = await approvePackage(durable, project, jsonRequest("/review/approve", {
    reviewerName: "Michael King",
    confirmation: "APPROVE_FOR_SHOPIFY_STAGING",
  }));
  assert.equal(response.status, 200);
  project = await readProject(durable);
  assert.equal(project.status, "APPROVED_FOR_SHOPIFY_STAGING");

  const restoreFetch = mockShopify();
  try {
    response = await handleShopifyStagingObjectRequest(durable, new Request(`${BASE}/shopify-staging`, { method: "POST" }), env);
    assert.equal(response.status, 200);
    project = await readProject(durable);
    assert.equal(project.status, "COMPLETED");
    assert.equal(project.shopifyStaging.receipt.status, "DRAFT");
    assert.equal(project.shopifyStaging.receipt.renderedPrimaryImageDimensions.width, 2048);
    assert.equal(project.shopifyStaging.receipt.publicationMutationExecuted, false);

    response = await handleShopifyStagingObjectRequest(durable, new Request(`${BASE}/shopify-staging/rollback`, { method: "POST" }), env);
    assert.equal(response.status, 200);
    project = await readProject(durable);
    assert.equal(project.status, "APPROVED_FOR_SHOPIFY_STAGING");
    assert.equal(project.stages.at(-1).status, "PENDING");
    assert.equal(project.shopifyStaging.rollbackAvailable, false);
  } finally {
    restoreFetch();
  }
});
