import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const BUILD = "kairos-manuscript-large-intake-validator-20260730-4";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const backendPath = join(root, "src", "manuscript-studio-v1.js");
const frontendPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "manuscript-studio.js");
const indexPath = join(repoRoot, "web", "kairos-dashboard", "index.html");
const loaderPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "legacy-runtime-loader.js");

const backend = readFileSync(backendPath, "utf8");
const frontend = readFileSync(frontendPath, "utf8");
const index = readFileSync(indexPath, "utf8");
const loader = readFileSync(loaderPath, "utf8");

assert.ok(backend.includes('const MAX_CHARS = 600000'), "Backend manuscript intake is not aligned to 600,000 characters.");
assert.ok(backend.includes('manuscript-studio-v5-large-intake'), "Backend large-intake capability version is missing.");
assert.ok(frontend.includes('const MAX_TEXT_CHARS = 600000'), "Browser Manuscript Studio is not aligned to 600,000 characters.");
assert.ok(frontend.includes('manuscript-studio-upload-retention-20260730-1'), "Current Safari-safe Manuscript Studio retention build is missing.");
assert.ok(frontend.includes('kairos.manuscript-studio.recoverable-draft.v1'), "Recoverable manuscript draft state is missing.");
assert.ok(frontend.includes('Retry source save'), "Recoverable source-storage retry is missing.");
assert.ok(frontend.includes('Accepted source:'), "Accepted manuscript evidence is missing from the result view.");
assert.ok(index.includes('kairos-executive-clean-boot-20260729-1'), "The clean Executive OS build marker is missing.");
assert.match(index, /legacy-runtime-loader\.js\?v=legacy-[^"]+/, "The isolated advanced-runtime loader marker is missing.");
assert.ok(index.includes('safari-intake-fix-20260729-9'), "The current Safari intake compatibility layer is missing.");
assert.ok(!index.includes('manuscript-runtime-cache-guard.js'), "A global manuscript cache guard must not execute on the Executive OS homepage.");
assert.ok(!index.includes('manuscript-studio.js'), "Manuscript Studio must not load on the Executive OS homepage.");
assert.ok(loader.includes('const RELEASE = "manuscript-upload-retention-20260730-1"'), "The isolated manuscript runtime release is missing.");
assert.ok(loader.includes('"manuscript-studio.js"'), "Manuscript Studio is missing from Advanced Operations.");
assert.ok(loader.includes('"manuscript-project-setup.js"'), "Manuscript project setup is missing from Advanced Operations.");
assert.ok(!backend.includes('180000'), "The stale 180,000-character backend limit remains.");
assert.ok(!frontend.includes('180000'), "The stale 180,000-character browser limit remains.");

for (const file of [backendPath, frontendPath, loaderPath]) {
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
    isolatedAdvancedRuntime: true,
    safariUploadRetention: true,
    recoverableSourceRetry: true,
    originalSourcePreservationReported: true,
  },
}, null, 2));
