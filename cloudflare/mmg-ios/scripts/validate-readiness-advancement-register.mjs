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

assert.ok(index.includes("styles/readiness-advancement.css"), "Readiness advancement stylesheet is not loaded.");
for (const marker of ["Advancement Register", "data-open-readiness-workflow", "Workflow Already Open", "loadAdvancementRegister", "command-center-readiness-priority"]) {
  assert.ok(source.includes(marker), `Readiness advancement register is missing: ${marker}`);
}
assert.ok(source.includes("Existing workflow found"), "Duplicate readiness workflow protection is missing.");
assert.ok(source.includes('!["completed", "cancelled"].includes(item.state)'), "Open-workflow detection is missing.");
assert.ok(source.includes('new CustomEvent("kairos:workflow-runtime:open"'), "Exact Work Queue deep link is missing.");
assert.ok(!source.includes("MutationObserver"), "Readiness advancement register must not introduce a MutationObserver.");
assert.ok(!source.includes("setInterval"), "Readiness advancement register must not introduce another polling interval.");
for (const selector of [".readiness-advancement-register", ".readiness-advancement-row", ".readiness-advancement-meter"]) {
  assert.ok(css.includes(selector), `Readiness advancement styling is missing: ${selector}`);
}
assert.ok(index.includes("recovery-20260714-10"), "Browser build marker is not current.");

console.log(JSON.stringify({
  status: "ready",
  feature: "readiness-advancement-register",
  duplicateWorkflowProtection: true,
  exactWorkQueueDeepLink: true,
  mutationObserversAdded: 0,
  pollingIntervalsAdded: 0,
}, null, 2));