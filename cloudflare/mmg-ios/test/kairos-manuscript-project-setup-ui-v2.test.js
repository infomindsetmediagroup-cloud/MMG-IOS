import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/manuscript-project-setup.js"),
  "utf8",
);
const index = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/index.html"),
  "utf8",
);
const loader = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/legacy-runtime-loader.js"),
  "utf8",
);
const docxResolver = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/manuscript-docx-upload-hotfix.js"),
  "utf8",
);

test("mobile manuscript setup is a complete initialized controller", () => {
  assert.match(source, /kairos-manuscript-project-setup-ui-20260722-3/);
  assert.match(source, /function init\(\)/);
  assert.match(source, /function activeProjectId\(\)/);
  assert.match(source, /function currentTitle\(\)/);
  assert.match(source, /function esc\(value\)/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /document\.addEventListener\("click", handleClick, true\)/);
  assert.match(source, /KairosManuscriptSetupController/);
  assert.match(source, /init\(\);/);
});

test("mobile manuscript setup uses a bounded two-phase transaction", () => {
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

test("the controller preserves retry state and always clears busy", () => {
  assert.match(source, /state\.draft\s*=\s*nextDraft/);
  assert.match(source, /coverStored/);
  assert.match(source, /finally\s*\{[\s\S]*state\.busy\s*=\s*false/);
  assert.match(source, /Kairos did not respond in time/);
});

test("the clean dashboard defers manuscript modules to isolated advanced operations", () => {
  assert.match(index, /kairos-executive-clean-boot-20260729-1/);
  assert.match(index, /legacy-runtime-loader\.js\?v=legacy-docx-export-resolver-20260730-1/);
  assert.doesNotMatch(index, /manuscript-docx-upload-hotfix\.js/);
  assert.doesNotMatch(index, /manuscript-studio\.js/);
  assert.doesNotMatch(index, /manuscript-project-setup\.js/);
  assert.match(loader, /const RELEASE = "manuscript-docx-export-resolver-20260730-1"/);
  assert.match(loader, /"manuscript-docx-upload-hotfix\.js"/);
  assert.match(loader, /"manuscript-studio\.js"/);
  assert.match(loader, /"manuscript-project-setup\.js"/);
  assert.match(loader, /if \(advancedMode\) loadLegacyRuntime\(\)/);
  const resolverIndex = loader.indexOf('"manuscript-docx-upload-hotfix.js"');
  const studioIndex = loader.indexOf('"manuscript-studio.js"');
  const setupIndex = loader.indexOf('"manuscript-project-setup.js"');
  assert.ok(resolverIndex > -1);
  assert.ok(studioIndex > resolverIndex);
  assert.ok(setupIndex > studioIndex);
  assert.match(docxResolver, /typeof candidate\?\.extractRawText === "function"/);
});
