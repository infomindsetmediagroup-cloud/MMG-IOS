import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCanonicalManuscriptRequest,
} from "../src/kairos-manuscript-canonical-identity-router-v1.js";

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function environment() {
  const projects = [{
    projectId: "PUB-SAVED-BOOK-2026",
    publicProjectId: "PUB-SAVED-BOOK-2026",
    sourceProjectId: "stale-source-project-0001",
    sourceReleaseId: "canonical-source-project-9001",
    manuscriptProjectId: "stale-source-project-0001",
    projectType: "manuscript-studio",
    status: "ready-for-manufacturing",
  }];

  const probes = [];
  const sourceStubs = new Map();
  const stubFor = id => ({
    async fetch(request) {
      const url = new URL(request.url);
      probes.push({ id, path: url.pathname });
      if (id === "canonical-source-project-9001" && url.pathname.endsWith("/source/text")) {
        return response({ status: "ready", manuscript: "Canonical manuscript body" });
      }
      if (id === "canonical-source-project-9001" && url.pathname.endsWith("/editorial")) {
        return response({ status: "ready", editorial: { status: "ready-for-manufacturing" } });
      }
      return response({ status: "not-found" }, 404);
    },
  });

  return {
    probes,
    env: {
      KAIROS_PROJECTS: {
        idFromName: name => name,
        get: () => ({
          fetch: async () => response({ projects }),
        }),
      },
      KAIROS_MANUSCRIPT_SOURCES: {
        idFromName: name => name,
        get: id => {
          if (!sourceStubs.has(id)) sourceStubs.set(id, stubFor(id));
          return sourceStubs.get(id);
        },
      },
    },
  };
}

test("rewrites a stale public manuscript identity to the canonical source shard", async () => {
  const { env } = environment();
  const original = new Request(
    "https://kairos.test/api/production-registry/manuscripts/PUB-SAVED-BOOK-2026/source/text",
  );

  const resolved = await resolveCanonicalManuscriptRequest(original, env);
  const url = new URL(resolved.request.url);

  assert.equal(resolved.resolved, true);
  assert.equal(resolved.requestedProjectId, "PUB-SAVED-BOOK-2026");
  assert.equal(resolved.canonicalProjectId, "canonical-source-project-9001");
  assert.match(url.pathname, /canonical-source-project-9001\/source\/text$/);
  assert.equal(
    resolved.request.headers.get("X-Kairos-Requested-Manuscript-Project"),
    "PUB-SAVED-BOOK-2026",
  );
});

test("routes final-delivery mutations to the shard that owns the manuscript", async () => {
  const { env } = environment();
  const original = new Request(
    "https://kairos.test/api/production-registry/manuscripts/stale-source-project-0001/deliverables/build",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true }),
    },
  );

  const resolved = await resolveCanonicalManuscriptRequest(original, env);
  const url = new URL(resolved.request.url);

  assert.equal(resolved.resolved, true);
  assert.equal(resolved.request.method, "POST");
  assert.match(url.pathname, /canonical-source-project-9001\/deliverables\/build$/);
  assert.deepEqual(await resolved.request.json(), { approved: true });
});

test("does not alter unrelated application routes", async () => {
  const { env, probes } = environment();
  const original = new Request("https://kairos.test/api/health");
  const resolved = await resolveCanonicalManuscriptRequest(original, env);

  assert.equal(resolved.resolved, false);
  assert.equal(resolved.request.url, original.url);
  assert.equal(probes.length, 0);
});
