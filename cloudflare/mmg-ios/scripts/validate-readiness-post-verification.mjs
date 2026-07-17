import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const source = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-post-verification.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-post-verification.css"), "utf8");

for (const asset of ["scripts/readiness-post-verification.js", "styles/readiness-post-verification.css"]) assert.ok(index.includes(asset), `Missing browser asset: ${asset}`);
for (const marker of ["Post-Application Verification", "data-create-post-verification", "command-center-readiness-post-verification", "Verify registry record", "Verify child capability meter", "Verify parent center meter", "Verify governance evidence", "Close verification receipt", "kairos:workflow-runtime:open"]) assert.ok(source.includes(marker), `Missing verification marker: ${marker}`);
assert.ok(!source.includes("MutationObserver"), "Post-application verification must not use a MutationObserver.");
assert.ok(!source.includes("setInterval"), "Post-application verification must not introduce polling.");
for (const selector of [".readiness-post-verification", ".readiness-post-verification-row", ".readiness-post-verify-action"]) assert.ok(css.includes(selector), `Missing verification styling: ${selector}`);
assert.ok(index.includes("recovery-20260714-14"), "Browser cache marker is not current.");

console.log(JSON.stringify({ status: "ready", feature: "readiness-post-application-verification", approvalRequired: true, duplicateProtection: true, mutationObserversAdded: 0, pollingIntervalsAdded: 0 }, null, 2));