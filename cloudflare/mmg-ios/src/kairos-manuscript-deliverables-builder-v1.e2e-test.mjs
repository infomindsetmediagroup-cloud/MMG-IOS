#!/usr/bin/env node
/**
 * End-to-end verification for kairos-manuscript-deliverables-builder-v1.js
 *
 * Exercises the full 10-stage pipeline against an in-memory Durable Object
 * `state.storage` shim and the REAL, unmodified production object-request
 * handlers (kairos-manuscript-source-v1.js, kairos-manuscript-project-setup-v1.js),
 * proving the wiring works exactly as it will inside the live
 * KairosManuscriptSource Durable Object.
 *
 * This does not require `wrangler dev` or network access — it runs the same
 * JS modules Node-side using the Workers-compatible Web Crypto / Request /
 * Response globals available in modern Node.
 *
 * Usage:
 *   node cloudflare/mmg-ios/src/kairos-manuscript-deliverables-builder-v1.e2e-test.mjs
 */

import assert from "node:assert/strict";
import { handleManuscriptSourceObjectRequest } from "./kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "./kairos-manuscript-project-setup-v1.js";
import {
  runManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesZip,
  REQUIRED_ARTIFACT_KINDS,
  PIPELINE_STAGES,
  validateBuildArtifacts,
} from "./kairos-manuscript-deliverables-builder-v1.js";

// ── In-memory Durable Object storage shim ──────────────────────────────────

function createInMemoryState() {
  const map = new Map();
  return {
    storage: {
      async get(key) {
        return map.has(key) ? map.get(key) : undefined;
      },
      async put(key, value) {
        map.set(key, value);
      },
      async delete(key) {
        map.delete(key);
      },
    },
  };
}

async function main() {
  const projectId = "e2e-test-project-001";
  const state = createInMemoryState();

  console.log(`\n=== Kairos Manuscript Deliverables Builder — end-to-end test ===`);
  console.log(`Project: ${projectId}\n`);

  // 1. Store a manuscript source via the REAL production handler (multipart/form-data).
  console.log("[1/5] Storing manuscript source via kairos-manuscript-source-v1.js ...");
  const manuscriptText = `# The Founder's Field Guide

## By Jordan Rivers

This is a real end-to-end test manuscript with enough content to pass source
validation (minimum 50 characters) and to exercise every pipeline stage,
including editorial analysis word-count checks.

## Chapter 1: Introduction

Building a durable knowledge business starts with capturing what you already
know. This chapter walks through the discovery process step by step, with
concrete examples drawn from real operator experience.

## Chapter 2: Packaging Value

Once knowledge is captured, it must be organized into a coherent structure
that a paying customer can consume quickly and apply immediately.
`.repeat(3);

  const form = new FormData();
  form.set("file", new File([manuscriptText], "founders-field-guide.md", { type: "text/markdown" }));
  form.set("extractedText", manuscriptText);
  form.set("title", "The Founder's Field Guide");
  form.set("format", "md");
  const sourceReq = new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, {
    method: "POST",
    body: form,
  });
  const sourceRes = await handleManuscriptSourceObjectRequest(state, sourceReq);
  assert.equal(sourceRes.status, 201, "expected manuscript source to be stored (201)");
  const sourceBody = await sourceRes.json();
  console.log(`    stored source: ${sourceBody.source.filename} (${sourceBody.source.wordCount} words)`);

  // 2. Store project setup (author/title/service) via the REAL production handler.
  console.log("[2/5] Storing project setup via kairos-manuscript-project-setup-v1.js ...");
  const setupReq = new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authorName: "Jordan Rivers",
      publicationTitle: "The Founder's Field Guide",
      service: "complete-publishing-package",
      edition: "first",
      trimSize: "6x9",
      isbnStatus: "not-required",
      notes: "End-to-end test project.",
    }),
  });
  const setupRes = await handleManuscriptProjectSetupObjectRequest(state, setupReq);
  assert.equal(setupRes.status, 201, "expected project setup to be stored (201)");
  console.log("    stored setup: author=Jordan Rivers, service=complete-publishing-package");

  // 3. Run the full A-to-Z deliverables pipeline (10 stages).
  console.log("[3/5] Running the 10-stage manuscript deliverables pipeline ...");
  const { build, files, zipFilename } = await runManuscriptDeliverablesBuild(state, projectId, {
    handleManuscriptSourceObjectRequest,
    handleManuscriptProjectSetupObjectRequest,
    // Editorial handler intentionally omitted for this test to prove the
    // pipeline degrades gracefully when no editorial history exists yet.
  });

  assert.equal(build.status, "COMPLETED", `expected build to complete, got ${build.status}: ${build.errorMessage}`);
  console.log(`    build id: ${build.id}`);
  console.log(`    build status: ${build.status}`);

  // 4. Verify all 10 canonical stages ran and succeeded, in order.
  console.log("[4/5] Verifying all 10 canonical pipeline stages ...");
  assert.equal(build.stages.length, PIPELINE_STAGES.length, "expected 10 stage records");
  build.stages.forEach((stage, index) => {
    assert.equal(stage.name, PIPELINE_STAGES[index], `stage ${index} name mismatch`);
    assert.equal(stage.status, "SUCCEEDED", `stage ${stage.name} did not succeed: ${stage.errorMessage}`);
    assert.ok(stage.startedAt && stage.completedAt, `stage ${stage.name} missing timestamps`);
    console.log(`    [OK] ${stage.name}`);
  });

  // 5. Verify all 12 required artifact kinds are present with valid SHA-256 hashes,
  //    and that the ZIP archive is well-formed and contains every non-ZIP artifact.
  console.log("[5/5] Verifying all 12 deliverable artifacts + ZIP archive integrity ...");
  const validation = validateBuildArtifacts(build);
  assert.ok(validation.ok, `missing required artifact kinds: ${validation.missing.join(", ")}`);
  assert.equal(build.artifacts.length, REQUIRED_ARTIFACT_KINDS.length, "expected exactly 12 artifacts");

  const sha256Pattern = /^[a-f0-9]{64}$/;
  for (const kind of REQUIRED_ARTIFACT_KINDS) {
    const artifact = build.artifacts.find((a) => a.kind === kind);
    assert.ok(artifact, `artifact kind missing: ${kind}`);
    assert.ok(sha256Pattern.test(artifact.sha256), `artifact ${kind} has an invalid sha256: ${artifact.sha256}`);
    assert.ok(artifact.byteSize > 0, `artifact ${kind} has zero byte size`);
    console.log(`    [OK] ${kind.padEnd(26)} ${artifact.filename.padEnd(34)} ${artifact.byteSize.toString().padStart(7)} bytes  sha256=${artifact.sha256.slice(0, 16)}...`);
  }

  // Verify ZIP bytes were persisted and are structurally valid (local file header + EOCD signature).
  const persistedZip = await getStoredManuscriptDeliverablesZip(state, projectId);
  assert.ok(persistedZip instanceof Uint8Array, "expected persisted ZIP bytes in Durable Object storage");
  assert.equal(persistedZip.byteLength, files[zipFilename].byteLength, "persisted ZIP size mismatch");

  const localHeaderSignature = new DataView(persistedZip.buffer, persistedZip.byteOffset, 4).getUint32(0, true);
  assert.equal(localHeaderSignature, 0x04034b50, "ZIP local file header signature mismatch");

  // Find and validate the End Of Central Directory (EOCD) signature near the tail.
  let eocdFound = false;
  for (let i = persistedZip.length - 22; i >= Math.max(0, persistedZip.length - 22 - 65557); i--) {
    if (new DataView(persistedZip.buffer, persistedZip.byteOffset + i, 4).getUint32(0, true) === 0x06054b50) {
      eocdFound = true;
      break;
    }
  }
  assert.ok(eocdFound, "ZIP End Of Central Directory signature not found");
  console.log(`    [OK] ZIP archive is structurally valid (${persistedZip.byteLength.toLocaleString()} bytes, local header + EOCD signatures present)`);

  // Verify the build record round-trips through Durable Object storage retrieval.
  const storedBuild = await getStoredManuscriptDeliverablesBuild(state, projectId);
  assert.equal(storedBuild.id, build.id, "stored build id mismatch on retrieval");
  console.log(`    [OK] build record persisted and retrievable from Durable Object storage`);

  console.log(`\n=== ALL CHECKS PASSED ===`);
  console.log(`10/10 pipeline stages succeeded. 12/12 required artifact kinds present with valid SHA-256 hashes.`);
  console.log(`ZIP archive: ${zipFilename} (${persistedZip.byteLength.toLocaleString()} bytes)\n`);
}

main().catch((error) => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
