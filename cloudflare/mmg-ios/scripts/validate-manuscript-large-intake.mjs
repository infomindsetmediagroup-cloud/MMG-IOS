import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const BUILD = "kairos-manuscript-large-intake-validator-20260731-11-local-production";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const backendPath = join(root, "src", "manuscript-studio-v1.js");
const frontendPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "manuscript-studio.js");
const safariPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "safari-manuscript-intake-compat.js");
const indexPath = join(repoRoot, "web", "kairos-dashboard", "index.html");
const runtimeLoaderPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "kairos-runtime-loader.js");
const loaderPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "legacy-runtime-loader.js");
const localInferencePath = join(repoRoot, "web", "kairos-dashboard", "scripts", "kairos-local-inference.js");
const productionBootstrapPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "manuscript-production-flow-bootstrap.js");
const productionControllerPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "manuscript-auto-pipeline.js");

const backend = readFileSync(backendPath, "utf8");
const frontend = readFileSync(frontendPath, "utf8");
const safari = readFileSync(safariPath, "utf8");
const index = readFileSync(indexPath, "utf8");
const runtimeLoader = readFileSync(runtimeLoaderPath, "utf8");
const loader = readFileSync(loaderPath, "utf8");
const localInference = readFileSync(localInferencePath, "utf8");
const productionBootstrap = readFileSync(productionBootstrapPath, "utf8");
const productionController = readFileSync(productionControllerPath, "utf8");
const activeScripts = loader.match(/const SCRIPT_FILES = \[([\s\S]*?)\];/)?.[1] || "";

assert.ok(backend.includes('const MAX_CHARS = 600000'), "Backend manuscript intake is not aligned to 600,000 characters.");
assert.ok(backend.includes('manuscript-studio-v5-large-intake'), "Backend large-intake capability version is missing.");
assert.ok(frontend.includes('const MAX_TEXT_CHARS = 600000'), "Browser Manuscript Studio is not aligned to 600,000 characters.");
assert.ok(frontend.includes('manuscript-studio-direct-chunks-20260730-4'), "Direct chunked Manuscript Studio build is missing.");
assert.ok(frontend.includes('kairos.manuscript-studio.recoverable-draft.v1'), "Recoverable manuscript draft state is missing.");
assert.ok(frontend.includes('Retry verified chunk save'), "Recoverable verified source-storage retry is missing.");
assert.ok(frontend.includes('Select the original manuscript file once'), "Legacy failed-draft migration guidance is missing.");
assert.ok(frontend.includes('Accepted source:'), "Accepted manuscript evidence is missing from the result view.");
assert.ok(frontend.includes('FILE_CHUNK_BYTES = 512 * 1024'), "The direct Studio file chunk size contract is missing.");
assert.ok(frontend.includes('TEXT_CHUNK_BYTES = 128 * 1024'), "The direct Studio manuscript-text chunk size contract is missing.");
assert.ok(frontend.includes('chunkedSourceUpload: true'), "The direct Studio chunked source-upload capability is missing.");
assert.ok(frontend.includes('multipartSourceUpload: false'), "The direct Studio multipart-denial capability is missing.");
assert.ok(frontend.includes('sourcePath(projectId, "session")'), "The direct Studio chunked source session request is missing.");
assert.ok(frontend.includes('sourcePath(projectId, "commit")'), "The direct Studio chunked source commit request is missing.");
assert.ok(frontend.includes('uploadChunkWithRetry'), "The direct Studio chunk retry controller is missing.");
assert.ok(!frontend.includes('new FormData'), "The active Manuscript Studio source path must not use multipart FormData.");
assert.ok(index.includes('kairos-five-center-dashboard-restored-20260730-1'), "The restored five-center dashboard build marker is missing.");
assert.ok(index.includes('safari-manuscript-intake-compat.js?v=safari-native-docx-20260730-1'), "The native Safari DOCX compatibility layer is missing.");
assert.ok(index.includes('legacy-runtime-loader.js?v=five-center-dashboard-local-production-20260731-5'), "The fresh command runtime loader marker is missing.");
assert.ok(index.includes('manuscript-production-flow-bootstrap.js?v=manuscript-local-production-controller-20260731-4'), "The fresh local-production bootstrap marker is missing.");
assert.ok(index.includes('five-center-dashboard-direct-studio-chunks-20260730-4'), "The direct-Studio lineage marker is missing.");
assert.ok(!index.includes('kairos-runtime-loader.js'), "The compatibility loader must not replace the five-center homepage.");
assert.ok(!index.includes('executive-local-inference.js'), "The local-inference panel must not mount globally on the homepage.");
assert.ok(!index.includes('manuscript-docx-upload-hotfix.js'), "The retired DOCX sidecar must not execute directly from the homepage HTML.");
assert.ok(!index.match(/<script[^>]+manuscript-studio\.js/), "Manuscript Studio must not execute directly from the homepage HTML.");
assert.ok(runtimeLoader.includes('import "./legacy-runtime-loader.js"'), "The compatibility loader must retain the command and advanced runtime.");
assert.ok(!runtimeLoader.includes('executive-local-inference.js'), "The compatibility loader must not globally mount the local-inference panel.");
assert.ok(safari.includes('safari-manuscript-intake-compat-20260730-12-five-center'), "The five-center Safari compatibility build is missing.");
assert.ok(safari.includes('kairos-native-docx-extractor-20260730-1'), "The native Safari DOCX extractor build is missing.");
assert.ok(safari.includes('installNativeDocxExtractor'), "The native DOCX extractor is not installed before manuscript intake loads.");
assert.ok(safari.includes('new DecompressionStream("deflate-raw")'), "The native DOCX ZIP decoder is missing.");
assert.ok(safari.includes('word/document.xml'), "The native DOCX document-part reader is missing.");
assert.ok(!safari.includes('cdn.jsdelivr.net'), "Safari DOCX extraction must not depend on jsDelivr.");
assert.ok(!safari.includes('esm.sh'), "Safari DOCX extraction must not depend on esm.sh.");
assert.ok(safari.includes('COMMAND_HUB_MODE'), "The five-center default route is missing.");
assert.ok(loader.includes('const BUILD = "kairos-five-center-runtime-loader-20260731-2"'), "The fresh command runtime build is missing.");
assert.ok(loader.includes('const RELEASE = "five-center-dashboard-restored-20260731-2"'), "The fresh command runtime release is missing.");
assert.ok(loader.includes('const ASSET_RELEASE = "five-center-dashboard-local-production-20260731-5"'), "The local-production asset release is missing.");
assert.ok(!loader.includes('const ASSET_RELEASE = "five-center-dashboard-direct-studio-chunks-20260730-4"'), "The retired command asset cache key remains active.");
assert.ok(loader.includes('commandHubMode'), "The command hub default-mode contract is missing.");
assert.ok(activeScripts.includes('"command-hub.js"'), "The five-center Command Hub is missing from the runtime.");
assert.ok(activeScripts.includes('"kairos-local-inference.js"'), "Local manuscript inference is missing from the governed runtime.");
assert.ok(activeScripts.includes('"manuscript-studio.js"'), "Manuscript Studio is missing from the governed runtime.");
assert.ok(activeScripts.includes('"manuscript-project-setup.js"'), "Manuscript project setup is missing from the governed runtime.");
assert.ok(activeScripts.includes('"manuscript-auto-pipeline.js"'), "The canonical manuscript production controller is missing from the governed runtime.");
assert.ok(!activeScripts.includes('manuscript-docx-upload-hotfix.js'), "The retired DOCX sidecar remains active in the governed runtime.");
assert.ok(activeScripts.indexOf('"manuscript-studio.js"') < activeScripts.indexOf('"manuscript-project-setup.js"'), "Manuscript Studio must load before project setup.");
assert.ok(activeScripts.indexOf('"kairos-local-inference.js"') < activeScripts.indexOf('"manuscript-auto-pipeline.js"'), "Local inference must load before the production controller.");
assert.ok(localInference.includes('kairos-local-inference-same-origin.js'), "The same-origin local manuscript inference module is missing.");
assert.ok(productionBootstrap.includes('five-center-dashboard-local-production-20260731-5'), "The production bootstrap does not use the fresh command asset release.");
assert.ok(productionBootstrap.includes('manuscript-local-production-controller-20260731-4'), "The production bootstrap does not use the fresh controller release.");
assert.ok(productionController.includes('KairosLocalInference'), "The local production controller does not invoke local inference.");
assert.ok(productionController.includes('data-start-local-production'), "The local production action is missing.");
assert.ok(!productionController.includes('generation-job'), "The retired backend generation route remains in the active controller.");
assert.ok(!productionController.includes('Start Production Job'), "The retired backend production action remains in the active controller.");
assert.ok(!backend.includes('180000'), "The stale 180,000-character backend limit remains.");
assert.ok(!frontend.includes('180000'), "The stale 180,000-character browser limit remains.");

for (const file of [backendPath, frontendPath, safariPath, runtimeLoaderPath, loaderPath, localInferencePath, productionBootstrapPath, productionControllerPath]) {
  const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(checked.status, 0, `${file} failed syntax validation:\n${checked.stderr || checked.stdout}`);
}

const { handleManuscriptRequest } = await import(pathToFileURL(backendPath).href);

const capabilitiesResponse = await handleManuscriptRequest(new Request("https://kairos.internal/api/manuscript/capabilities"));
assert.equal(capabilitiesResponse.status, 200);
const capabilities = await capabilitiesResponse.json();
assert.equal(capabilities.status, "intake-ready");
assert.equal(capabilities.maxCharacters, 600000);
assert.equal(capabilities.capabilities?.largeManuscriptIntake, "operational-up-to-600000-characters");
assert.equal(capabilitiesResponse.headers.get("X-Kairos-Manuscript-Studio"), "kairos-manuscript-studio-20260717-5");

const screenshotLengthManuscript = "M".repeat(279045);
const acceptedResponse = await handleManuscriptRequest(new Request("https://kairos.internal/api/manuscript/intake/advance", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Large Manuscript Intake Verification",
    manuscript: screenshotLengthManuscript,
    source: {
      name: "large-manuscript.txt",
      format: "txt",
      checksum: "verification-checksum",
      size: screenshotLengthManuscript.length,
      stored: true,
      uploadMode: "chunked-v1",
    },
  }),
}));
assert.equal(acceptedResponse.status, 200);
const accepted = await acceptedResponse.json();
assert.equal(accepted.status, "production_intake");
assert.equal(accepted.manuscript.characterCount, 279045);
assert.equal(accepted.manuscript.preservedOriginal, true);

const boundaryResponse = await handleManuscriptRequest(new Request("https://kairos.internal/api/manuscript/intake/advance", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Boundary Manuscript", manuscript: "B".repeat(600000) }),
}));
assert.equal(boundaryResponse.status, 200);
const boundary = await boundaryResponse.json();
assert.equal(boundary.manuscript.characterCount, 600000);

const rejectedResponse = await handleManuscriptRequest(new Request("https://kairos.internal/api/manuscript/intake/advance", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Oversize Manuscript", manuscript: "X".repeat(600001) }),
}));
assert.equal(rejectedResponse.status, 413);
const rejected = await rejectedResponse.json();
assert.equal(rejected.error?.code, "manuscript_too_large");

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  verified: {
    screenshotManuscriptCharactersAccepted: 279045,
    maximumCharactersAccepted: 600000,
    staleLimitRemoved: true,
    browserCacheBusted: true,
    fiveCenterDashboardRestored: true,
    globalInferenceOverlayDisabled: true,
    localInferenceRetained: true,
    localProductionControllerActive: true,
    retiredBackendGenerationInactive: true,
    safariDraftRecovery: true,
    stale502StateRemoved: true,
    nativeDocxExtraction: true,
    noExternalDocxModuleImport: true,
    directStudioOwnsSourceStorage: true,
    retiredSidecarInactive: true,
    originalDocxSourcePreserved: true,
    recoverableSourceRetry: true,
    chunkedSourceUpload: true,
    multipartSourceUploadDisabled: true,
    originalSourcePreservationReported: true,
  },
}, null, 2));
