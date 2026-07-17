import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const source = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-operational-assurance.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-operational-assurance.css"), "utf8");

assert.ok(index.includes("readiness-operational-assurance.js"), "Operational assurance module is not loaded.");
assert.ok(index.includes("readiness-operational-assurance.css"), "Operational assurance stylesheet is not loaded.");
assert.ok(index.includes("recovery-20260714-17"), "Operational assurance browser build marker is not current.");
for (const marker of ["Operational Assurance", "Continuous confidence after certification", "Create Assurance Review", "command-center-operational-assurance", "Verify current runtime health", "Review certification freshness"]) {
  assert.ok(source.includes(marker), `Operational assurance source is missing: ${marker}`);
}
for (const selector of [".readiness-operational-assurance", ".assurance-signals", ".assurance-action"]) {
  assert.ok(css.includes(selector), `Operational assurance styling is missing: ${selector}`);
}
assert.ok(!source.includes("MutationObserver"), "Operational assurance must not add a mutation observer.");
assert.ok(!source.includes("setInterval"), "Operational assurance must not add another polling interval.");

console.log(JSON.stringify({ status: "ready", feature: "kairos-operational-assurance", mutationObserversAdded: 0, pollingIntervalsAdded: 0 }, null, 2));