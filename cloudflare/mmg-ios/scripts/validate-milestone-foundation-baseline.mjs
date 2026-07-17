import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const simpleMode = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/executive-simple-mode.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(workerRoot, "baselines/kairos-milestone-foundation-v1.json"), "utf8"));
const doctrine = readFileSync(join(repoRoot, "docs/KAIROS_MILESTONE_FOUNDATION_BASELINE_V1.md"), "utf8");

assert.equal(manifest.baseline, "kairos-milestone-foundation-v1");
assert.equal(manifest.status, "frozen");
assert.equal(manifest.foundationCommit, "2a5b80e14320107ced52acc7599fd9cce6b6069b");
assert.equal(manifest.commandCenterBuild, "kairos-command-hub-recovery-20260714-25");
assert.equal(manifest.architecture.operatingCenters, 5);
assert.equal(manifest.architecture.capabilitiesPerCenter, 5);
assert.equal(manifest.architecture.totalEntryPoints, 25);
assert.equal(manifest.experience.technicalCardsVisibleByDefault, false);
assert.equal(manifest.experience.systemCareControl, true);
assert.equal(manifest.experience.oneClickApproval, true);
assert.equal(manifest.experience.oneClickRemediation, true);
assert.equal(manifest.experience.floatingControls, false);
assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-25"'), "Frozen Command Center build marker changed.");
assert.ok(index.includes("scripts/executive-simple-mode.js"), "Executive simple mode is not loaded.");
for (const marker of ["System Care", "Kairos is ready", "Review & Approve", "Fix It", "Resolve Issue"]) {
  assert.ok(simpleMode.includes(marker), `Executive simple mode is missing: ${marker}`);
}
assert.ok(doctrine.includes("FROZEN FOUNDATION"), "Foundation doctrine is not frozen.");
assert.ok(doctrine.includes("25 total entry points"), "Foundation doctrine does not preserve the 25-entry-point architecture.");
assert.ok(doctrine.includes("Cloudflare production is considered reconciled only"), "Cloudflare reconciliation boundary is missing.");

console.log(JSON.stringify({
  status: "ready",
  baseline: manifest.baseline,
  foundationCommit: manifest.foundationCommit,
  commandCenterBuild: manifest.commandCenterBuild,
  userExperience: "executive-simple-mode"
}, null, 2));
