import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { handleManuscriptRequest } from "../src/manuscript-studio-v1.js";

const TARGET_CHARACTERS = 279045;

function manuscriptOfLength(length) {
  const seed = "Cinematic AI video creation, viral content systems, commercial prompt engineering, and modern AI filmmaking. ";
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

test("the intake handler accepts the real 279045-character production payload", async () => {
  const manuscript = manuscriptOfLength(TARGET_CHARACTERS);
  const response = await handleManuscriptRequest(new Request("https://kairos.test/api/manuscript/intake/advance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MMG-Client-Build": "manuscript-studio-direct-chunks-20260730-4",
    },
    body: JSON.stringify({
      title: "AI Video Prompt Mastery",
      manuscript,
      source: {
        projectId: "manuscript-studio-direct-intake-12345678",
        name: "AI-Video-Prompt-Mastery.docx",
        filename: "AI-Video-Prompt-Mastery.docx",
        format: "docx",
        size: 15728640,
        stored: true,
        uploadMode: "chunked-v1",
        checksum: "a".repeat(64),
      },
    }),
  }));

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-kairos-manuscript-studio"), "kairos-manuscript-studio-20260717-5");

  const body = await response.json();
  assert.equal(body.status, "production_intake");
  assert.equal(body.manuscript.characterCount, TARGET_CHARACTERS);
  assert.equal(body.manuscript.extractionStatus, "validated");
  assert.equal(body.workflow.externalActionTaken, false);
  assert.equal(body.workflow.automatedIntelligenceUsed, false);
});

test("the canonical Worker intercepts intake before identity, source, and downstream runtime routing", async () => {
  const source = await readFile(new URL("../src/kairos-production-entry-local-canonical-v1.js", import.meta.url), "utf8");
  assert.match(source, /import \{ handleManuscriptRequest \} from "\.\/manuscript-studio-v1\.js"/);
  assert.match(source, /"\/api\/manuscript\/intake\/advance"/);
  assert.match(source, /code: "MANUSCRIPT_INTAKE_FAILED"/);

  const directIndex = source.indexOf("DIRECT_MANUSCRIPT_PATHS.has(url.pathname)");
  const identityIndex = source.indexOf("resolveCanonicalManuscriptRequest(request, env)");
  const sourceShardIndex = source.indexOf("handleDedicatedManuscriptSource(canonicalRequest, env)");
  const downstreamIndex = source.indexOf("canonicalRuntime.fetch(request, runtimeEnv, ctx)");
  assert.ok(directIndex > 0, "direct manuscript route must exist");
  assert.ok(identityIndex > directIndex, "canonical identity resolution must run after direct intake");
  assert.ok(sourceShardIndex > identityIndex, "source-shard routing must use the canonical request");
  assert.ok(downstreamIndex > sourceShardIndex, "direct intake must run before the downstream runtime chain");
});
