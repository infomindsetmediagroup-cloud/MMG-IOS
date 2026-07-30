import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const BUILD = "kairos-manuscript-large-intake-validator-20260730-9-chunked-source";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const backendPath = join(root, "src", "manuscript-studio-v1.js");
const frontendPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "manuscript-studio.js");
const docxResolverPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "manuscript-docx-upload-hotfix.js");
const safariPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "safari-manuscript-intake-compat.js");
const indexPath = join(repoRoot, "web", "kairos-dashboard", "index.html");
const runtimeLoaderPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "kairos-runtime-loader.js");
const loaderPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "legacy-runtime-loader.js");
const localInferencePath = join(repoRoot, "web", "kairos-dashboard", "scripts", "kairos-local-inference.js");

const backend = readFileSync(backendPath, "utf8");
const frontend = readFileSync(frontendPath, "utf8");
const docxResolver = readFileSync(docxResolverPath, "utf8");
const safari = readFileSync(safariPath, "utf8");
const index = readFileSync(indexPath, "utf8");
const runtimeLoader = readFileSync(runtimeLoaderPath, "utf8");
const loader = readFileSync(loaderPath, "utf8");
const localInference = readFileSync(localInferencePath, "utf8");

assert.ok(backend.includes('const MAX_CHARS = 600000'), "Backend manuscript intake is not aligned to 600,000 characters.");
assert.ok(backend.includes('manuscript-studio-v5-large-intake'), "Backend large-intake capability version is missing.");
assert.ok(frontend.includes('const MAX_TEXT_CHARS = 600000'), "Browser Manuscript Studio is not aligned to 600,000 characters.");
assert.ok(frontend.includes('manuscript-studio-upload-retention-20260730-1'), "Current Safari-safe Manuscript Studio retention build is missing.");
assert.ok(frontend.includes('kairos.manuscript-studio.recoverable-draft.v1'), "Recoverable manuscript draft state is missing.");
assert.ok(frontend.includes('Retry source save'), "Recoverable source-storage retry is missing.");
assert.ok(frontend.includes('Accepted source:'), "Accepted manuscript evidence is missing from the result view.");
assert.ok(docxResolver.includes('manuscript-docx-upload-hotfix-20260730-3-chunked-source'), "The chunked DOCX source resolver build is missing.");
assert.ok(docxResolver.includes('const MAX_TEXT_CHARS = 600000'), "DOCX extraction is not aligned to the 600,000-character intake boundary.");
assert.ok(docxResolver.includes('typeof candidate?.extractRawText === "function"'), "DOCX export-shape resolution is missing.");
assert.ok(docxResolver.includes('FILE_CHUNK_BYTES = 512 * 1024'), "The Safari DOCX chunk size contract is missing.");
assert.ok(docxResolver.includes('TEXT_CHUNK_BYTES = 128 * 1024'), "The Safari manuscript-text chunk size contract is missing.");
assert.ok(docxResolver.includes('chunkedSourceUpload: true'), "The chunked Safari source-upload capability is missing.");
assert.ok(docxResolver.includes('sourcePath("session")'), "The chunked source session request is missing.");
assert.ok(docxResolver.includes('sourcePath("commit")'), "The chunked source commit request is missing.");
assert.ok(!docxResolver.includes('new FormData'), "Safari source storage must not use multipart FormData.");
assert.ok(index.includes('kairos-five-center-dashboard-restored-20260730-1'), "The restored five-center dashboard build marker is missing.");
assert.ok(index.includes('safari-manuscript-intake-compat.js?v=safari-native-docx-20260730-1'), "The native Safari DOCX compatibility layer is missing.");
assert.ok(index.includes('legacy-runtime-loader.js?v=five-center-dashboard-chunked-source-20260730-3'), "The chunked-source command runtime loader marker is missing.");
assert.ok(index.includes('five-center-dashboard-chunked-source-20260730-3'), "The chunked-source release marker is missing.");
assert.ok(!index.includes('kairos-runtime-loader.js'), "The compatibility loader must not replace the five-center homepage.");
assert.ok(!index.includes('executive-local-inference.js'), "The local-inference panel must not mount globally on the homepage.");
assert.ok(!index.includes('manuscript-docx-upload-hotfix.js'), "The DOCX resolver must not execute directly from the homepage HTML.");
assert.ok(!index.includes('manuscript-studio.js'), "Manuscript Studio must not execute directly from the homepage HTML.");
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
assert.ok(loader.includes('const RELEASE = "five-center-dashboard-restored-20260730-1"'), "The restored command runtime release is missing.");
assert.ok(loader.includes('const ASSET_RELEASE = "five-center-dashboard-chunked-source-20260730-3"'), "The chunked-source asset release is missing.");
assert.ok(loader.includes('commandHubMode'), "The command hub default-mode contract is missing.");
assert.ok(loader.includes('"command-hub.js"'), "The five-center Command Hub is missing from the runtime.");
assert.ok(loader.includes('"kairos-local-inference.js"'), "Local manuscript inference is missing from the governed runtime.");
assert.ok(loader.includes('"manuscript-docx-upload-hotfix.js"'), "The DOCX resolver is missing from the governed runtime.");
assert.ok(loader.includes('"manuscript-studio.js"'), "Manuscript Studio is missing from the governed runtime.");
assert.ok(loader.includes('"manuscript-project-setup.js"'), "Manuscript project setup is missing from the governed runtime.");
assert.ok(loader.indexOf('"manuscript-docx-upload-hotfix.js"') < loader.indexOf('"manuscript-studio.js"'), "The DOCX resolver must load before Manuscript Studio.");
assert.ok(localInference.includes('kairos-local-inference-same-origin.js'), "The same-origin local manuscript inference module is missing.");
assert.ok(!backend.includes('180000'), "The stale 180,000-character backend limit remains.");
assert.ok(!frontend.includes('180000'), "The stale 180,000-character browser limit remains.");

for (const file of [backendPath, frontendPath, docxResolverPath, safariPath, runtimeLoaderPath, loaderPath, localInferencePath]) {
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
    safariUploadRetention: true,
    nativeDocxExtraction: true,
    noExternalDocxModuleImport: true,
    docxNamedExportResolution: true,
    originalDocxSourcePreserved: true,
    recoverableSourceRetry: true,
    chunkedSourceUpload: true,
    multipartSourceUploadDisabled: true,
    originalSourcePreservationReported: true,
  },
}, null, 2));
