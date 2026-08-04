import assert from "node:assert/strict";
import test from "node:test";

import { handleManuscriptSourceObjectRequest } from "../src/kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "../src/kairos-manuscript-project-setup-v1.js";
import { handleManuscriptEditorialObjectRequest } from "../src/kairos-manuscript-editorial-workbench-v1.js";
import { handleManuscriptDeliverablesObjectRequest } from "../src/kairos-manuscript-deliverables-http-v1.js";

function createState() {
  const map = new Map();
  return {
    storage: {
      async get(key) {
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
        map.delete(key);
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

test("deterministic deliverables use the checksum-verified final editorial manuscript", async () => {
  const state = createState();
  const projectId = "approved-editorial-deliverables-12345678";
  const original = `${"ORIGINAL INTAKE TEXT that must not become the final manuscript. ".repeat(20)}End original.`;
  const approved = `${"APPROVED FINAL EDITORIAL TEXT used for every manufactured manuscript artifact. ".repeat(24)}End approved.`;

  const form = new FormData();
  form.set("file", new File([original], "original-intake.txt", { type: "text/plain" }));
  form.set("extractedText", original);
  form.set("title", "Approved Editorial Deliverables Test");
  form.set("format", "txt");
  const sourceResponse = await handleManuscriptSourceObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, {
      method: "POST",
      body: form,
    }),
  );
  assert.equal(sourceResponse.status, 201);

  const setupResponse = await handleManuscriptProjectSetupObjectRequest(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authorName: "MMG Test Author",
        publicationTitle: "Approved Editorial Deliverables Test",
        service: "complete-publishing-package",
        edition: "multi-format",
        trimSize: "6x9",
        isbnStatus: "not-required",
      }),
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

  assert.equal(buildResponse.status, 201);
  const buildBody = await buildResponse.json();
  assert.equal(buildBody.status, "completed");
  assert.equal(buildBody.manuscriptAuthority, "checksum-verified-final-editorial-version");
  assert.equal(buildBody.approvedEditorial.versionId, versionId);
  assert.equal(buildBody.deliverablesBuild.status, "COMPLETED");
  assert.equal(buildBody.deliverablesBuild.artifacts.length, 12);
  assert.equal(
    buildBody.deliverablesBuild.metadata.manuscriptAuthority,
    "checksum-verified-final-editorial-version",
  );

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
  assert.equal(zipResponse.headers.get("Content-Type"), "application/zip");
  const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
  assert.ok(zipBytes.byteLength > 1_000);
  const zipText = new TextDecoder().decode(zipBytes);
  assert.match(zipText, /APPROVED FINAL EDITORIAL TEXT/);
  assert.doesNotMatch(zipText, /ORIGINAL INTAKE TEXT/);
});
