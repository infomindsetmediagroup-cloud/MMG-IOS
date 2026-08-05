import assert from "node:assert/strict";
import test from "node:test";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "../src/kairos-manuscript-project-setup-v1.js";
import { handleManuscriptEditorialObjectRequest } from "../src/kairos-manuscript-editorial-workbench-v1.js";
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

async function json(response) {
  return response.clone().json();
}

async function postEditorial(state, projectId, suffix, body) {
  const response = await handleManuscriptEditorialObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/editorial/${suffix}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  assert.ok(response.ok, `${suffix} failed: ${JSON.stringify(await json(response))}`);
  return json(response);
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
    assert.equal(method, 0);
    const filenameStart = offset + 30;
    const dataStart = filenameStart + filenameLength + extraLength;
    const filename = new TextDecoder().decode(bytes.slice(filenameStart, filenameStart + filenameLength));
    entries.set(filename, bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return entries;
}

test("the five-file delivery package uses the checksum-verified final editorial manuscript", async () => {
  const state = createState();
  const projectId = "approved-editorial-deliverables-12345678";
  const original = `${"ORIGINAL INTAKE TEXT that must never become a manufactured manuscript deliverable. ".repeat(20)}End original.`;
  const approved = `${"APPROVED FINAL EDITORIAL TEXT used for every manufactured manuscript deliverable. ".repeat(40)}End approved.`;
  const coverBytes = Uint8Array.from(Buffer.from(COVER_BASE64, "base64"));

  const form = new FormData();
  form.set("file", new File([original], "original-intake.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  form.set("extractedText", original);
  form.set("title", "Approved Editorial Deliverables Test");
  form.set("format", "docx");
  const sourceResponse = await handleManuscriptSourceObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, {
      method: "POST",
      body: form,
    }),
  );
  assert.equal(sourceResponse.status, 201);

  const setup = new FormData();
  setup.set("authorName", "MMG Test Author");
  setup.set("publicationTitle", "Approved Editorial Deliverables Test");
  setup.set("service", "complete-publishing-package");
  setup.set("edition", "multi-format");
  setup.set("trimSize", "6x9");
  setup.set("isbnStatus", "not-required");
  setup.set("cover", new File([coverBytes], "approved-editorial-cover.png", { type: "image/png" }));
  const setupResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
      method: "POST",
      headers: {
        "X-Kairos-Operation-Id": "approved-editorial-package-test",
        "X-Kairos-Idempotency-Key": "approved-editorial-package-test",
      },
      body: setup,
    }),
  );
  assert.equal(setupResponse.status, 201, JSON.stringify(await setupResponse.clone().json()));

  const versionBody = await postEditorial(state, projectId, "versions", {
    manuscript: approved,
    passType: "final",
    label: "Approved Final Version",
    actor: "MMG Editorial Production",
  });
  const versionId = versionBody.version.versionId;

  await postEditorial(state, projectId, "review", {
    versionId,
    actor: "MMG Editorial Production",
  });
  await postEditorial(state, projectId, "decision", {
    decision: "approved",
    actor: "Executive",
  });
  await postEditorial(state, projectId, "finalize", {
    versionId,
    actor: "MMG Editorial Production",
  });

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
  const buildBody = await buildResponse.json();
  assert.equal(buildBody.status, "completed");
  assert.equal(buildBody.manuscriptAuthority, "checksum-verified-final-editorial-version");
  assert.equal(buildBody.approvedEditorial.versionId, versionId);
  assert.equal(buildBody.packageContract, "mmg-locked-five-asset-kdp-delivery-package-v1");
  assert.equal(buildBody.deliverablesBuild.status, "COMPLETED");
  assert.equal(buildBody.deliverablesBuild.artifacts.length, 6);
  assert.equal(buildBody.deliverablesBuild.metadata.packageFileCount, 5);
  assert.equal(buildBody.deliverablesBuild.metadata.manuscriptAuthority, "checksum-verified-final-editorial-version");
  assert.equal(buildBody.deliverablesBuild.metadata.uploadedCoverIncluded, true);

  const kinds = buildBody.deliverablesBuild.artifacts.map((artifact) => artifact.kind);
  assert.deepEqual(kinds, [
    "GOLD_MASTER_DOCX",
    "DIGITAL_ASSET_PDF",
    "KDP_INTERIOR_PDF",
    "KDP_FULL_WRAP_COVER_PDF",
    "STANDALONE_COVER_IMAGE",
    "ZIP_ARCHIVE",
  ]);

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
  const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
  const packageEntries = zipEntries(zipBytes);
  assert.deepEqual([...packageEntries.keys()], [
    "Approved_Editorial_Deliverables_Test_Gold_Master.docx",
    "Approved_Editorial_Deliverables_Test_Digital_Asset.pdf",
    "Approved_Editorial_Deliverables_Test_Interior.pdf",
    "Approved_Editorial_Deliverables_Test_Full_Wrap.pdf",
    "Approved_Editorial_Deliverables_Test_Cover.png",
  ]);

  const docxBytes = packageEntries.get("Approved_Editorial_Deliverables_Test_Gold_Master.docx");
  const docxEntries = zipEntries(docxBytes);
  const documentXml = new TextDecoder().decode(docxEntries.get("word/document.xml"));
  assert.match(documentXml, /APPROVED FINAL EDITORIAL TEXT/);
  assert.doesNotMatch(documentXml, /ORIGINAL INTAKE TEXT/);

  const interiorText = new TextDecoder("latin1").decode(packageEntries.get("Approved_Editorial_Deliverables_Test_Interior.pdf"));
  const digitalText = new TextDecoder("latin1").decode(packageEntries.get("Approved_Editorial_Deliverables_Test_Digital_Asset.pdf"));
  assert.match(interiorText, /APPROVED FINAL EDITORIAL TEXT/);
  assert.match(digitalText, /APPROVED FINAL EDITORIAL TEXT/);
  assert.doesNotMatch(interiorText, /ORIGINAL INTAKE TEXT/);
  assert.doesNotMatch(digitalText, /ORIGINAL INTAKE TEXT/);
  assert.deepEqual(packageEntries.get("Approved_Editorial_Deliverables_Test_Cover.png"), coverBytes);

  const packageText = new TextDecoder("latin1").decode(zipBytes);
  assert.doesNotMatch(packageText, /original-intake|ORIGINAL INTAKE TEXT|final-manuscript\.md|editable-manuscript\.html/i);
});
