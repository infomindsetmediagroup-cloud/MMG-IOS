import assert from "node:assert/strict";
import test from "node:test";

import {
  handleDedicatedManuscriptSource,
  KairosManuscriptSource,
  KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
} from "../src/kairos-manuscript-source-shard-v1.js";

function storageState() {
  const values = new Map();
  return {
    values,
    state: {
      storage: {
        async get(key) { return values.get(key); },
        async put(key, value) { values.set(key, value); },
        async delete(key) { values.delete(key); },
      },
    },
  };
}

function runtime() {
  const shards = new Map();
  const globalProjects = new Map();
  const sourceBinding = {
    idFromName(name) { return `source:${name}`; },
    get(id) {
      if (!shards.has(id)) {
        const stored = storageState();
        shards.set(id, { ...stored, object: new KairosManuscriptSource(stored.state, {}) });
      }
      return { fetch: request => shards.get(id).object.fetch(request) };
    },
  };
  const projectBinding = {
    idFromName(name) { return `project:${name}`; },
    get() {
      return {
        async fetch(request) {
          const body = await request.json();
          globalProjects.set(body.projectId, body);
          return new Response(JSON.stringify({ status: "created", project: body }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        },
      };
    },
  };
  return {
    env: {
      KAIROS_MANUSCRIPT_SOURCES: sourceBinding,
      KAIROS_PROJECTS: projectBinding,
    },
    shards,
    globalProjects,
  };
}

async function expectStatus(response, status) {
  if (response.status !== status) {
    throw new Error(`Expected ${status}; received ${response.status}: ${await response.text()}`);
  }
  return response;
}

function sessionRequest(projectId, uploadId, overrides = {}) {
  return new Request(`https://kairos.test/api/production-registry/manuscripts/${projectId}/source/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": "iphone-realistic-source" },
    body: JSON.stringify({
      uploadId,
      title: "Cinematic AI Video Creation, Viral Content Systems, Commercial Prompt Engineering, and Modern AI Filmmaking",
      filename: "AI-Video-Prompt-Mastery.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      format: "docx",
      size: 15 * 1024 * 1024,
      textBytes: 279045,
      fileChunks: 30,
      textChunks: 3,
      pages: null,
      checksum: "a".repeat(64),
      ...overrides,
    }),
  });
}

test("a realistic 279,045-byte manuscript session is created in its own source shard", async () => {
  const active = runtime();
  const projectId = "manuscript-studio-realistic-12345678";
  const response = await expectStatus(await handleDedicatedManuscriptSource(
    sessionRequest(projectId, "upload-realistic-12345678"),
    active.env,
  ), 201);
  const body = await response.json();

  assert.equal(body.status, "upload-session-ready");
  assert.equal(body.upload.projectId, projectId);
  assert.equal(body.upload.textBytes, 279045);
  assert.equal(body.upload.fileChunks, 30);
  assert.equal(body.upload.textChunks, 3);
  assert.equal(response.headers.get("x-kairos-source-shard"), KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);
  assert.equal(active.shards.size, 1);
  assert.equal(active.globalProjects.size, 0, "session creation must not depend on the shared project registry");
});

test("different manuscript projects never share source-session storage", async () => {
  const active = runtime();
  const first = "manuscript-studio-isolated-11111111";
  const second = "manuscript-studio-isolated-22222222";

  await expectStatus(await handleDedicatedManuscriptSource(sessionRequest(first, "upload-isolated-11111111"), active.env), 201);
  await expectStatus(await handleDedicatedManuscriptSource(sessionRequest(second, "upload-isolated-22222222"), active.env), 201);

  assert.equal(active.shards.size, 2);
  const firstState = active.shards.get(`source:${first}`).values;
  const secondState = active.shards.get(`source:${second}`).values;
  assert.ok(firstState.has(`manuscript:${first}:upload-session`));
  assert.ok(secondState.has(`manuscript:${second}:upload-session`));
  assert.equal(firstState.has(`manuscript:${second}:upload-session`), false);
  assert.equal(secondState.has(`manuscript:${first}:upload-session`), false);
});

test("a committed dedicated source creates the global project shell after storage succeeds", async () => {
  const active = runtime();
  const projectId = "manuscript-studio-commit-12345678";
  const uploadId = "upload-commit-12345678";
  const base = `https://kairos.test/api/production-registry/manuscripts/${projectId}/source`;
  const file = new TextEncoder().encode("PK\u0003\u0004dedicated-docx");
  const text = new TextEncoder().encode("Dedicated manuscript source storage is verified before production intake.");

  await expectStatus(await handleDedicatedManuscriptSource(sessionRequest(projectId, uploadId, {
    size: file.length,
    textBytes: text.length,
    fileChunks: 1,
    textChunks: 1,
  }), active.env), 201);

  await expectStatus(await handleDedicatedManuscriptSource(new Request(`${base}/file/0`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream", "X-Kairos-Upload-Id": uploadId },
    body: file,
  }), active.env), 201);

  await expectStatus(await handleDedicatedManuscriptSource(new Request(`${base}/text-chunk/0`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream", "X-Kairos-Upload-Id": uploadId },
    body: text,
  }), active.env), 201);

  const committed = await expectStatus(await handleDedicatedManuscriptSource(new Request(`${base}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kairos-Upload-Id": uploadId },
    body: JSON.stringify({ uploadId }),
  }), active.env), 201);
  const body = await committed.json();

  assert.equal(body.status, "stored-and-verified");
  assert.equal(body.source.projectId, projectId);
  assert.equal(active.globalProjects.get(projectId)?.status, "source-stored");
  assert.equal(active.globalProjects.get(projectId)?.stage, "source-intake");
});
