import assert from "node:assert/strict";
import test from "node:test";

import {
  handleDedicatedManuscriptSource,
  KairosManuscriptSource,
  KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
} from "../src/kairos-manuscript-source-shard-v1.js";

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

function pngBytes() {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
}

function createRuntime(projectId, { mirrorFails = false } = {}) {
  const storage = new MemoryStorage({
    [`manuscript:${projectId}:metadata`]: {
      projectId,
      title: "AI Video Prompt Mastery",
      filename: "AI-Video-Prompt-Mastery.docx",
      storedAt: "2026-07-31T00:00:00.000Z",
    },
    "production-registry": {},
  });
  const shard = new KairosManuscriptSource({ storage }, {});
  const globalRequests = [];

  const env = {
    KAIROS_MANUSCRIPT_SOURCES: {
      idFromName(name) {
        assert.equal(name, projectId);
        return `source:${name}`;
      },
      get(id) {
        assert.equal(id, `source:${projectId}`);
        return { fetch: request => shard.fetch(request) };
      },
    },
    KAIROS_PROJECTS: {
      idFromName(name) {
        assert.equal(name, "mmg-production-project-registry");
        return `project:${name}`;
      },
      get() {
        return {
          async fetch(request) {
            const body = await request.json();
            globalRequests.push({ url: request.url, body });
            if (mirrorFails) {
              return new Response(JSON.stringify({
                status: "failed",
                error: { code: "diagnostic_global_mirror_failure", message: "Global mirror unavailable." },
              }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify({ status: "created", project: body }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          },
        };
      },
    },
  };

  return { env, storage, globalRequests };
}

function setupPayload(operationId) {
  return {
    authorName: "Michael King",
    publicationTitle: "AI Video Prompt Mastery",
    service: "complete-publishing-package",
    edition: "multi-format",
    trimSize: "6x9",
    isbnStatus: "not-decided",
    notes: "Production assignment from the retained manuscript source.",
    operationId,
  };
}

async function route(runtime, projectId, suffix, init = {}) {
  const response = await handleDedicatedManuscriptSource(
    new Request(`https://kairos.test/api/production-registry/manuscripts/${projectId}/${suffix}`, init),
    runtime.env,
  );
  assert.ok(response, `The dedicated manuscript route did not handle ${suffix}.`);
  return response;
}

test("cover, setup, recovery, and source metadata share the same per-project shard", async () => {
  const projectId = "manuscript-studio-setup-shard-12345678";
  const operationId = "setup-shard-operation-12345678";
  const runtime = createRuntime(projectId);

  const coverResponse = await route(runtime, projectId, "setup/cover", {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "X-Filename": "customer-cover.png",
      "X-Kairos-Operation-Id": operationId,
    },
    body: pngBytes(),
  });
  assert.equal(coverResponse.status, 201);
  assert.equal(coverResponse.headers.get("x-kairos-source-shard"), KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);

  const setupResponse = await route(runtime, projectId, "setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kairos-Operation-Id": operationId,
      "X-Kairos-Idempotency-Key": operationId,
    },
    body: JSON.stringify(setupPayload(operationId)),
  });
  assert.equal(setupResponse.status, 201);
  assert.equal(setupResponse.headers.get("x-kairos-global-project-mirror"), "synced");
  const setup = await setupResponse.json();
  assert.equal(setup.status, "assigned-to-production");
  assert.equal(setup.setup.coverStatus, "customer-supplied-cover-stored");
  assert.equal(setup.setup.externalInferenceAPI, false);

  const recoveryResponse = await route(runtime, projectId, "setup");
  assert.equal(recoveryResponse.status, 200);
  const recovery = await recoveryResponse.json();
  assert.equal(recovery.status, "ready");
  assert.equal(recovery.setup.status, "assigned-to-production");

  assert.equal(runtime.globalRequests.length, 1);
  assert.equal(new URL(runtime.globalRequests[0].url).pathname, "/registry/projects");
  assert.equal(runtime.globalRequests[0].body.projectId, projectId);
  assert.equal(runtime.globalRequests[0].body.status, "assigned-to-production");
  assert.equal(runtime.globalRequests[0].body.stage, "editorial-assignment");

  const localSetup = await runtime.storage.get(`manuscript:${projectId}:setup`);
  assert.equal(localSetup.status, "assigned-to-production");
});

test("a global registry mirror failure cannot turn a saved setup into HTTP 502", async () => {
  const projectId = "manuscript-studio-setup-recovery-12345678";
  const operationId = "setup-recovery-operation-12345678";
  const runtime = createRuntime(projectId, { mirrorFails: true });

  const setupResponse = await route(runtime, projectId, "setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kairos-Operation-Id": operationId,
      "X-Kairos-Idempotency-Key": operationId,
    },
    body: JSON.stringify(setupPayload(operationId)),
  });

  assert.equal(setupResponse.status, 201);
  assert.equal(setupResponse.headers.get("x-kairos-global-project-mirror"), "pending");
  const setup = await setupResponse.json();
  assert.equal(setup.status, "awaiting-customer-cover");

  const recoveryResponse = await route(runtime, projectId, "setup");
  assert.equal(recoveryResponse.status, 200);
  const recovery = await recoveryResponse.json();
  assert.equal(recovery.status, "ready");
  assert.equal(recovery.setup.status, "awaiting-customer-cover");
});
