import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const source = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-system-certification.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-system-certification.css"), "utf8");

assert.ok(index.includes("scripts/readiness-system-certification.js"), "System certification module is not loaded.");
assert.ok(index.includes("styles/readiness-system-certification.css"), "System certification stylesheet is not loaded.");
assert.ok(index.includes("recovery-20260714-16"), "Browser build marker is not current for system certification.");
for (const marker of ["Kairos Operational Certification", "command-center-kairos-operational-certification", "Reconcile five center certificates", "Approve current-blueprint operational status", "data-create-system-certification"]) {
  assert.ok(source.includes(marker), `System certification is missing: ${marker}`);
}
for (const center of ["knowledge", "content", "business", "customers", "operations"]) assert.ok(source.includes(`"${center}"`), `System certification omits center: ${center}`);
assert.ok(source.includes("approvalRequired: true"), "System certification must require approval.");
assert.ok(source.includes('priority: "critical"'), "System certification must remain critical priority.");
assert.ok(css.includes(".readiness-system-certification"), "System certification styling is missing.");

console.log(JSON.stringify({ status: "ready", feature: "kairos-current-blueprint-operational-certification", centersRequired: 5, approvalRequired: true }, null, 2));