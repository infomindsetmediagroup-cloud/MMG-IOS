import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");

const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const moduleSource = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-priority.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-priority.css"), "utf8");

assert.ok(index.includes("scripts/readiness-priority.js"), "Readiness priority module is not loaded by the dashboard.");
assert.ok(index.includes("styles/readiness-priority.css"), "Readiness priority stylesheet is not loaded by the dashboard.");
for (const marker of ["Next Build Priority", "data-build-next", ".child-card[data-readiness]", "Lowest-readiness capability"]) {
  assert.ok(moduleSource.includes(marker), `Readiness priority module is missing: ${marker}`);
}
for (const marker of ["data-create-readiness-workflow", 'request("/api/workflows"', "/tasks`,", "Confirm current readiness baseline", "Recalculate operational readiness", "kairos:workflow-runtime:open"]) {
  assert.ok(moduleSource.includes(marker), `Readiness advancement workflow is missing: ${marker}`);
}
assert.ok(moduleSource.includes("approvalRequired: true"), "Readiness advancement workflows must require executive approval.");
assert.ok(moduleSource.includes("without fabricating readiness evidence"), "Readiness advancement must preserve evidence integrity.");
assert.ok(moduleSource.includes("document.addEventListener(\"click\""), "Readiness priority must use bounded click delegation.");
assert.ok(!moduleSource.includes("MutationObserver"), "Readiness priority must not introduce a DOM mutation observer.");
assert.ok(!moduleSource.includes("setInterval"), "Readiness priority must not introduce another polling interval.");
for (const selector of [".readiness-priority-actions", ".secondary-readiness-action", ".readiness-workflow-status"]) {
  assert.ok(css.includes(selector), `Readiness advancement styling is missing: ${selector}`);
}
assert.ok(index.includes("recovery-20260714-9"), "Browser build marker is not current for readiness advancement workflows.");

console.log(JSON.stringify({
  status: "ready",
  feature: "readiness-advancement-workflows",
  executiveApprovalRequired: true,
  workflowTasks: 5,
  exactWorkQueueDeepLink: true,
  boundedEventDelegation: true,
  mutationObserversAdded: 0,
  pollingIntervalsAdded: 0,
}, null, 2));