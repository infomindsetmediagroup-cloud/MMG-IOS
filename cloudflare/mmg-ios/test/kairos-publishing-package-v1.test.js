import test from "node:test";
import assert from "node:assert/strict";
import {
  handlePublishingPackage,
  handlePublishingPackageObjectRequest,
} from "../src/kairos-publishing-package-v1.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return structuredClone(this.values.get(key));
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }

  async transaction(run) {
    return run(this);
  }
}

function state() {
  return { storage: new MemoryStorage() };
}

async function body(response) {
  return response.json();
}

test("creates a durable publishing project with governance locked", async () => {
  const durableState = state();
  const response = await handlePublishingPackageObjectRequest(
    durableState,
    new Request("https://internal.test/internal/publishing/projects/11111111-1111-4111-8111-111111111111", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingTitle: "  First Guide  ", author: " Michael King " }),
    }),
  );

  assert.equal(response.status, 201);
  const payload = await body(response);
  assert.equal(payload.project.metadata.workingTitle, "First Guide");
  assert.equal(payload.project.governance.liveShopifyMutationAuthorized, false);
  assert.equal(payload.project.governance.shopifyTargetStatus, "DRAFT");
  assert.equal(payload.project.stages.length, 10);
});

test("stores immutable cover and manuscript bytes and starts the orchestrator", async () => {
  const durableState = state();
  const projectId = "22222222-2222-4222-8222-222222222222";

  await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}`, {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    }),
  );

  const coverResponse = await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}/assets?role=COVER_SOURCE`, {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
      headers: { "Content-Type": "image/png", "X-Filename": "cover.png" },
    }),
  );
  assert.equal(coverResponse.status, 201);

  const manuscriptResponse = await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}/assets?role=MANUSCRIPT_SOURCE`, {
      method: "POST",
      body: new TextEncoder().encode("manuscript"),
      headers: { "Content-Type": "text/plain", "X-Filename": "manuscript.txt" },
    }),
  );
  assert.equal(manuscriptResponse.status, 201);
  const manuscriptPayload = await body(manuscriptResponse);
  assert.equal(manuscriptPayload.project.status, "READY");
  assert.match(manuscriptPayload.asset.sha256, /^[a-f0-9]{64}$/);

  const runResponse = await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}/run`, { method: "POST" }),
  );
  assert.equal(runResponse.status, 202);
  const runPayload = await body(runResponse);
  assert.equal(runPayload.project.status, "RUNNING");
  assert.equal(runPayload.run.currentStage, "MANUSCRIPT_EXTRACTION");
  assert.equal(runPayload.project.stages[0].status, "SUCCEEDED");
  assert.equal(runPayload.project.stages[1].status, "SUCCEEDED");
  assert.equal(runPayload.project.stages[2].status, "RUNNING");
  assert.equal(runPayload.safeguards.liveShopifyMutation, "blocked");

  const statusResponse = await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}/status`),
  );
  assert.equal(statusResponse.status, 200);
  assert.equal((await body(statusResponse)).project.run.id, runPayload.run.id);

  const packageResponse = await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}/package`),
  );
  assert.equal(packageResponse.status, 404);
  assert.equal((await body(packageResponse)).error.code, "package_not_ready");
});

test("rejects unsupported assets and incomplete runs", async () => {
  const durableState = state();
  const projectId = "33333333-3333-4333-8333-333333333333";

  await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}`, {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    }),
  );

  const badAsset = await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}/assets?role=COVER_SOURCE`, {
      method: "POST",
      body: "<svg></svg>",
      headers: { "Content-Type": "image/svg+xml" },
    }),
  );
  assert.equal(badAsset.status, 415);

  const run = await handlePublishingPackageObjectRequest(
    durableState,
    new Request(`https://internal.test/internal/publishing/projects/${projectId}/run`, { method: "POST" }),
  );
  assert.equal(run.status, 409);
  assert.equal((await body(run)).error.code, "sources_incomplete");
});

test("enforces bearer authentication at the public route boundary", async () => {
  const response = await handlePublishingPackage(
    new Request("https://kairos.test/api/kairos/projects", { method: "POST" }),
    { KAIROS_API_TOKEN: "secret" },
  );

  assert.equal(response.status, 401);
  assert.equal((await body(response)).error.code, "unauthorized");
});
