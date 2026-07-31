import assert from "node:assert/strict";
import test from "node:test";

import runtime, { KAIROS_LOCAL_CANONICAL_ENTRY_BUILD } from "../src/kairos-production-entry-local-canonical-v1.js";

const TARGET_CHARACTERS = 279045;

function manuscriptOfLength(length) {
  const seed = "Cinematic AI video creation, viral content systems, commercial prompt engineering, and modern AI filmmaking. ";
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

test("canonical boundary accepts the real 279045-character production intake directly", async () => {
  const manuscript = manuscriptOfLength(TARGET_CHARACTERS);
  const response = await runtime.fetch(new Request("https://kairos.test/api/manuscript/intake/advance", {
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
  }), {}, {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-kairos-canonical-local"), KAIROS_LOCAL_CANONICAL_ENTRY_BUILD);
  assert.equal(response.headers.get("x-kairos-manuscript-studio"), "kairos-manuscript-studio-20260717-5");
  assert.equal(response.headers.get("x-kairos-openai-calls"), "disabled");

  const body = await response.json();
  assert.equal(body.status, "production_intake");
  assert.equal(body.manuscript.characterCount, TARGET_CHARACTERS);
  assert.equal(body.manuscript.extractionStatus, "validated");
  assert.equal(body.workflow.externalActionTaken, false);
  assert.equal(body.workflow.automatedIntelligenceUsed, false);
});

test("canonical boundary returns a structured JSON error for malformed intake JSON", async () => {
  const response = await runtime.fetch(new Request("https://kairos.test/api/manuscript/intake/advance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  }), {}, {});

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type") || "", /^application\/json/);
  const body = await response.json();
  assert.equal(body.status, "failed");
  assert.equal(body.error.code, "MANUSCRIPT_INTAKE_FAILED");
  assert.equal(body.error.retriable, true);
});
