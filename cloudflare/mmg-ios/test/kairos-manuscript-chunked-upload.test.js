import assert from "node:assert/strict";
import test from "node:test";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleProductionRegistry } from "../src/kairos-production-registry-v1.js";

const PROJECT_ID = "manuscript-studio-chunked-12345678";
const PUBLIC_BASE = `/api/production-registry/manuscripts/${PROJECT_ID}/source`;
const FILE_CHUNK_BYTES = 512 * 1024;
const TEXT_CHUNK_BYTES = 128 * 1024;

function createRuntime() {
  const values = new Map();
  const state = {
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
    },
  };
  const env = {
    KAIROS_PROJECTS: {
      idFromName() { return "registry-object-id"; },
      get() {
        return {
          async fetch(request) {
            const response = await handleManuscriptSourceObjectRequest(state, request);
            assert.ok(response, `Unhandled object request: ${request.method} ${request.url}`);
            return response;
          },
        };
      },
    },
  };
  return { env, values };
}

async function expectStatus(response, status) {
  if (response.status !== status) {
    throw new Error(`Expected ${status}; received ${response.status}: ${await response.text()}`);
  }
  return response;
}

test("chunked source upload stores and reads a large DOCX and extracted manuscript without multipart", async () => {
  const runtime = createRuntime();
  const uploadId = "upload-chunked-12345678";
  const fileBytes = new Uint8Array((1024 * 1024) + 77);
  for (let index = 0; index < fileBytes.length; index += 1) fileBytes[index] = index % 251;
  const manuscript = "AI Video Prompt Mastery verified chunk storage. ".repeat(7000);
  const textBytes = new TextEncoder().encode(manuscript);
  const fileChunks = Math.ceil(fileBytes.length / FILE_CHUNK_BYTES);
  const textChunks = Math.ceil(textBytes.length / TEXT_CHUNK_BYTES);
  const base = `https://kairos.test${PUBLIC_BASE}`;

  await expectStatus(await handleProductionRegistry(new Request(`${base}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId,
      title: "AI Video Prompt Mastery",
      filename: "AI-Video-Prompt-Mastery.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      format: "docx",
      size: fileBytes.length,
      textBytes: textBytes.length,
      fileChunks,
      textChunks,
      checksum: "chunked-source-checksum",
    }),
  }), runtime.env), 201);

  for (let index = 0; index < fileChunks; index += 1) {
    const chunk = fileBytes.slice(index * FILE_CHUNK_BYTES, Math.min(fileBytes.length, (index + 1) * FILE_CHUNK_BYTES));
    await expectStatus(await handleProductionRegistry(new Request(`${base}/file/${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "X-Kairos-Upload-Id": uploadId },
      body: chunk,
    }), runtime.env), 201);
  }

  for (let index = 0; index < textChunks; index += 1) {
    const chunk = textBytes.slice(index * TEXT_CHUNK_BYTES, Math.min(textBytes.length, (index + 1) * TEXT_CHUNK_BYTES));
    await expectStatus(await handleProductionRegistry(new Request(`${base}/text-chunk/${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "X-Kairos-Upload-Id": uploadId },
      body: chunk,
    }), runtime.env), 201);
  }

  const committedResponse = await expectStatus(await handleProductionRegistry(new Request(`${base}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kairos-Upload-Id": uploadId },
    body: JSON.stringify({ uploadId }),
  }), runtime.env), 201);
  const committed = await committedResponse.json();
  assert.equal(committed.status, "stored-and-verified");
  assert.equal(committed.source.uploadMode, "chunked-v1");
  assert.equal(committed.verification.fileBytes, fileBytes.length);
  assert.equal(committed.verification.textBytes, textBytes.length);

  const textResponse = await expectStatus(await handleProductionRegistry(new Request(`${base}/text`), runtime.env), 200);
  assert.equal((await textResponse.json()).manuscript, manuscript);

  const downloadResponse = await expectStatus(await handleProductionRegistry(new Request(`${base}/download`), runtime.env), 200);
  const downloaded = new Uint8Array(await downloadResponse.arrayBuffer());
  assert.equal(downloaded.length, fileBytes.length);
  assert.deepEqual(downloaded.slice(0, 512), fileBytes.slice(0, 512));
  assert.equal(runtime.values.get("production-registry")[PROJECT_ID].sourceStored, true);
});

test("chunk commit refuses missing chunks instead of publishing incomplete source metadata", async () => {
  const runtime = createRuntime();
  const uploadId = "upload-missing-12345678";
  const base = `https://kairos.test${PUBLIC_BASE}`;

  await expectStatus(await handleProductionRegistry(new Request(`${base}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId,
      title: "Incomplete upload",
      filename: "incomplete.docx",
      format: "docx",
      size: 10,
      textBytes: 10,
      fileChunks: 1,
      textChunks: 1,
    }),
  }), runtime.env), 201);

  const response = await handleProductionRegistry(new Request(`${base}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kairos-Upload-Id": uploadId },
    body: JSON.stringify({ uploadId }),
  }), runtime.env);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "manuscript_upload_chunk_missing");
  assert.equal(runtime.values.has(`manuscript:${PROJECT_ID}:metadata`), false);
});
