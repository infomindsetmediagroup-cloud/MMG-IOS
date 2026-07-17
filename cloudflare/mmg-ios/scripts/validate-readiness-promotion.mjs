import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");

const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const moduleSource = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-promotion.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-promotion.css"), "utf8");

for (const asset of ["scripts/readiness-promotion.js", "styles/readiness-promotion.css"]) assert.ok(index.includes(asset), `Promotion asset missing: ${asset}`);
for (const marker of ["Promotion Authorization", "Authorize Promotion", "command-center-readiness-promotion", "Validate completed verification disposition", "Record approved target score", "Authorize readiness registry update", "Verify updated meter and audit receipt"]) assert.ok(moduleSource.includes(marker), `Promotion controller missing: ${marker}`);
assert.ok(moduleSource.includes("priority: \"critical\""), "Promotion authorization must be critical priority.");
assert.ok(moduleSource.includes("approvalRequired: true"), "Promotion authorization must require approval.");
assert.ok(moduleSource.includes("Authorization does not change the meter by itself"), "Promotion boundary must be explicit.");
assert.ok(!moduleSource.includes("MutationObserver"), "Promotion controller must not use a mutation observer.");
assert.ok(!moduleSource.includes("setInterval"), "Promotion controller must not add a polling interval.");
for (const selector of [".readiness-promotion-register", ".readiness-promotion-row", ".readiness-promotion-action", ".readiness-promotion-boundary"]) assert.ok(css.includes(selector), `Promotion CSS missing: ${selector}`);
assert.ok(index.includes("recovery-20260714-12"), "Browser build marker is not current for readiness promotion.");

console.log(JSON.stringify({ status:"ready", feature:"readiness-promotion-authorization", approvalRequired:true, meterAutoMutation:false, mutationObserversAdded:0, pollingIntervalsAdded:0 }, null, 2));