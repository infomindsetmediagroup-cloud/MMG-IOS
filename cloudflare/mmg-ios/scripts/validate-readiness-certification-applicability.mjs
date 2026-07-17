import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
const source = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-certification-applicability.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-certification-applicability.css"), "utf8");

assert.ok(index.includes("scripts/readiness-certification-applicability.js"), "Certification applicability module is not loaded.");
assert.ok(index.includes("styles/readiness-certification-applicability.css"), "Certification applicability stylesheet is not loaded.");
assert.ok(index.includes("recovery-20260714-22"), "Browser build marker is not current for certification applicability.");
for (const marker of ["Certification Applicability", "command-center-certification-applicability", "Record applicability disposition", "Preserve executive decision receipt", "data-create-certification-applicability"]) {
  assert.ok(source.includes(marker), `Certification applicability is missing: ${marker}`);
}
assert.ok(source.includes("approvalRequired:true"), "Certification applicability must require approval.");
assert.ok(source.includes('priority:"critical"'), "Certification applicability must remain critical priority.");
assert.ok(source.includes("existing certificate remains applicable"), "Certificate-continuity disposition is missing.");
assert.ok(source.includes("recertification is required"), "Recertification-required disposition is missing.");
assert.ok(css.includes(".readiness-certification-applicability"), "Certification applicability styling is missing.");

console.log(JSON.stringify({ status: "ready", feature: "kairos-certification-applicability-decision", approvalRequired: true, dispositions: 2 }, null, 2));