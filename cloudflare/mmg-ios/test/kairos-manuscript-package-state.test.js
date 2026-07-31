import assert from "node:assert/strict";
import test from "node:test";

import {
  handleManuscriptPackageState,
  handleManuscriptPackageStateObjectRequest,
  KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD,
} from "../src/kairos-manuscript-package-state-v1.js";

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
  }

  async get(key) {
    return this.values.get(key);
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

function packageRecord(projectId, {
  status = "production-ready",
  updatedAt = "2026-07-31T08:30:00.000Z",
  approved = false,
} = {}) {
  const record = {
    status,
    projectId,
    metadata: { title: "AI Video Prompt Mastery" },
    vault: {
      assetCount: 8,
      integrity: { passed: true },
      packageDownloadURL: `/api/admin-asset-vault/projects/${projectId}/package`,
      assets: [],
    },
    shopify: { status: "not-prepared" },
    updatedAt,
  };
  if (approved) record.packageApproval = { approved: true, approvedAt: updatedAt };
  return record;
}

function asRequest(input, init) {
  return input instanceof Request ? input : new Request(input, init);
}

function createRuntime(projectId, legacyRecord = null) {
  const storage = new MemoryStorage();
  const sourceStub = {
    fetch(input, init) {
      return handleManuscriptPackageStateObjectRequest({ storage }, asRequest(input, init));
    },
  };
  let legacy = legacyRecord;
  let legacyReads = 0;

  const env = {
    KAIROS_MANUSCRIPT_SOURCES: {
      idFromName(name) {
        assert.equal(name, projectId);
        return `source:${name}`;
      },
      get(id) {
        assert.equal(id, `source:${projectId}`);
        return sourceStub;
      },
    },
    KAIROS_PROJECTS: {
      idFromName(name) {
        assert.equal(name, "mmg-production-project-registry");
        return `project:${name}`;
      },
      get() {
        return {
          async fetch(input, init) {
            legacyReads += 1;
            const request = asRequest(input, init);
            const url = new URL(request.url);
            assert.equal(url.pathname, `/registry/manuscripts/${projectId}/auto-pipeline`);
            if (!legacy) {
              return new Response(JSON.stringify({ status: "failed" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify(legacy), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          },
        };
      },
    },
  };

  return {
    env,
    storage,
    get legacyReads() {
      return legacyReads;
    },
    setLegacy(record) {
      legacy = record;
    },
    clearLegacy() {
      legacy = null;
    },
  };
}

function publicRequest(projectId) {
  return new Request(`https://kairos.test/api/production-registry/manuscripts/${projectId}/auto-pipeline`);
}

async function putDedicated(runtime, projectId, record) {
  return handleManuscriptPackageStateObjectRequest(
    { storage: runtime.storage },
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }),
  );
}

test("package state stores and recovers inside the manuscript project shard", async () => {
  const projectId = "manuscript-package-state-12345678";
  const runtime = createRuntime(projectId);
  const record = packageRecord(projectId);

  const write = await putDedicated(runtime, projectId, record);
  assert.equal(write.status, 201);

  const read = await handleManuscriptPackageState(publicRequest(projectId), runtime.env);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("x-kairos-package-state"), "project-shard");
  assert.equal(read.headers.get("x-kairos-package-state-build"), KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD);
  assert.deepEqual(await read.json(), record);
  assert.equal(runtime.legacyReads, 1);
});

test("an existing legacy publishing job migrates into the manuscript project shard", async () => {
  const projectId = "manuscript-package-migration-12345678";
  const record = packageRecord(projectId);
  const runtime = createRuntime(projectId, record);

  const migrated = await handleManuscriptPackageState(publicRequest(projectId), runtime.env);
  assert.equal(migrated.status, 200);
  assert.equal(migrated.headers.get("x-kairos-package-state"), "legacy-migrated");
  assert.deepEqual(await migrated.json(), record);
  assert.equal(runtime.legacyReads, 1);

  runtime.clearLegacy();
  const recovered = await handleManuscriptPackageState(publicRequest(projectId), runtime.env);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("x-kairos-package-state"), "project-shard");
  assert.deepEqual(await recovered.json(), record);
  assert.equal(runtime.legacyReads, 2);
});

test("a newer approved package record replaces an older dedicated record", async () => {
  const projectId = "manuscript-package-approved-12345678";
  const current = packageRecord(projectId, { updatedAt: "2026-07-31T08:30:00.000Z" });
  const approved = packageRecord(projectId, {
    status: "package-approved",
    updatedAt: "2026-07-31T08:45:00.000Z",
    approved: true,
  });
  const runtime = createRuntime(projectId, approved);
  await putDedicated(runtime, projectId, current);

  const reconciled = await handleManuscriptPackageState(publicRequest(projectId), runtime.env);
  assert.equal(reconciled.status, 200);
  assert.equal(reconciled.headers.get("x-kairos-package-state"), "legacy-newer-migrated");
  assert.deepEqual(await reconciled.json(), approved);

  runtime.clearLegacy();
  const recovered = await handleManuscriptPackageState(publicRequest(projectId), runtime.env);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("x-kairos-package-state"), "project-shard");
  assert.deepEqual(await recovered.json(), approved);
});

test("missing package state remains a clean 404 for generation fallback", async () => {
  const projectId = "manuscript-package-empty-12345678";
  const runtime = createRuntime(projectId);

  const response = await handleManuscriptPackageState(publicRequest(projectId), runtime.env);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-kairos-package-state"), "not-started");
  assert.equal(runtime.legacyReads, 1);
});
