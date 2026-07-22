import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import {
  approvePackage,
  assemblePackage,
  confirmRights,
  handlePublishingPackageControlObjectRequest,
  validatePackageInputs,
} from "../src/kairos-package-assembly-v1.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) {
    const value = this.values.get(key);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    return value === undefined ? undefined : structuredClone(value);
  }
  async put(key, value) {
    this.values.set(key, value instanceof Uint8Array ? new Uint8Array(value) : structuredClone(value));
  }
}

function state() { return { storage: new MemoryStorage() }; }

const PROJECT_ID = "77777777-7777-4777-8777-777777777777";
const SHA = "a".repeat(64);
const REQUIRED = [
  ["NORMALIZED_MANUSCRIPT", "normalized.md", "text/markdown", "# Guide\n\nContent"],
  ["METADATA_INFERENCE", "metadata.json", "application/json", "{}"],
  ["QA_REPORT", "qa.json", "application/json", "{\"qaPassed\":true}"],
  ["EDITABLE_MANUSCRIPT", "editable.md", "text/markdown", "# Guide"],
  ["FINAL_MANUSCRIPT", "final.html", "text/html", "<h1>Guide</h1>"],
  ["CUSTOMER_README", "README.txt", "text/plain", "Instructions"],
  ["RIGHTS_DECLARATION", "rights-declaration.json", "application/json", "{}"],
  ["STOREFRONT_PRODUCT_IMAGE", "storefront-image-contract.json", "application/json", "{}"],
  ["PRODUCT_METADATA", "shopify-product-metadata.json", "application/json", JSON.stringify({
    title: "Guide",
    handle: "guide",
    status: "DRAFT",
    liveMutationAuthorized: false,
  })],
];

async function preparedProject(durable) {
  const artifacts = [];
  for (let index = 0; index < REQUIRED.length; index += 1) {
    const [kind, filename, mimeType, content] = REQUIRED[index];
    const bytes = new TextEncoder().encode(content);
    const storageKey = `artifact:${index}`;
    await durable.storage.put(storageKey, bytes);
    artifacts.push({
      id: `artifact-${index}`,
      projectId: PROJECT_ID,
      kind,
      filename,
      mimeType,
      byteSize: bytes.byteLength,
      sha256: SHA,
      storageKey,
      createdAt: "2026-07-22T00:00:00.000Z",
    });
  }

  const project = {
    id: PROJECT_ID,
    status: "RUNNING",
    metadata: { title: "Guide" },
    sourceAssets: [{
      id: "source-1",
      role: "COVER_SOURCE",
      filename: "cover.png",
      mimeType: "image/png",
      byteSize: 3,
      sha256: SHA,
      storageKey: "source:cover",
      immutable: true,
      createdAt: "2026-07-22T00:00:00.000Z",
    }],
    artifacts,
    stages: [
      "INTAKE", "SOURCE_VALIDATION", "MANUSCRIPT_EXTRACTION", "METADATA_INFERENCE",
      "EDITORIAL_ANALYSIS", "DELIVERABLE_GENERATION", "PRODUCT_METADATA_GENERATION",
      "PACKAGE_ASSEMBLY", "REVIEW", "SHOPIFY_STAGING_HANDOFF",
    ].map((name) => ({ name, status: name === "PRODUCT_METADATA_GENERATION" ? "RUNNING" : "SUCCEEDED" })),
    run: { id: "run-1", status: "RUNNING", currentStage: "PRODUCT_METADATA_GENERATION" },
    governance: { liveShopifyMutationAuthorized: false, shopifyTargetStatus: "DRAFT" },
    updatedAt: "2026-07-22T00:00:00.000Z",
  };
  await durable.storage.put("publishing:project", project);
  return project;
}

async function json(response) { return response.json(); }

test("requires all governed package inputs", async () => {
  const result = validatePackageInputs({ artifacts: [], governance: { liveShopifyMutationAuthorized: false, shopifyTargetStatus: "DRAFT" } });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /missing required artifact PRODUCT_METADATA/);
});

test("requires explicit owner rights confirmation", async () => {
  const durable = state();
  const project = await preparedProject(durable);
  const response = await assemblePackage(durable, project);
  assert.equal(response.status, 409);
  assert.equal((await json(response)).error.code, "rights_confirmation_required");
});

test("confirms rights without authorizing live publication", async () => {
  const durable = state();
  const project = await preparedProject(durable);
  const response = await confirmRights(durable, project, new Request("https://internal/rights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signerName: "Michael King",
      signerRole: "Owner",
      confirmations: { manuscriptRights: true, coverRights: true, thirdPartyRights: true },
    }),
  }));
  const payload = await json(response);
  assert.equal(response.status, 200);
  assert.equal(payload.rights.declarationStatus, "OWNER_CONFIRMED");
  assert.equal(payload.rights.livePublicationAuthorized, false);
  assert.equal(payload.rights.shopifyStagingAuthorized, false);
});

test("assembles a ZIP, final manifest, and review state", async () => {
  const durable = state();
  let project = await preparedProject(durable);
  await confirmRights(durable, project, new Request("https://internal/rights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signerName: "Michael King",
      confirmations: { manuscriptRights: true, coverRights: true, thirdPartyRights: true },
    }),
  }));
  project = await durable.storage.get("publishing:project");

  const response = await assemblePackage(durable, project);
  const payload = await json(response);
  assert.equal(response.status, 201);
  assert.equal(payload.project.status, "REVIEW_REQUIRED");
  assert.equal(payload.project.stages.find((stage) => stage.name === "PACKAGE_ASSEMBLY").status, "SUCCEEDED");
  assert.equal(payload.project.stages.find((stage) => stage.name === "REVIEW").status, "RUNNING");
  assert.equal(payload.manifest.liveShopifyMutationAuthorized, false);
  assert.equal(payload.manifest.shopifyTargetStatus, "DRAFT");

  const stored = await durable.storage.get("publishing:project");
  const zipArtifact = stored.artifacts.find((artifact) => artifact.kind === "ZIP_ARCHIVE");
  const zipBytes = await durable.storage.get(zipArtifact.storageKey);
  const entries = unzipSync(zipBytes);
  assert.ok(entries["package-manifest.json"]);
  assert.ok(entries["deliverables/shopify-product-metadata.json"]);
  assert.ok(entries["deliverables/final.html"]);
});

test("serves checksum headers and approves only for Shopify staging", async () => {
  const durable = state();
  let project = await preparedProject(durable);
  await confirmRights(durable, project, new Request("https://internal/rights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signerName: "Michael King",
      confirmations: { manuscriptRights: true, coverRights: true, thirdPartyRights: true },
    }),
  }));
  project = await durable.storage.get("publishing:project");
  await assemblePackage(durable, project);
  project = await durable.storage.get("publishing:project");

  const download = await handlePublishingPackageControlObjectRequest(
    durable,
    new Request(`https://internal/internal/publishing/projects/${PROJECT_ID}/package/download`),
  );
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("Content-Type"), "application/zip");
  assert.match(download.headers.get("X-Artifact-SHA256"), /^[a-f0-9]{64}$/);

  const approval = await approvePackage(durable, project, new Request("https://internal/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewerName: "Michael King", confirmation: "APPROVE_FOR_SHOPIFY_STAGING" }),
  }));
  const payload = await json(approval);
  assert.equal(approval.status, 200);
  assert.equal(payload.project.status, "APPROVED_FOR_SHOPIFY_STAGING");
  assert.equal(payload.approval.scope, "SHOPIFY_STAGING_ONLY");
  assert.equal(payload.approval.livePublicationAuthorized, false);
  assert.equal(payload.project.stages.find((stage) => stage.name === "SHOPIFY_STAGING_HANDOFF").status, "PENDING");
});
