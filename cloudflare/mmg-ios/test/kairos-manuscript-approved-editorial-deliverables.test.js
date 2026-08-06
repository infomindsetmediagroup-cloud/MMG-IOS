import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";

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

function approvedManuscript() {
  const chapters = [];
  for (let chapter = 1; chapter <= 10; chapter += 1) {
    const paragraphs = [];
    for (let section = 1; section <= 50; section += 1) {
      paragraphs.push(`The approved editorial version develops production framework ${chapter}-${section} with a distinct workflow, checklist, worksheet, template, prompt lab, action step, decision rule, implementation sequence, camera strategy, movement constraint, lighting specification, audience objective, commercial use case, diagnostic method, and revision standard. Each lesson is independently written and preserves the approved customer-facing authority for manufacturing.`);
    }
    chapters.push(`Chapter ${chapter} — Approved Editorial System ${chapter}\n\n${paragraphs.join("\n\n")}`);
  }
  return `Introduction\n\nThis is the checksum-verified approved final editorial manuscript.\n\n${chapters.join("\n\n")}\n\nFinal Conclusion\n\nThe approved editorial system is complete and ready for customer delivery.`;
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
  assert.ok(response.ok, `${suffix} failed: ${JSON.stringify(await response.clone().json())}`);
  return response.json();
}

test("the canonical package uses only the checksum-verified approved final editorial manuscript", async () => {
  const state = createState();
  const projectId = "approved-editorial-digital-asset-v2-12345678";
  const original = `${"ORIGINAL INTAKE TEXT must never control final manufacturing. ".repeat(120)}End original.`;
  const approved = approvedManuscript();
  const coverBytes = Uint8Array.from(Buffer.from(COVER_BASE64, "base64"));

  const sourceForm = new FormData();
  sourceForm.set("file", new File([original], "original-intake.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  sourceForm.set("extractedText", original);
  sourceForm.set("title", "Approved Editorial Digital Asset");
  sourceForm.set("format", "docx");
  const sourceResponse = await handleManuscriptSourceObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, { method: "POST", body: sourceForm }),
  );
  assert.equal(sourceResponse.status, 201);

  const setup = new FormData();
  setup.set("authorName", "Michael King");
  setup.set("publicationTitle", "Approved Editorial Digital Asset");
  setup.set("service", "complete-publishing-package");
  setup.set("edition", "Digital Asset Edition V2.0");
  setup.set("trimSize", "6x9");
  setup.set("isbnStatus", "not-required");
  setup.set("cover", new File([coverBytes], "approved-cover.png", { type: "image/png" }));
  const setupResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
      method: "POST",
      headers: { "X-Kairos-Operation-Id": "approved-editorial-v2", "X-Kairos-Idempotency-Key": "approved-editorial-v2" },
      body: setup,
    }),
  );
  assert.equal(setupResponse.status, 201);

  const versionBody = await postEditorial(state, projectId, "versions", {
    manuscript: approved,
    passType: "final",
    label: "Approved Final Version",
    actor: "MMG Editorial Production",
  });
  const versionId = versionBody.version.versionId;
  await postEditorial(state, projectId, "review", { versionId, actor: "MMG Editorial Production" });
  await postEditorial(state, projectId, "decision", { decision: "approved", actor: "Executive" });
  await postEditorial(state, projectId, "finalize", { versionId, actor: "MMG Editorial Production" });

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
  assert.equal(body.status, "completed");
  assert.equal(body.manuscriptAuthority, "checksum-verified-final-editorial-version");
  assert.equal(body.approvedEditorial.versionId, versionId);
  assert.equal(body.packageContract, "mmg-digital-asset-edition-v2-customer-package-v1");
  assert.equal(body.deliverablesBuild.metadata.manuscriptAuthority, "checksum-verified-final-editorial-version");
  assert.equal(body.deliverablesBuild.metadata.approvedEditorial.versionId, versionId);
  assert.equal(body.deliverablesBuild.metadata.wordCount, (approved.match(/\b[\w’'-]+\b/g) || []).length);
  assert.ok(body.deliverablesBuild.metadata.wordCount > (original.match(/\b[\w’'-]+\b/g) || []).length);
  assert.ok(body.deliverablesBuild.metadata.pageCount >= 100);
  assert.equal(body.deliverablesBuild.metadata.packageFileCount, 6);

  const zipResponse = await handleManuscriptDeliverablesObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/deliverables/zip`),
    { handleManuscriptSourceObjectRequest, handleManuscriptProjectSetupObjectRequest, handleManuscriptEditorialObjectRequest },
  );
  assert.equal(zipResponse.status, 200);
  const files = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
  assert.equal(Object.keys(files).length, 6);
  assert.ok(Object.keys(files).every((name) => name.startsWith("Approved-Editorial-Digital-Asset_")));
  assert.ok(!Object.keys(files).some((name) => /original|source|docx|html|markdown|json/i.test(name)));

  const readmeName = Object.keys(files).find((name) => name.endsWith("_README.txt"));
  const readme = new TextDecoder().decode(files[readmeName]);
  assert.doesNotMatch(readme, /ORIGINAL INTAKE TEXT|Michael King|Kairos|Shopify|Canva/i);
});
