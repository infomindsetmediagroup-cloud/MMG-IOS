import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/manuscript-project-setup.js"),
  "utf8",
);

test("mobile manuscript setup uses a bounded two-phase transaction", () => {
  assert.match(source, /kairos-manuscript-project-setup-ui-20260722-2/);
  assert.match(source, /setup\/cover/);
  assert.match(source, /method:\s*"PUT"/);
  assert.match(source, /"Content-Type":\s*"application\/json"/);
  assert.match(source, /X-Kairos-Operation-Id/);
  assert.match(source, /X-Kairos-Idempotency-Key/);
  assert.match(source, /AbortController/);
  assert.match(source, /COVER_TIMEOUT_MS\s*=\s*90_000/);
  assert.match(source, /SETUP_TIMEOUT_MS\s*=\s*30_000/);
  assert.match(source, /Check saved status/);
  assert.match(source, /resumeExisting/);
  assert.match(source, /recover\(projectId/);
  assert.doesNotMatch(source, /new FormData\(\)/);
});

test("the setup client preserves a retryable draft and never leaves busy set forever", () => {
  assert.match(source, /draft\s*=\s*nextDraft/);
  assert.match(source, /coverStored/);
  assert.match(source, /finally\s*\{[\s\S]*busy\s*=\s*false/);
  assert.match(source, /Kairos did not respond in time/);
  assert.match(source, /two-phase-resumable/);
});
