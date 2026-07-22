import test from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  ManuscriptProcessingError,
  extractManuscript,
  normalizeManuscript,
  processManuscriptSource,
} from "../src/kairos-manuscript-processor-v1.js";
import { handleManuscriptRunObjectRequest } from "../src/kairos-manuscript-runner-v1.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    const value = this.values.get(key);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    return value === undefined ? undefined : structuredClone(value);
  }

  async put(key, value) {
    this.values.set(key, value instanceof Uint8Array ? new Uint8Array(value) : structuredClone(value));
  }
}

function state() {
  return { storage: new MemoryStorage() };
}

function stages() {
  return [
    "INTAKE",
    "SOURCE_VALIDATION",
    "MANUSCRIPT_EXTRACTION",
    "METADATA_INFERENCE",
    "EDITORIAL_ANALYSIS",
    "DELIVERABLE_GENERATION",
    "PRODUCT_METADATA_GENERATION",
    "PACKAGE_ASSEMBLY",
    "REVIEW",
    "SHOPIFY_STAGING_HANDOFF",
  ].map((name) => ({ name, status: "PENDING" }));
}

function project(overrides = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    schemaVersion: "1.0.0",
    status: "READY",
    metadata: {},
    sourceAssets: [
      {
        id: "cover-1",
        projectId: "44444444-4444-4444-8444-444444444444",
        role: "COVER_SOURCE",
        filename: "cover.png",
        mimeType: "image/png",
        byteSize: 3,
        sha256: "a".repeat(64),
        storageKey: "publishing:asset:cover-1",
        immutable: true,
        createdAt: "2026-07-22T00:00:00.000Z",
      },
      {
        id: "manuscript-1",
        projectId: "44444444-4444-4444-8444-444444444444",
        role: "MANUSCRIPT_SOURCE",
        filename: "guide.txt",
        mimeType: "text/plain",
        byteSize: 12,
        sha256: "b".repeat(64),
        storageKey: "publishing:asset:manuscript-1",
        immutable: true,
        createdAt: "2026-07-22T00:00:00.000Z",
      },
    ],
    stages: stages(),
    artifacts: [],
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    run: null,
    governance: {
      liveShopifyMutationAuthorized: false,
      shopifyTargetStatus: "DRAFT",
    },
    ...overrides,
  };
}

async function responseBody(response) {
  return response.json();
}

test("normalizes UTF-8 text and reports manuscript statistics", async () => {
  const extracted = await extractManuscript(strToU8("# Title\r\n\r\nFirst   line.\r\n\r\nSecond paragraph."), "text/plain");
  const normalized = normalizeManuscript(extracted.text);

  assert.equal(normalized.text, "# Title\n\nFirst   line.\n\nSecond paragraph.");
  assert.equal(normalized.headingCount, 1);
  assert.equal(normalized.paragraphCount, 3);
  assert.equal(normalized.wordCount, 6);
});

test("extracts paragraphs, tabs, breaks, and XML entities from DOCX", async () => {
  const docx = zipSync({
    "[Content_Types].xml": strToU8("<?xml version=\"1.0\"?><Types/>"),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>First &amp; foremost</w:t></w:r></w:p>
          <w:p><w:r><w:t>Second</w:t><w:tab/><w:t>Column</w:t><w:br/><w:t>Line</w:t></w:r></w:p>
        </w:body>
      </w:document>`),
  });

  const result = await extractManuscript(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const normalized = normalizeManuscript(result.text);

  assert.equal(result.method, "docx-openxml");
  assert.match(normalized.text, /First & foremost/);
  assert.match(normalized.text, /Second\tColumn\nLine/);
});

test("extracts literal and array text operators from a text PDF", async () => {
  const pdf = strToU8(`%PDF-1.4
1 0 obj
<< /Type /Catalog >>
endobj
stream
BT
(First line) Tj
T*
[(Second) -150 (line)] TJ
ET
endstream
%%EOF`);

  const result = await extractManuscript(pdf, "application/pdf");

  assert.equal(result.method, "pdf-text-operators");
  assert.match(result.text, /First line/);
  assert.match(result.text, /Second line/);
});

test("flags image-only PDFs for human review", async () => {
  const pdf = strToU8("%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\n%%EOF");

  await assert.rejects(
    () => extractManuscript(pdf, "application/pdf"),
    (error) => error instanceof ManuscriptProcessingError
      && error.code === "pdf_text_unavailable"
      && error.requiresHumanReview === true,
  );
});

test("registers a normalized artifact without exposing mutable source storage", async () => {
  const durable = state();
  const sourceProject = project();
  await durable.storage.put("publishing:asset:manuscript-1", strToU8("# Guide\n\nBuild the package."));

  const result = await processManuscriptSource(durable, sourceProject);
  const stored = await durable.storage.get(result.artifact.storageKey);

  assert.equal(result.artifact.kind, "NORMALIZED_MANUSCRIPT");
  assert.equal(result.artifact.mimeType, "text/markdown");
  assert.match(result.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(new TextDecoder().decode(stored), "# Guide\n\nBuild the package.");
});

test("run endpoint executes extraction and advances to metadata inference", async () => {
  const durable = state();
  const sourceProject = project();
  await durable.storage.put("publishing:project", sourceProject);
  await durable.storage.put("publishing:asset:manuscript-1", strToU8("# Guide\n\nBuild the package."));

  const response = await handleManuscriptRunObjectRequest(
    durable,
    new Request(`https://internal.test/internal/publishing/projects/${sourceProject.id}/run`, { method: "POST" }),
  );
  const payload = await responseBody(response);

  assert.equal(response.status, 202);
  assert.equal(payload.project.status, "RUNNING");
  assert.equal(payload.run.currentStage, "METADATA_INFERENCE");
  assert.equal(payload.project.stages[2].status, "SUCCEEDED");
  assert.equal(payload.project.stages[3].status, "RUNNING");
  assert.equal(payload.project.artifacts[0].kind, "NORMALIZED_MANUSCRIPT");
  assert.equal(payload.safeguards.liveShopifyMutation, "blocked");
});

test("failed extraction records review state and allows a governed retry", async () => {
  const durable = state();
  const sourceProject = project({
    sourceAssets: project().sourceAssets.map((asset) => asset.role === "MANUSCRIPT_SOURCE"
      ? { ...asset, filename: "scan.pdf", mimeType: "application/pdf" }
      : asset),
  });
  await durable.storage.put("publishing:project", sourceProject);
  await durable.storage.put("publishing:asset:manuscript-1", strToU8("%PDF-1.4\n%%EOF"));

  const failedResponse = await handleManuscriptRunObjectRequest(
    durable,
    new Request(`https://internal.test/internal/publishing/projects/${sourceProject.id}/run`, { method: "POST" }),
  );
  const failedPayload = await responseBody(failedResponse);

  assert.equal(failedResponse.status, 422);
  assert.equal(failedPayload.project.status, "FAILED");
  assert.equal(failedPayload.error.code, "pdf_text_unavailable");
  assert.equal(failedPayload.project.stages[2].requiresHumanReview, true);
  assert.equal(failedPayload.retry.allowed, true);

  const corrected = await durable.storage.get("publishing:project");
  corrected.sourceAssets = corrected.sourceAssets.map((asset) => asset.role === "MANUSCRIPT_SOURCE"
    ? { ...asset, filename: "guide.txt", mimeType: "text/plain" }
    : asset);
  await durable.storage.put("publishing:project", corrected);
  await durable.storage.put("publishing:asset:manuscript-1", strToU8("Corrected manuscript."));

  const retryResponse = await handleManuscriptRunObjectRequest(
    durable,
    new Request(`https://internal.test/internal/publishing/projects/${sourceProject.id}/run`, { method: "POST" }),
  );
  const retryPayload = await responseBody(retryResponse);

  assert.equal(retryResponse.status, 202);
  assert.equal(retryPayload.run.attempt, 2);
  assert.equal(retryPayload.run.currentStage, "METADATA_INFERENCE");
});
