import assert from "node:assert/strict";
import test from "node:test";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "../src/kairos-manuscript-project-setup-v1.js";
import { handleManuscriptDeliverablesObjectRequest } from "../src/kairos-manuscript-deliverables-http-v1.js";

const COVER_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAIAAABSnclZAAAAFElEQVR4nGP8z4APMOGVHZUefNIA608BHQlcdJEAAAAASUVORK5CYII=";

function createState() {
  const map = new Map();
  return {
    storage: {
      async get(key) {
        if (Array.isArray(key)) return new Map(key.map((item) => [item, map.get(item)]));
        return map.get(key);
      },
      async put(key, value) {
        if (key && typeof key === "object" && !Array.isArray(key)) {
          for (const [entryKey, entryValue] of Object.entries(key)) map.set(entryKey, entryValue);
          return;
        }
        map.set(key, value);
      },
      async delete(key) {
        if (Array.isArray(key)) key.forEach((item) => map.delete(item));
        else map.delete(key);
      },
    },
  };
}

async function body(response) {
  return response.clone().json();
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("legacy source and saved cover manufacture without a pre-existing setup record", async () => {
  const state = createState();
  const projectId = "legacy-manufacturing-12345678";
  const manuscript = `${"Canonical legacy manuscript text for complete publishing production. ".repeat(100)}End.`;
  const coverBytes = Uint8Array.from(Buffer.from(COVER_BASE64, "base64"));

  const sourceForm = new FormData();
  sourceForm.set("file", new File([manuscript], "legacy-book.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
  sourceForm.set("extractedText", manuscript);
  sourceForm.set("title", "Legacy Book Production");
  sourceForm.set("format", "docx");
  const sourceResponse = await handleManuscriptSourceObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, {
      method: "POST",
      body: sourceForm,
    }),
  );
  assert.equal(sourceResponse.status, 201, JSON.stringify(await body(sourceResponse)));

  const coverResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(coverBytes.byteLength),
        "X-Filename": "legacy-customer-cover.png",
        "X-Kairos-Operation-Id": "legacy-cover-operation",
      },
      body: coverBytes,
    }),
  );
  assert.equal(coverResponse.status, 201, JSON.stringify(await body(coverResponse)));

  const missingSetup = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`),
  );
  assert.equal(missingSetup.status, 404);

  const buildResponse = await handleManuscriptDeliverablesObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/deliverables/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "MANUFACTURE DELIVERY PACKAGE" }),
    }),
    {
      handleManuscriptSourceObjectRequest,
      handleManuscriptProjectSetupObjectRequest,
    },
  );
  assert.equal(buildResponse.status, 201, JSON.stringify(await body(buildResponse)));
  const result = await buildResponse.json();
  assert.equal(result.status, "completed");
  assert.equal(result.setupMigration.status, "normalized");
  assert.equal(result.setupMigration.setupCreated, true);
  assert.equal(result.setupMigration.coverPreserved, true);
  assert.equal(result.packageContract, "mmg-locked-five-asset-kdp-delivery-package-v1");
  assert.equal(result.deliverablesBuild.metadata.packageFileCount, 5);
  assert.equal(result.deliverablesBuild.metadata.uploadedCoverIncluded, true);
  assert.deepEqual(result.deliverablesBuild.artifacts.map((artifact) => artifact.kind), [
    "GOLD_MASTER_DOCX",
    "DIGITAL_ASSET_PDF",
    "KDP_INTERIOR_PDF",
    "KDP_FULL_WRAP_COVER_PDF",
    "STANDALONE_COVER_IMAGE",
    "ZIP_ARCHIVE",
  ]);

  const restoredSetup = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`),
  );
  assert.equal(restoredSetup.status, 200);
  const restoredBody = await restoredSetup.json();
  assert.equal(restoredBody.setup.publicationTitle, "Legacy Book Production");
  assert.equal(restoredBody.setup.trimSize, "6x9");
  assert.equal(restoredBody.setup.cover.sha256, await sha256(coverBytes));

  const restoredCover = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`),
  );
  assert.equal(restoredCover.status, 200);
  assert.deepEqual(new Uint8Array(await restoredCover.arrayBuffer()), coverBytes);
});
