import assert from "node:assert/strict";
import test from "node:test";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleProductionRegistry } from "../src/kairos-production-registry-v1.js";
import {
  handleDedicatedManuscriptSource,
  KairosManuscriptSource,
  KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
} from "../src/kairos-manuscript-source-shard-v1.js";

const PROJECT_ID = "manuscript-source-forwarding-12345678";
const PUBLIC_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/source`;
const INTERNAL_PATH = `/registry/manuscripts/${PROJECT_ID}/source`;
const EXTRACTED_TEXT = "AI Video Prompt Mastery manuscript text retained locally for durable production intake verification.";

function createRuntime() {
  const values = new Map();
  const state = {
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, value); },
      async delete(key) { return values.delete(key); },
    },
  };

  let lastForwardedRequest = null;
  const env = {
    KAIROS_PROJECTS: {
      idFromName(name) {
        assert.equal(name, "mmg-production-project-registry");
        return "registry-object-id";
      },
      get(id) {
        assert.equal(id, "registry-object-id");
        return {
          async fetch(request) {
            lastForwardedRequest = request;
            const response = await handleManuscriptSourceObjectRequest(state, request);
            assert.ok(response, `The manuscript source object route did not handle ${request.method} ${request.url}`);
            return response;
          },
        };
      },
    },
  };

  return { env, values, getLastForwardedRequest: () => lastForwardedRequest };
}

function createShardedRuntime() {
  const shards = new Map();
  const globalProjects = new Map();
  const env = {
    KAIROS_MANUSCRIPT_SOURCES: {
      idFromName(name) { return `source:${name}`; },
      get(id) {
        if (!shards.has(id)) {
          const values = new Map();
          const state = {
            storage: {
              async get(key) { return values.get(key); },
              async put(key, value) { values.set(key, value); },
              async delete(key) { values.delete(key); },
            },
          };
          shards.set(id, { values, object: new KairosManuscriptSource(state, {}) });
        }
        return { fetch: request => shards.get(id).object.fetch(request) };
      },
    },
    KAIROS_PROJECTS: {
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
    },
  };
  return { env, shards, globalProjects };
}

test("multipart manuscript source uploads remain backward compatible and buffered", async () => {
  const runtime = createRuntime();
  const form = new FormData();
  form.append(
    "file",
    new File(["PK\u0003\u0004docx-test"], "AI-Video-Prompt-Mastery.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  form.append("extractedText", EXTRACTED_TEXT);
  form.append("title", "AI Video Prompt Mastery");
  form.append("format", "docx");
  form.append("checksum", "source-forwarding-checksum");

  const response = await handleProductionRegistry(new Request(`https://kairos.test${PUBLIC_PATH}`, {
    method: "POST",
    body: form,
  }), runtime.env);

  const forwarded = runtime.getLastForwardedRequest();
  assert.ok(forwarded);
  assert.equal(new URL(forwarded.url).pathname, INTERNAL_PATH);
  assert.equal(forwarded.method, "POST");
  assert.match(forwarded.headers.get("content-type") || "", /^multipart\/form-data; boundary=/i);
  assert.equal(
    forwarded.headers.get("x-kairos-registry-forwarding"),
    "kairos-production-registry-20260730-4-chunked-source",
  );

  assert.equal(response.status, 201);
  const stored = await response.json();
  assert.equal(stored.status, "stored-and-verified");
  assert.equal(stored.source.projectId, PROJECT_ID);
  assert.equal(stored.source.filename, "AI-Video-Prompt-Mastery.docx");
  assert.equal(stored.source.format, "docx");
  assert.equal(stored.source.checksum, "source-forwarding-checksum");
  assert.equal(stored.source.wordCount, 13);
  assert.equal(stored.source.uploadMode, "legacy-multipart");

  const metadata = runtime.values.get(`manuscript:${PROJECT_ID}:metadata`);
  assert.equal(metadata.textBytes, new TextEncoder().encode(EXTRACTED_TEXT).length);
  assert.equal(metadata.fileChunks, 1);
  assert.equal(metadata.textChunks, 1);
  assert.ok(runtime.values.get(`manuscript:${PROJECT_ID}:file:0`) instanceof Uint8Array);
  assert.ok(runtime.values.get(`manuscript:${PROJECT_ID}:text:0`) instanceof Uint8Array);
  assert.equal(runtime.values.get("production-registry")[PROJECT_ID].sourceStored, true);
});

test("stored manuscript metadata and extracted text remain readable after forwarding", async () => {
  const runtime = createRuntime();
  const form = new FormData();
  form.append("file", new File(["docx"], "manuscript.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  form.append("extractedText", EXTRACTED_TEXT);
  form.append("title", "Readable Manuscript");
  form.append("format", "docx");

  const stored = await handleProductionRegistry(new Request(`https://kairos.test${PUBLIC_PATH}`, { method: "POST", body: form }), runtime.env);
  assert.equal(stored.status, 201);

  const metadataResponse = await handleProductionRegistry(new Request(`https://kairos.test${PUBLIC_PATH}`), runtime.env);
  assert.equal(metadataResponse.status, 200);
  assert.equal(runtime.getLastForwardedRequest().headers.get("x-kairos-registry-forwarding"), null);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.source.title, "Readable Manuscript");

  const textResponse = await handleProductionRegistry(new Request(`https://kairos.test${PUBLIC_PATH}/text`), runtime.env);
  assert.equal(textResponse.status, 200);
  const text = await textResponse.json();
  assert.equal(text.manuscript, EXTRACTED_TEXT);
});

test("realistic iPhone source session bypasses the shared production registry", async () => {
  const runtime = createShardedRuntime();
  const projectId = "manuscript-studio-realistic-12345678";
  const uploadId = "upload-realistic-12345678";
  const response = await handleDedicatedManuscriptSource(new Request(
    `https://kairos.test/api/production-registry/manuscripts/${projectId}/source/session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MMG-Client-Build": "manuscript-studio-direct-chunks-20260730-4",
      },
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
      }),
    },
  ), runtime.env);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-kairos-source-shard"), KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);
  const body = await response.json();
  assert.equal(body.status, "upload-session-ready");
  assert.equal(body.upload.projectId, projectId);
  assert.equal(body.upload.textBytes, 279045);
  assert.equal(body.upload.fileChunks, 30);
  assert.equal(body.upload.textChunks, 3);
  assert.equal(runtime.shards.size, 1);
  assert.equal(runtime.globalProjects.size, 0, "source-session creation must not call the shared production registry");
});
