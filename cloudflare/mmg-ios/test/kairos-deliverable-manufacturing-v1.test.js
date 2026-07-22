import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShopifyMetadata,
  buildStorefrontImageContract,
  manufactureDeliverables,
  validateManufacturedArtifacts,
} from "../src/kairos-deliverable-manufacturing-v1.js";

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

function project() {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    metadata: {
      title: "The Creator Operating Guide",
      subtitle: "A practical system for focused execution",
      author: "Michael King",
      intendedAudience: "independent creators and entrepreneurs",
      productType: "GUIDE",
      summary: "A structured guide for turning clear objectives into repeatable execution.",
      keywords: ["creator education", "execution", "business systems"],
    },
    sourceAssets: [
      {
        id: "cover-source",
        role: "COVER_SOURCE",
        filename: "creator-guide.png",
        mimeType: "image/png",
        sha256: "a".repeat(64),
      },
    ],
    artifacts: [
      {
        id: "normalized",
        kind: "NORMALIZED_MANUSCRIPT",
        storageKey: "artifact:normalized",
      },
      {
        id: "metadata",
        kind: "METADATA_INFERENCE",
        storageKey: "artifact:metadata",
      },
      {
        id: "qa",
        kind: "QA_REPORT",
        storageKey: "artifact:qa",
      },
    ],
  };
}

async function seed(durable, sourceProject = project()) {
  await durable.storage.put("artifact:normalized", new TextEncoder().encode("# Introduction\n\nBuild a clear operating system.\n\n## Next Steps\n\nApply the system consistently."));
  await durable.storage.put("artifact:metadata", new TextEncoder().encode(JSON.stringify({ metadata: sourceProject.metadata })));
  await durable.storage.put("artifact:qa", new TextEncoder().encode(JSON.stringify({ score: 92, blockers: [], requiresHumanReview: false })));
}

test("builds Shopify metadata as a governed draft", () => {
  const metadata = buildShopifyMetadata({
    title: "The Creator Operating Guide",
    subtitle: "A practical system",
    author: "Michael King",
    metadata: project().metadata,
    handle: "the-creator-operating-guide",
  });

  assert.equal(metadata.status, "DRAFT");
  assert.equal(metadata.liveMutationAuthorized, false);
  assert.equal(metadata.requiresShipping, false);
  assert.match(metadata.handle, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(metadata.descriptionHtml, /Knowledge grows when it’s shared/);
  assert.ok(metadata.metaDescription.length <= 155);
});

test("creates approved portrait and square image production contracts without cropping", () => {
  const sourceProject = project();
  const contract = buildStorefrontImageContract({
    project: sourceProject,
    coverAsset: sourceProject.sourceAssets[0],
    title: sourceProject.metadata.title,
    generatedAt: "2026-07-22T02:00:00.000Z",
  });

  assert.equal(contract.transformationAuthorized, false);
  assert.equal(contract.reviewRequiredBeforeTransformation, true);
  assert.deepEqual(contract.requiredOutputs.map((output) => [output.width, output.height]), [[2048, 3072], [2048, 2048]]);
  assert.equal(contract.requiredOutputs.every((output) => output.croppingAllowed === false), true);
  assert.equal(contract.requiredOutputs.every((output) => output.redrawingAllowed === false), true);
});

test("manufactures all governed deliverables and stores immutable bytes", async () => {
  const durable = state();
  const sourceProject = project();
  await seed(durable, sourceProject);

  const result = await manufactureDeliverables(durable, sourceProject);
  const kinds = new Set(result.artifacts.map((artifact) => artifact.kind));

  for (const kind of [
    "EDITABLE_MANUSCRIPT",
    "FINAL_MANUSCRIPT",
    "CUSTOMER_README",
    "RIGHTS_DECLARATION",
    "STOREFRONT_PRODUCT_IMAGE",
    "PRODUCT_METADATA",
  ]) assert.equal(kinds.has(kind), true);

  assert.equal(result.qa.ok, true);
  assert.equal(result.shopifyMetadata.status, "DRAFT");
  assert.equal(result.rightsDeclaration.declarationStatus, "REQUIRES_OWNER_CONFIRMATION");
  assert.equal(result.rightsDeclaration.livePublicationAuthorized, false);

  for (const artifact of result.artifacts) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(artifact.byteSize > 0);
    const stored = await durable.storage.get(artifact.storageKey);
    assert.ok(stored instanceof Uint8Array);
    assert.equal(stored.byteLength, artifact.byteSize);
  }
});

test("artifact QA blocks active Shopify status and unauthorized cover transformation", () => {
  const artifacts = [
    "EDITABLE_MANUSCRIPT",
    "FINAL_MANUSCRIPT",
    "CUSTOMER_README",
    "RIGHTS_DECLARATION",
    "STOREFRONT_PRODUCT_IMAGE",
    "PRODUCT_METADATA",
  ].map((kind) => ({ kind, sha256: "b".repeat(64), byteSize: 10 }));

  const result = validateManufacturedArtifacts({
    artifacts,
    shopifyMetadata: {
      status: "ACTIVE",
      liveMutationAuthorized: true,
      handle: "Bad Handle",
    },
    storefrontImageContract: { transformationAuthorized: true },
    rightsDeclaration: { livePublicationAuthorized: true },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("Shopify status must remain DRAFT"));
  assert.ok(result.errors.includes("live Shopify mutation must remain unauthorized"));
  assert.ok(result.errors.includes("cover transformation must remain approval-gated"));
  assert.ok(result.errors.includes("rights declaration cannot authorize live publication"));
});

test("manufacturing blocks when editorial clearance is missing", async () => {
  const durable = state();
  const sourceProject = project();
  await seed(durable, sourceProject);
  await durable.storage.put("artifact:qa", new TextEncoder().encode(JSON.stringify({
    score: 61,
    blockers: ["Manuscript is incomplete."],
    requiresHumanReview: true,
  })));

  await assert.rejects(
    () => manufactureDeliverables(durable, sourceProject),
    (error) => error.code === "editorial_clearance_missing" && error.requiresHumanReview === true,
  );
});
