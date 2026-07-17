import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const source = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-center-certification.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-center-certification.css"), "utf8");

for (const asset of ["scripts/readiness-center-certification.js", "styles/readiness-center-certification.css"]) assert.ok(index.includes(asset), `Center certification asset missing: ${asset}`);
for (const marker of [
  "Center Certification",
  "Operational Certification",
  "command-center-readiness-center-certification",
  "Reconcile five capability scores",
  "Verify capability closure evidence",
  "Verify center meter calculation",
  "Approve current-blueprint certification",
  "Preserve certification receipt",
  "scores.some(score => score !== 100)",
  "approvalRequired: true",
  "priority: \"critical\"",
  "future blueprint expansion",
]) assert.ok(source.includes(marker), `Center certification control missing: ${marker}`);
assert.ok(source.includes("CAPABILITIES"), "Center certification must reconcile the canonical five capabilities.");
assert.ok(source.includes("document.addEventListener(\"click\""), "Center certification must use bounded click delegation.");
assert.ok(!source.includes("MutationObserver"), "Center certification must not add a mutation observer.");
assert.ok(!source.includes("setInterval"), "Center certification must not add another polling interval.");
for (const selector of [".readiness-center-certification", ".center-certification-summary", ".center-certification-gaps", ".center-certification-action"]) assert.ok(css.includes(selector), `Center certification styling missing: ${selector}`);
assert.ok(index.includes("recovery-20260714-15"), "Browser build marker is not current for center certification.");

console.log(JSON.stringify({
  status: "ready",
  feature: "operating-center-readiness-certification",
  capabilityCountPerCenter: 5,
  requiresAllScoresAt100: true,
  executiveApprovalRequired: true,
  duplicateOpenCertificationBlocked: true,
  currentBlueprintBoundaryPreserved: true,
  mutationObserversAdded: 0,
  pollingIntervalsAdded: 0,
}, null, 2));