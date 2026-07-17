import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const source = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-priority.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-advancement.css"), "utf8");

for (const marker of [
  "Readiness Verification",
  "data-request-readiness-review",
  "command-center-readiness-verification",
  "Verify implementation evidence",
  "Verify production evidence",
  "Approve or reject readiness promotion",
  "No readiness increase is authorized",
]) assert.ok(source.includes(marker), `Readiness verification is missing: ${marker}`);

assert.ok(source.includes('workflow.state === "completed"'), "Readiness review must only be offered for completed advancement workflows.");
assert.ok(source.includes("approvalRequired: true"), "Readiness verification must require executive approval.");
assert.ok(source.includes("createWorkflowRecord"), "Readiness verification must use the governed workflow runtime.");
assert.ok(!source.includes("MutationObserver"), "Readiness verification must not add a MutationObserver.");
assert.ok(!source.includes("setInterval"), "Readiness verification must not add another polling interval.");
for (const selector of [".readiness-row-actions", ".readiness-review-action"]) assert.ok(css.includes(selector), `Readiness verification styling is missing: ${selector}`);
assert.ok(index.includes("recovery-20260714-11"), "Browser build marker is not current for readiness verification.");

console.log(JSON.stringify({
  status: "ready",
  feature: "readiness-verification-workflows",
  executiveApprovalRequired: true,
  productionEvidenceRequired: true,
  automaticReadinessIncrease: false,
  mutationObserversAdded: 0,
  pollingIntervalsAdded: 0,
}, null, 2));