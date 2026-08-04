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
const runtimeLoader = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/kairos-runtime-loader.js"),
  "utf8",
);
const loader = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/legacy-runtime-loader.js"),
  "utf8",
);
const localInference = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/kairos-local-inference.js"),
  "utf8",
);
const manuscriptStudio = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/manuscript-studio.js"),
  "utf8",
);
const postIntakeGuard = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/manuscript-post-intake-guard.js"),
  "utf8",
);
const productionBootstrap = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js"),
  "utf8",
);
const productionController = readFileSync(
  resolve(process.cwd(), "../../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js"),
  "utf8",
);

function activeScripts() {
  return loader.match(/const SCRIPT_FILES = \[([\s\S]*?)\];/)?.[1] || "";
}

test("mobile manuscript setup is a complete initialized controller", () => {
  assert.match(source, /kairos-manuscript-project-setup-ui-20260803-4-flow-recovery/);
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

test("the five-center dashboard loads guarded chunked Studio and local production assets", () => {
  assert.match(index, /kairos-five-center-dashboard-post-intake-20260731-1/);
  assert.match(index, /legacy-runtime-loader\.js\?v=five-center-manuscript-flow-recovery-20260803-3/);
  assert.match(index, /manuscript-production-flow-bootstrap\.js\?v=manuscript-flow-recovery-20260803-3/);
  assert.match(index, /manuscript-auto-pipeline\.js\?v=five-center-manuscript-flow-recovery-20260803-3/);
  assert.match(index, /manuscript-post-intake-guard\.js\?v=five-center-manuscript-flow-recovery-20260803-3/);
  assert.doesNotMatch(index, /executive-local-inference\.js/);
  assert.doesNotMatch(index, /kairos-runtime-loader\.js/);
  assert.doesNotMatch(index, /manuscript-docx-upload-hotfix\.js/);
  assert.doesNotMatch(index, /<script[^>]+manuscript-studio\.js/);
  assert.doesNotMatch(index, /<script[^>]+manuscript-project-setup\.js/);
  assert.match(runtimeLoader, /import "\.\/legacy-runtime-loader\.js"/);
  assert.doesNotMatch(runtimeLoader, /executive-local-inference\.js/);
  assert.match(loader, /const BUILD = "kairos-five-center-runtime-loader-20260803-4-flow-recovery"/);
  assert.match(loader, /const RELEASE = "five-center-dashboard-restored-20260803-3"/);
  assert.match(loader, /const ASSET_RELEASE = "five-center-manuscript-flow-recovery-20260803-3"/);
  assert.match(loader, /commandHubMode/);
  assert.match(loader, /"command-hub\.js"/);
  assert.match(loader, /"kairos-local-inference\.js"/);
  assert.match(loader, /"manuscript-post-intake-guard\.js"/);
  assert.match(loader, /"manuscript-studio\.js"/);
  assert.match(loader, /"manuscript-project-setup\.js"/);
  assert.match(loader, /"manuscript-auto-pipeline\.js"/);
  assert.doesNotMatch(activeScripts(), /manuscript-docx-upload-hotfix\.js/);
  assert.match(loader, /if \(commandHubMode\) loadCommandRuntime\(\)/);
  assert.match(localInference, /kairos-local-inference-same-origin\.js/);
  assert.match(postIntakeGuard, /duplicate Manuscript Studio module blocked/);
  assert.match(postIntakeGuard, /success-overlay-restored/);
  assert.match(productionBootstrap, /five-center-manuscript-flow-recovery-20260803-3/);
  assert.match(productionBootstrap, /manuscript-flow-recovery-20260803-3/);
  assert.match(productionController, /KairosLocalInference/);
  assert.match(productionController, /data-start-local-production/);
  assert.doesNotMatch(productionController, /generation-job|Start Production Job/);
  const guardIndex = activeScripts().indexOf('"manuscript-post-intake-guard.js"');
  const studioIndex = activeScripts().indexOf('"manuscript-studio.js"');
  const setupIndex = activeScripts().indexOf('"manuscript-project-setup.js"');
  const inferenceIndex = activeScripts().indexOf('"kairos-local-inference.js"');
  const productionIndex = activeScripts().indexOf('"manuscript-auto-pipeline.js"');
  assert.ok(guardIndex > -1);
  assert.ok(studioIndex > guardIndex);
  assert.ok(setupIndex > studioIndex);
  assert.ok(inferenceIndex > setupIndex);
  assert.ok(productionIndex > inferenceIndex);
  assert.match(manuscriptStudio, /manuscript-studio-flow-recovery-20260803-3/);
  assert.match(manuscriptStudio, /chunkedSourceUpload:\s*true/);
  assert.match(manuscriptStudio, /multipartSourceUpload:\s*false/);
  assert.match(manuscriptStudio, /FILE_CHUNK_BYTES = 512 \* 1024/);
  assert.match(manuscriptStudio, /TEXT_CHUNK_BYTES = 128 \* 1024/);
  assert.match(manuscriptStudio, /sourcePath\(projectId, "session"\)/);
  assert.match(manuscriptStudio, /sourcePath\(projectId, "commit"\)/);
  assert.doesNotMatch(manuscriptStudio, /new FormData/);
});
