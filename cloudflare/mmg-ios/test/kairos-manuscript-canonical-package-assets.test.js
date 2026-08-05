import assert from "node:assert/strict";
import test from "node:test";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "../src/kairos-manuscript-project-setup-v1.js";
import { handleManuscriptEditorialObjectRequest } from "../src/kairos-manuscript-editorial-workbench-v1.js";
import { handleManuscriptDeliverablesObjectRequest } from "../src/kairos-manuscript-deliverables-http-v1.js";

const PACKAGE_CONTRACT = "mmg-locked-five-asset-kdp-delivery-package-v1";
const REQUIRED_KINDS = [
  "GOLD_MASTER_DOCX",
  "DIGITAL_ASSET_PDF",
  "KDP_INTERIOR_PDF",
  "KDP_FULL_WRAP_COVER_PDF",
  "STANDALONE_COVER_IMAGE",
];
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

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function zipEntries(bytes) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const method = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const filenameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    assert.equal(method, 0, "test parser expects the package store method");
    const filenameStart = offset + 30;
    const dataStart = filenameStart + filenameLength + extraLength;
    const filename = new TextDecoder().decode(bytes.slice(filenameStart, filenameStart + filenameLength));
    entries.set(filename, bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return entries;
}

function startsWithAscii(bytes, expected) {
  return new TextDecoder().decode(bytes.slice(0, expected.length)) === expected;
}

test("final manufacturing returns the locked five-file package and uses the saved cover", async () => {
  const state = createState();
  const projectId = "locked-five-package-12345678";
  const manuscript = `${"Approved final manuscript content for KDP manufacturing and digital delivery. ".repeat(80)}End.`;
  const sourceBytes = new TextEncoder().encode(manuscript);
  const coverBytes = Uint8Array.from(Buffer.from(COVER_BASE64, "base64"));

  const sourceForm = new FormData();
  sourceForm.set("file", new File([sourceBytes], "customer-original-manuscript.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  sourceForm.set("extractedText", manuscript);
  sourceForm.set("title", "Creator Momentum System");
  sourceForm.set("format", "docx");
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
  setupForm.set("publicationTitle", "Creator Momentum System");
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
        "X-Kairos-Operation-Id": "locked-five-package-test",
        "X-Kairos-Idempotency-Key": "locked-five-package-test",
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
  assert.equal(body.packageContract, PACKAGE_CONTRACT);
  assert.equal(build.status, "COMPLETED");
  assert.equal(build.metadata.packageContract, PACKAGE_CONTRACT);
  assert.equal(build.metadata.packageFileCount, 5);
  assert.equal(build.metadata.packageContentsVerified, true);
  assert.equal(build.metadata.uploadedCoverIncluded, true);
  assert.equal(build.metadata.coverUsedInDigitalAsset, true);
  assert.equal(build.metadata.coverUsedInFullWrap, true);
  assert.equal(build.metadata.goldMasterFormat, "DOCX");
  assert.equal(build.metadata.kdpInteriorFormat, "PDF");
  assert.equal(build.metadata.kdpFullWrapFormat, "PDF");
  assert.equal(build.metadata.originalCoverChecksum, await sha256(coverBytes));

  const nonZipArtifacts = build.artifacts.filter((artifact) => artifact.kind !== "ZIP_ARCHIVE");
  assert.deepEqual(nonZipArtifacts.map((artifact) => artifact.kind), REQUIRED_KINDS);
  assert.equal(build.artifacts.length, 6);

  const goldMaster = build.artifacts.find((artifact) => artifact.kind === "GOLD_MASTER_DOCX");
  const digital = build.artifacts.find((artifact) => artifact.kind === "DIGITAL_ASSET_PDF");
  const interior = build.artifacts.find((artifact) => artifact.kind === "KDP_INTERIOR_PDF");
  const wrap = build.artifacts.find((artifact) => artifact.kind === "KDP_FULL_WRAP_COVER_PDF");
  const cover = build.artifacts.find((artifact) => artifact.kind === "STANDALONE_COVER_IMAGE");
  assert.equal(goldMaster.filename, "Creator_Momentum_System_Gold_Master.docx");
  assert.equal(goldMaster.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(digital.filename, "Creator_Momentum_System_Digital_Asset.pdf");
  assert.equal(interior.filename, "Creator_Momentum_System_Interior.pdf");
  assert.equal(wrap.filename, "Creator_Momentum_System_Full_Wrap.pdf");
  assert.equal(cover.filename, "Creator_Momentum_System_Cover.png");
  assert.equal(cover.sha256, await sha256(coverBytes));

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
  assert.equal(zipResponse.headers.get("X-Kairos-Manuscript-Package-Contract"), PACKAGE_CONTRACT);

  const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
  const entries = zipEntries(zipBytes);
  assert.deepEqual([...entries.keys()], [
    "Creator_Momentum_System_Gold_Master.docx",
    "Creator_Momentum_System_Digital_Asset.pdf",
    "Creator_Momentum_System_Interior.pdf",
    "Creator_Momentum_System_Full_Wrap.pdf",
    "Creator_Momentum_System_Cover.png",
  ]);
  assert.equal(entries.size, 5);
  assert.equal(startsWithAscii(entries.get("Creator_Momentum_System_Gold_Master.docx"), "PK"), true);
  assert.equal(startsWithAscii(entries.get("Creator_Momentum_System_Digital_Asset.pdf"), "%PDF-"), true);
  assert.equal(startsWithAscii(entries.get("Creator_Momentum_System_Interior.pdf"), "%PDF-"), true);
  assert.equal(startsWithAscii(entries.get("Creator_Momentum_System_Full_Wrap.pdf"), "%PDF-"), true);
  assert.deepEqual(entries.get("Creator_Momentum_System_Cover.png"), coverBytes);

  const docxEntries = zipEntries(entries.get("Creator_Momentum_System_Gold_Master.docx"));
  assert.ok(docxEntries.has("[Content_Types].xml"));
  assert.ok(docxEntries.has("word/document.xml"));
  const documentXml = new TextDecoder().decode(docxEntries.get("word/document.xml"));
  assert.match(documentXml, /Creator Momentum System/);
  assert.match(documentXml, /Approved final manuscript content/);

  const packageText = new TextDecoder("latin1").decode(zipBytes);
  assert.doesNotMatch(packageText, /final-manuscript\.md|editable-manuscript\.html|manifest\.json|original-source/i);
  assert.doesNotMatch(packageText, /BARCODE AREA/i);
});
