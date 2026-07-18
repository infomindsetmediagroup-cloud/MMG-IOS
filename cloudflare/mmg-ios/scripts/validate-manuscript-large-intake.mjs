import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const BUILD = "kairos-manuscript-large-intake-validator-20260717-1";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const backendPath = join(root, "src", "manuscript-studio-v1.js");
const frontendPath = join(repoRoot, "web", "kairos-dashboard", "scripts", "manuscript-studio.js");
const indexPath = join(repoRoot, "web", "kairos-dashboard", "index.html");

const backend = readFileSync(backendPath, "utf8");
const frontend = readFileSync(frontendPath, "utf8");
const index = readFileSync(indexPath, "utf8");

assert.ok(backend.includes('const MAX_CHARS = 600000'), "Backend manuscript intake is not aligned to 600,000 characters.");
assert.ok(backend.includes('manuscript-studio-v5-large-intake'), "Backend large-intake capability version is missing.");
assert.ok(frontend.includes('const MAX_TEXT_CHARS = 600000'), "Browser Manuscript Studio is not aligned to 600,000 characters.");
assert.ok(frontend.includes('manuscript-studio-20260717-4'), "Updated Manuscript Studio browser build is missing.");
assert.ok(frontend.includes('Accepted source:'), "Accepted manuscript evidence is missing from the result view.");
assert.ok(index.includes('manuscript-large-intake-20260717-1'), "The browser cache-busting marker is missing.");
assert.ok(!backend.includes('180000'), "The stale 180,000-character backend limit remains.");
assert.ok(!frontend.includes('180000'), "The stale 180,000-character browser limit remains.");

for (const file of [backendPath, frontendPath]) {
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
    originalSourcePreservationReported: true,
  },
}, null, 2));
