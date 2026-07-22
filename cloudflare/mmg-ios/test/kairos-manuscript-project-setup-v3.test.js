import assert from "node:assert/strict";
import test from "node:test";
import { handleManuscriptProjectSetupObjectRequest } from "../src/kairos-manuscript-project-setup-v1.js";
import { handleProductionRegistry } from "../src/kairos-production-registry-v1.js";

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
  }

  async get(key) {
    if (Array.isArray(key)) {
      return new Map(key.filter((item) => this.values.has(item)).map((item) => [item, this.values.get(item)]));
    }
    return this.values.get(key);
  }

  async put(key, value) {
    if (typeof key === "object" && key !== null && value === undefined) {
      for (const [entryKey, entryValue] of Object.entries(key)) this.values.set(entryKey, entryValue);
      return;
    }
    this.values.set(key, value);
  }

  async delete(key) {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const item of key) deleted += this.values.delete(item) ? 1 : 0;
      return deleted;
    }
    return this.values.delete(key);
  }

  async transaction(callback) {
    return callback(this);
  }
}

function stateFor(projectId) {
  return {
    storage: new MemoryStorage({
      [`manuscript:${projectId}:metadata`]: {
        title: "Recovered Manuscript",
        storedAt: "2026-07-22T12:00:00.000Z",
      },
      "production-registry": {},
    }),
  };
}

function pngBytes() {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
}

test("cover upload and metadata assignment complete as separate resumable operations", async () => {
  const projectId = "manuscript-studio-12345678";
  const operationId = "mobile-setup-operation-1";
  const state = stateFor(projectId);

  const coverResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "X-Filename": "customer-cover.png",
        "X-Kairos-Operation-Id": operationId,
      },
      body: pngBytes(),
    }),
  );
  assert.equal(coverResponse.status, 201);
  const cover = await coverResponse.json();
  assert.equal(cover.status, "stored");
  assert.equal(cover.cover.contentType, "image/png");
  assert.equal(cover.cover.operationId, operationId);

  const payload = {
    authorName: "Michael King",
    publicationTitle: "Recovered Manuscript",
    service: "complete-publishing-package",
    edition: "multi-format",
    trimSize: "6x9",
    isbnStatus: "not-decided",
    notes: "Mobile end-to-end setup recovery.",
  };

  const setupRequest = () => new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kairos-Operation-Id": operationId,
      "X-Kairos-Idempotency-Key": operationId,
    },
    body: JSON.stringify(payload),
  });

  const setupResponse = await handleManuscriptProjectSetupObjectRequest(state, setupRequest());
  assert.equal(setupResponse.status, 201);
  const setup = await setupResponse.json();
  assert.equal(setup.status, "assigned-to-production");
  assert.equal(setup.setup.coverStatus, "customer-supplied-cover-stored");
  assert.equal(setup.setup.operationId, operationId);
  assert.equal(setup.setup.externalInferenceAPI, false);

  const replayResponse = await handleManuscriptProjectSetupObjectRequest(state, setupRequest());
  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.headers.get("X-Kairos-Idempotent-Replay"), "true");
  const replay = await replayResponse.json();
  assert.equal(replay.setup.updatedAt, setup.setup.updatedAt);

  const statusResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`),
  );
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.status, "ready");
  assert.equal(status.setup.status, "assigned-to-production");

  const registry = await state.storage.get("production-registry");
  assert.equal(registry[projectId].projectSetup, true);
  assert.equal(registry[projectId].coverStored, true);
  assert.equal(registry[projectId].activeWorkspace, "manuscript-studio");
  assert.equal("shopify" in registry[projectId], false);
});

test("production registry buffers a streamed mobile upload before Durable Object forwarding", async () => {
  const projectId = "manuscript-studio-87654321";
  const expected = pngBytes();
  let observed = null;

  const stub = {
    async fetch(request) {
      observed = {
        url: request.url,
        method: request.method,
        contentType: request.headers.get("Content-Type"),
        forwarding: request.headers.get("X-Kairos-Registry-Forwarding"),
        body: new Uint8Array(await request.arrayBuffer()),
      };
      return Response.json({ status: "forwarded" });
    },
  };

  const env = {
    KAIROS_PROJECTS: {
      idFromName(name) {
        return name;
      },
      get() {
        return stub;
      },
    },
  };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(expected);
      controller.close();
    },
  });

  const response = await handleProductionRegistry(
    new Request(`https://mmg.example/api/production-registry/manuscripts/${projectId}/setup/cover`, {
      method: "PUT",
      headers: { "Content-Type": "image/png", "X-Filename": "mobile-cover.png" },
      body: stream,
      duplex: "half",
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(observed.url, `https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`);
  assert.equal(observed.method, "PUT");
  assert.equal(observed.contentType, "image/png");
  assert.match(observed.forwarding, /^kairos-production-registry-/);
  assert.deepEqual(observed.body, expected);
});
