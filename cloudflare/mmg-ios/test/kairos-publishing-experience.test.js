import assert from "node:assert/strict";
import test from "node:test";

import { handlePublishingExperience } from "../src/kairos-publishing-experience-v1.js";

const PROJECT_ID = "manuscript-package-approval-12345678";

function packageRecord() {
  return {
    status: "production-ready",
    projectId: PROJECT_ID,
    signature: "approved-package-signature",
    vault: {
      assetCount: 6,
      integrity: { passed: true },
      packageDownloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/package`,
    },
  };
}

function memoryStub(initial = null) {
  let record = initial;
  const requests = [];
  return {
    async fetch(input, init) {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request.method);
      if (request.method === "GET") {
        return record
          ? Response.json(record)
          : Response.json({ error: { code: "not_found" } }, { status: 404 });
      }
      if (request.method === "PUT") {
        record = await request.json();
        return Response.json(record, { status: 201 });
      }
      return Response.json({ error: { code: "method_not_allowed" } }, { status: 405 });
    },
    get record() {
      return record;
    },
    requests,
  };
}

test("package approval reads the dedicated shard and preserves approval in both stores", async () => {
  const dedicated = memoryStub(packageRecord());
  const legacy = memoryStub(packageRecord());
  const env = {
    KAIROS_MANUSCRIPT_SOURCES: {
      idFromName(name) {
        assert.equal(name, PROJECT_ID);
        return `source:${name}`;
      },
      get(id) {
        assert.equal(id, `source:${PROJECT_ID}`);
        return dedicated;
      },
    },
    KAIROS_PROJECTS: {
      idFromName(name) {
        assert.equal(name, "mmg-production-project-registry");
        return `registry:${name}`;
      },
      get() {
        return legacy;
      },
    },
  };
  const request = new Request(
    `https://kairos.test/api/production-registry/manuscripts/${PROJECT_ID}/experience/approve-package`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "APPROVE PACKAGE", actor: "MMG Executive" }),
    },
  );

  const response = await handlePublishingExperience(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "package-approved");
  assert.equal(body.packageApproval.approved, true);
  assert.equal(dedicated.record.status, "package-approved");
  assert.equal(legacy.record.status, "package-approved");
  assert.deepEqual(dedicated.requests, ["GET", "PUT"]);
  assert.deepEqual(legacy.requests, ["PUT"]);
});
