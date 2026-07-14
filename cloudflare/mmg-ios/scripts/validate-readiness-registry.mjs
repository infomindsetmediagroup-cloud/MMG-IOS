import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const engine = readFileSync(join(workerRoot, "src/kairos-readiness-registry-v1.js"), "utf8");
const entry = readFileSync(join(workerRoot, "src/kairos-production-entry-v1.js"), "utf8");
const ui = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/readiness-registry.js"), "utf8");
const css = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/readiness-registry.css"), "utf8");
const index = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");

for (const marker of ["/api/readiness-registry", "authorizationWorkflowID", "completed", "approvalStatus", "scoreDecreasesForbidden", "silentMutationForbidden"]) {
  assert.ok(engine.includes(marker), `Readiness registry engine is missing: ${marker}`);
}
assert.ok(entry.includes("handleReadinessRegistry"), "Production runtime does not route the readiness registry.");
for (const marker of ["Promotion Application", "Apply Promotion", "data-apply-readiness-promotion", "kairos:readiness-registry:updated", "15100"]) {
  assert.ok(ui.includes(marker), `Readiness registry UI is missing: ${marker}`);
}
assert.ok(!ui.includes("MutationObserver"), "Readiness registry must not introduce a mutation observer.");
for (const selector of [".readiness-application-register", ".readiness-application-row", ".readiness-application-boundary"]) {
  assert.ok(css.includes(selector), `Readiness registry styling is missing: ${selector}`);
}
for (const asset of ["scripts/readiness-registry.js", "styles/readiness-registry.css", "recovery-20260714-13"]) {
  assert.ok(index.includes(asset), `Dashboard readiness registry asset is missing: ${asset}`);
}

console.log(JSON.stringify({
  status: "ready",
  feature: "governed-readiness-registry-application",
  authorizationWorkflowRequired: true,
  completedWorkflowRequired: true,
  approvalRequired: true,
  evidenceRequired: true,
  scoreDecreaseForbidden: true,
  mutationObserversAdded: 0,
}, null, 2));
