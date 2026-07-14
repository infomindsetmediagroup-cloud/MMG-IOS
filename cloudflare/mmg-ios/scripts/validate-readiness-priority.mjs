import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");

const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const moduleSource = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-priority.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/command-hub.css"), "utf8");

assert.ok(index.includes("scripts/readiness-priority.js"), "Readiness priority module is not loaded by the dashboard.");
for (const marker of ["Next Build Priority", "data-build-next", ".child-card[data-readiness]", "Lowest-readiness capability"]) {
  assert.ok(moduleSource.includes(marker), `Readiness priority module is missing: ${marker}`);
}
assert.ok(moduleSource.includes("document.addEventListener(\"click\""), "Readiness priority must use bounded click delegation.");
assert.ok(!moduleSource.includes("MutationObserver"), "Readiness priority must not introduce a DOM mutation observer.");
assert.ok(!moduleSource.includes("setInterval"), "Readiness priority must not introduce another polling interval.");
for (const selector of [".readiness-priority", ".readiness-priority button"]) {
  assert.ok(css.includes(selector), `Readiness priority styling is missing: ${selector}`);
}
assert.ok(index.includes("recovery-20260714-8"), "Browser build marker is not current for readiness priority.");

console.log(JSON.stringify({
  status: "ready",
  feature: "next-build-readiness-priority",
  boundedEventDelegation: true,
  mutationObserversAdded: 0,
  pollingIntervalsAdded: 0,
}, null, 2));