import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "../src/kairos-manuscript-project-setup-v1.js";
import { handleManuscriptEditorialObjectRequest } from "../src/kairos-manuscript-editorial-workbench-v1.js";
import { handleManuscriptDeliverablesObjectRequest } from "../src/kairos-manuscript-deliverables-http-v1.js";

const PACKAGE_CONTRACT = "mmg-digital-asset-edition-v2-customer-package-v1";
const REQUIRED_KINDS = [
  "CUSTOMER_SPEC_SHEET_PDF",
  "KDP_INTERIOR_PDF",
  "DIGITAL_EDITION_V2_PDF",
  "COVER_PORTRAIT_PNG",
  "COVER_THUMBNAIL_PNG",
  "README_TXT",
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

function substantiveManuscript() {
  const practical = "framework workflow checklist worksheet template prompt lab action step decision rule implementation";
  const chapters = [];
  for (let chapter = 1; chapter <= 12; chapter += 1) {
    const paragraphs = [];
    for (let section = 1; section <= 24; section += 1) {
      const sentences = [];
      for (let sentence = 1; sentence <= 5; sentence += 1) {
        sentences.push(`Chapter ${chapter}, section ${section}, lesson ${sentence} develops a distinct cinematic production principle through subject direction, camera movement, lighting logic, motion continuity, visual pacing, audience intent, commercial application, and measurable revision criteria ${chapter}-${section}-${sentence}.`);
      }
      paragraphs.push(`${practical}. ${sentences.join(" ")}`);
    }
    chapters.push(`Chapter ${chapter} — Production System ${chapter}\n\n${paragraphs.join("\n\n")}`);
  }
  return `Introduction\n\nThis premium field guide establishes a practical operating system for cinematic AI video production.\n\n${chapters.join("\n\n")}\n\nFinal Conclusion\n\nApply the systems deliberately, validate every output, and improve through documented iteration.`;
}

function pngDimensions(bytes) {
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function createProject(state, projectId, manuscript, coverBytes) {
  const sourceForm = new FormData();
  sourceForm.set("file", new File([manuscript], "approved-production-manuscript.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  sourceForm.set("extractedText", manuscript);
  sourceForm.set("title", "AI Video Prompt Mastery");
  sourceForm.set("format", "docx");
  const sourceResponse = await handleManuscriptSourceObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, { method: "POST", body: sourceForm }),
  );
  assert.equal(sourceResponse.status, 201);

  const setupForm = new FormData();
  setupForm.set("authorName", "Michael King");
  setupForm.set("publicationTitle", "AI Video Prompt Mastery");
  setupForm.set("service", "digital-asset-edition-v2");
  setupForm.set("edition", "Digital Asset Edition V2.0");
  setupForm.set("trimSize", "6x9");
  setupForm.set("isbnStatus", "not-required");
  setupForm.set("cover", new File([coverBytes], "approved-cover.png", { type: "image/png" }));
  const setupResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
      method: "POST",
      headers: { "X-Kairos-Operation-Id": "digital-asset-v2-test", "X-Kairos-Idempotency-Key": "digital-asset-v2-test" },
      body: setupForm,
    }),
  );
  assert.equal(setupResponse.status, 201, JSON.stringify(await setupResponse.clone().json()));
}

test("final manufacturing returns the exact title-specific six-file Digital Asset Edition V2 package", async () => {
  const state = createState();
  const projectId = "digital-asset-v2-package-12345678";
  const manuscript = substantiveManuscript();
  const coverBytes = Uint8Array.from(Buffer.from(COVER_BASE64, "base64"));
  await createProject(state, projectId, manuscript, coverBytes);

  const buildResponse = await handleManuscriptDeliverablesObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/deliverables/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "MANUFACTURE DIGITAL ASSET EDITION V2" }),
    }),
    { handleManuscriptSourceObjectRequest, handleManuscriptProjectSetupObjectRequest, handleManuscriptEditorialObjectRequest },
  );

  assert.equal(buildResponse.status, 201, JSON.stringify(await buildResponse.clone().json()));
  const body = await buildResponse.json();
  const build = body.deliverablesBuild;
  assert.equal(body.packageContract, PACKAGE_CONTRACT);
  assert.equal(build.status, "COMPLETED");
  assert.equal(build.metadata.packageContract, PACKAGE_CONTRACT);
  assert.equal(build.metadata.packageFileCount, 6);
  assert.equal(build.metadata.packageContentsVerified, true);
  assert.equal(build.metadata.customerFacingOnly, true);
  assert.equal(build.metadata.canvaExcluded, true);
  assert.ok(build.metadata.pageCount >= 100);

  const nonZipArtifacts = build.artifacts.filter((artifact) => artifact.kind !== "ZIP_ARCHIVE");
  assert.deepEqual(nonZipArtifacts.map((artifact) => artifact.kind), REQUIRED_KINDS);
  assert.equal(build.artifacts.length, 7);

  const expected = [
    "AI-Video-Prompt-Mastery_Customer-Spec-Sheet.pdf",
    "AI-Video-Prompt-Mastery_KDP-Interior_6x9.pdf",
    "AI-Video-Prompt-Mastery_Digital-Edition-V2.pdf",
    "AI-Video-Prompt-Mastery_Cover-Portrait_2048x3072.png",
    "AI-Video-Prompt-Mastery_Cover-Thumbnail_2048x2048.png",
    "AI-Video-Prompt-Mastery_README.txt",
  ];
  assert.deepEqual(nonZipArtifacts.map((artifact) => artifact.filename), expected);
  const zipArtifact = build.artifacts.find((artifact) => artifact.kind === "ZIP_ARCHIVE");
  assert.equal(zipArtifact.filename, "AI-Video-Prompt-Mastery_Digital-Asset-Edition-V2_Customer-Package.zip");

  const zipResponse = await handleManuscriptDeliverablesObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/deliverables/zip`),
    { handleManuscriptSourceObjectRequest, handleManuscriptProjectSetupObjectRequest, handleManuscriptEditorialObjectRequest },
  );
  assert.equal(zipResponse.status, 200);
  assert.equal(zipResponse.headers.get("X-Kairos-Manuscript-Package-Contract"), PACKAGE_CONTRACT);
  assert.equal(zipResponse.headers.get("X-Kairos-Manuscript-Package-File-Count"), "6");

  const packageFiles = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
  assert.deepEqual(Object.keys(packageFiles), expected);
  assert.equal(new TextDecoder().decode(packageFiles[expected[0]].slice(0, 5)), "%PDF-");
  assert.equal(new TextDecoder().decode(packageFiles[expected[1]].slice(0, 5)), "%PDF-");
  assert.equal(new TextDecoder().decode(packageFiles[expected[2]].slice(0, 5)), "%PDF-");
  assert.deepEqual(pngDimensions(packageFiles[expected[3]]), { width: 2048, height: 3072 });
  assert.deepEqual(pngDimensions(packageFiles[expected[4]]), { width: 2048, height: 2048 });

  const interior = await PDFDocument.load(packageFiles[expected[1]]);
  const digital = await PDFDocument.load(packageFiles[expected[2]]);
  const [interiorPage] = interior.getPages();
  const [digitalPage] = digital.getPages();
  assert.equal(Math.round(interiorPage.getWidth()), 432);
  assert.equal(Math.round(interiorPage.getHeight()), 648);
  assert.equal(Math.round(digitalPage.getWidth()), 612);
  assert.equal(Math.round(digitalPage.getHeight()), 792);
  assert.ok(interior.getPageCount() >= 100);
  assert.ok(digital.getPageCount() >= interior.getPageCount());

  const readme = new TextDecoder().decode(packageFiles[expected[5]]);
  for (const filename of expected) assert.match(readme, new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(readme, /Kairos|Shopify|Canva|\.docx|\.html|\.md|\.json/i);
});

test("Digital Asset Edition V2 rejects thin or duplicated manuscripts instead of padding the package", async () => {
  const state = createState();
  const projectId = "digital-asset-v2-thin-12345678";
  const manuscript = `Chapter 1 — Thin Draft\n\n${"Repeated filler paragraph without substantive development.\n\n".repeat(30)}`;
  const coverBytes = Uint8Array.from(Buffer.from(COVER_BASE64, "base64"));
  await createProject(state, projectId, manuscript, coverBytes);

  const response = await handleManuscriptDeliverablesObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/deliverables/build`, { method: "POST" }),
    { handleManuscriptSourceObjectRequest, handleManuscriptProjectSetupObjectRequest, handleManuscriptEditorialObjectRequest },
  );
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error.code, /digital_asset_v2_/);
});
