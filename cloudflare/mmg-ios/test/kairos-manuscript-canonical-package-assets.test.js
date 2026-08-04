import assert from "node:assert/strict";
import test from "node:test";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "../src/kairos-manuscript-project-setup-v1.js";
import { handleManuscriptEditorialObjectRequest } from "../src/kairos-manuscript-editorial-workbench-v1.js";
import { handleManuscriptDeliverablesObjectRequest } from "../src/kairos-manuscript-deliverables-http-v1.js";

const REQUIRED_KINDS = [
  "ORIGINAL_SOURCE",
  "NORMALIZED_MANUSCRIPT",
  "EDITABLE_MANUSCRIPT",
  "FINAL_MANUSCRIPT",
  "COVER_SOURCE",
  "STOREFRONT_PRODUCT_IMAGE",
  "PRODUCT_METADATA",
  "CUSTOMER_README",
  "QA_REPORT",
  "RIGHTS_DECLARATION",
  "PACKAGE_MANIFEST",
  "ZIP_ARCHIVE",
];

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

function includesBytes(haystack, needle) {
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("canonical package contains the uploaded source and uploaded cover image", async () => {
  const state = createState();
  const projectId = "canonical-binary-package-12345678";
  const originalSentinel = "ORIGINAL_CUSTOMER_SOURCE_BINARY_SENTINEL";
  const sourceText = `${"Approved manuscript content for canonical packaging. ".repeat(30)}End.`;
  const sourceBytes = new TextEncoder().encode(`${originalSentinel}\n${sourceText}`);
  const coverBytes = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlKzv8AAAAASUVORK5CYII=",
    "base64",
  ));

  const sourceForm = new FormData();
  sourceForm.set("file", new File([sourceBytes], "customer-original-manuscript.txt", { type: "text/plain" }));
  sourceForm.set("extractedText", sourceText);
  sourceForm.set("title", "Canonical Binary Package Test");
  sourceForm.set("format", "txt");
  const sourceResponse = await handleManuscriptSourceObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, {
      method: "POST",
      body: sourceForm,
    }),
  );
  assert.equal(sourceResponse.status, 201);

  const setupForm = new FormData();
  setupForm.set("authorName", "MMG Test Author");
  setupForm.set("publicationTitle", "Canonical Binary Package Test");
  setupForm.set("service", "complete-publishing-package");
  setupForm.set("edition", "multi-format");
  setupForm.set("trimSize", "6x9");
  setupForm.set("isbnStatus", "not-required");
  setupForm.set("cover", new File([coverBytes], "customer-uploaded-cover.png", { type: "image/png" }));
  const setupResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
      method: "POST",
      headers: {
        "X-Kairos-Operation-Id": "canonical-package-test-operation",
        "X-Kairos-Idempotency-Key": "canonical-package-test-operation",
      },
      body: setupForm,
    }),
  );
  assert.equal(setupResponse.status, 201, JSON.stringify(await setupResponse.clone().json()));

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
      handleManuscriptEditorialObjectRequest,
    },
  );

  assert.equal(buildResponse.status, 201, JSON.stringify(await buildResponse.clone().json()));
  const body = await buildResponse.json();
  const build = body.deliverablesBuild;
  assert.equal(body.packageContract, "canonical-12-artifact-manuscript-package-v1");
  assert.equal(build.status, "COMPLETED");
  assert.equal(build.metadata.originalSourceIncluded, true);
  assert.equal(build.metadata.uploadedCoverIncluded, true);
  assert.equal(build.metadata.packageContentsVerified, true);
  assert.deepEqual(new Set(build.artifacts.map((artifact) => artifact.kind)), new Set(REQUIRED_KINDS));

  const originalArtifact = build.artifacts.find((artifact) => artifact.kind === "ORIGINAL_SOURCE");
  assert.equal(originalArtifact.filename, "customer-original-manuscript.txt");
  assert.equal(originalArtifact.byteSize, sourceBytes.byteLength);
  assert.equal(originalArtifact.sha256, await sha256(sourceBytes));

  const coverArtifact = build.artifacts.find((artifact) => artifact.kind === "COVER_SOURCE");
  const storefrontArtifact = build.artifacts.find((artifact) => artifact.kind === "STOREFRONT_PRODUCT_IMAGE");
  assert.equal(coverArtifact.filename, "customer-uploaded-cover.png");
  assert.equal(coverArtifact.mimeType, "image/png");
  assert.equal(coverArtifact.sha256, await sha256(coverBytes));
  assert.equal(storefrontArtifact.filename, "storefront-customer-uploaded-cover.png");
  assert.equal(storefrontArtifact.sha256, await sha256(coverBytes));

  const zipResponse = await handleManuscriptDeliverablesObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/deliverables/zip`),
    {
      handleManuscriptSourceObjectRequest,
      handleManuscriptProjectSetupObjectRequest,
      handleManuscriptEditorialObjectRequest,
    },
  );
  assert.equal(zipResponse.status, 200);
  assert.equal(zipResponse.headers.get("X-Kairos-Manuscript-Package-Contract"), "canonical-12-artifact-manuscript-package-v1");
  const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
  const zipText = new TextDecoder("latin1").decode(zipBytes);
  assert.match(zipText, /customer-original-manuscript\.txt/);
  assert.match(zipText, /customer-uploaded-cover\.png/);
  assert.match(zipText, /storefront-customer-uploaded-cover\.png/);
  assert.match(zipText, /ORIGINAL_CUSTOMER_SOURCE_BINARY_SENTINEL/);
  assert.equal(includesBytes(zipBytes, coverBytes), true, "ZIP must contain the exact uploaded cover bytes");
});
