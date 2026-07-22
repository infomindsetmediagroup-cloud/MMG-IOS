import test from "node:test";
import assert from "node:assert/strict";
import {
  handleCoverImageProduction,
  handleCoverImageProductionObjectRequest,
} from "../src/kairos-cover-image-production-v1.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, value); }
}

function state() { return { storage: new MemoryStorage() }; }

function project() {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    status: "APPROVED_FOR_SHOPIFY_STAGING",
    metadata: { title: "Representative Guide" },
    sourceAssets: [{
      id: "cover-1",
      role: "COVER_SOURCE",
      filename: "cover.png",
      mimeType: "image/png",
      byteSize: 8,
      sha256: "a".repeat(64),
      storageKey: "publishing:asset:cover-1",
    }],
    artifacts: [],
    governance: { liveShopifyMutationAuthorized: false },
  };
}

function imagesBinding(calls) {
  return {
    async info() { return { width: 1200, height: 1800, format: "image/png", fileSize: 8 }; },
    input() {
      const record = { transform: null, output: null };
      calls.push(record);
      return {
        transform(options) {
          record.transform = options;
          return this;
        },
        output(options) {
          record.output = options;
          return {
            async response() {
              const marker = record.transform.width === 2048 && record.transform.height === 3072 ? "portrait" : "square";
              return new Response(new TextEncoder().encode(`png:${marker}`), { status: 200, headers: { "Content-Type": "image/png" } });
            },
          };
        },
      };
    },
  };
}

async function seed(durable) {
  await durable.storage.put("publishing:project", project());
  await durable.storage.put("publishing:asset:cover-1", new TextEncoder().encode("fake-png"));
}

test("renders exact portrait and square artifacts without crop or redraw", async () => {
  const durable = state();
  await seed(durable);
  const calls = [];
  const env = { IMAGES: imagesBinding(calls), KAIROS_MEDIA_SIGNING_SECRET: "test-signing-secret", MMG_STOREFRONT_ORIGIN: "https://themindsetmediagroup.com" };
  const response = await handleCoverImageProductionObjectRequest(
    durable,
    new Request("https://internal.test/internal/publishing/projects/88888888-8888-4888-8888-888888888888/cover/render", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kairos-Public-Origin": "https://themindsetmediagroup.com" },
      body: JSON.stringify({ confirmation: "APPROVE_NO_CROP_NO_REDRAW_RENDER", background: "#ffffff" }),
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.artifacts.length, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].transform, { width: 2048, height: 3072, fit: "pad", background: "#ffffff" });
  assert.deepEqual(calls[1].transform, { width: 2048, height: 2048, fit: "pad", background: "#ffffff" });
  assert.deepEqual(calls[0].output, { format: "image/png", anim: false });
  assert.equal(payload.safeguards.croppingAllowed, false);
  assert.equal(payload.safeguards.redrawingAllowed, false);
  assert.match(payload.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(payload.artifacts[0].signedStagingUrl, /^https:\/\/themindsetmediagroup\.com\/api\/kairos\/media\//);

  const stored = await durable.storage.get("publishing:project");
  const primary = stored.artifacts.find((artifact) => artifact.kind === "STOREFRONT_PRIMARY_IMAGE");
  const square = stored.artifacts.find((artifact) => artifact.kind === "STOREFRONT_SOCIAL_IMAGE");
  assert.deepEqual({ width: primary.width, height: primary.height }, { width: 2048, height: 3072 });
  assert.deepEqual({ width: square.width, height: square.height }, { width: 2048, height: 2048 });
  assert.equal(primary.transformation.croppingAllowed, false);
  assert.equal(primary.transformation.redrawingAllowed, false);
});

test("requires exact render approval and rejects crop or redraw authorization", async () => {
  const durable = state();
  await seed(durable);
  const env = { IMAGES: imagesBinding([]), KAIROS_MEDIA_SIGNING_SECRET: "test-signing-secret" };

  const missingApproval = await handleCoverImageProductionObjectRequest(
    durable,
    new Request("https://internal.test/internal/publishing/projects/88888888-8888-4888-8888-888888888888/cover/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    env,
  );
  assert.equal(missingApproval.status, 409);

  const violation = await handleCoverImageProductionObjectRequest(
    durable,
    new Request("https://internal.test/internal/publishing/projects/88888888-8888-4888-8888-888888888888/cover/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "APPROVE_NO_CROP_NO_REDRAW_RENDER", croppingAllowed: true }),
    }),
    env,
  );
  const violationPayload = await violation.json();
  assert.equal(violation.status, 409);
  assert.equal(violationPayload.error.code, "cover_policy_violation");
});

test("serves rendered media only through a valid unexpired signed URL", async () => {
  const durable = state();
  await seed(durable);
  const calls = [];
  const secret = "test-signing-secret";
  const render = await handleCoverImageProductionObjectRequest(
    durable,
    new Request("https://internal.test/internal/publishing/projects/88888888-8888-4888-8888-888888888888/cover/render", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kairos-Public-Origin": "https://themindsetmediagroup.com" },
      body: JSON.stringify({ confirmation: "APPROVE_NO_CROP_NO_REDRAW_RENDER" }),
    }),
    { IMAGES: imagesBinding(calls), KAIROS_MEDIA_SIGNING_SECRET: secret },
  );
  const rendered = await render.json();
  const signedUrl = rendered.artifacts[0].signedStagingUrl;

  const namespace = {
    idFromName(name) { return name; },
    get() {
      return {
        fetch(request) { return handleCoverImageProductionObjectRequest(durable, request, {}); },
      };
    },
  };
  const response = await handleCoverImageProduction(new Request(signedUrl), {
    KAIROS_PROJECTS: namespace,
    KAIROS_MEDIA_SIGNING_SECRET: secret,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.match(response.headers.get("X-Kairos-Media-Sha256"), /^[a-f0-9]{64}$/);

  const invalid = new URL(signedUrl);
  invalid.searchParams.set("sig", "invalid");
  const denied = await handleCoverImageProduction(new Request(invalid), {
    KAIROS_PROJECTS: namespace,
    KAIROS_MEDIA_SIGNING_SECRET: secret,
  });
  assert.equal(denied.status, 403);
});
