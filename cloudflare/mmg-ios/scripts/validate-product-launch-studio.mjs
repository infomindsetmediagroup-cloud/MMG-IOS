import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const runtimePath = join(workerRoot, "src/kairos-product-launch-studio-v1.js");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const uiPath = join(repoRoot, "web/kairos-dashboard/scripts/product-launch-studio.js");
const cssPath = join(repoRoot, "web/kairos-dashboard/styles/product-launch-studio.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

for (const file of [runtimePath, entryPath, uiPath, cssPath, indexPath]) assert.ok(existsSync(file), `Product Launch Studio production file missing: ${file}`);

const runtime = readFileSync(runtimePath, "utf8");
for (const marker of [
  "createLaunchProject", "createWorkflow", "Product Launch ·", "Lock launch strategy", "Build offer and product package",
  "Prepare commerce and campaign assets", "Run launch readiness review", "Approve and execute release",
  "pricingApprovalRequired: true", "customerFacingPublicationRequiresApproval: true",
  "campaignActivationRequiresApproval: true", "externalPublicationAutomatic: false",
  "rollbackEvidenceRequired: true",
]) assert.ok(runtime.includes(marker), `Product Launch Studio runtime contract missing: ${marker}`);

const entry = readFileSync(entryPath, "utf8");
for (const route of ["/api/product-launch/projects", "/api/product-launch/latest"]) assert.ok(entry.includes(route), `Product Launch Studio route missing: ${route}`);

const ui = readFileSync(uiPath, "utf8");
for (const marker of [
  '[data-child="product-launch"]', "Product Launch Studio", "Create Launch + Workflow",
  "Open in Work Queue", "Pricing, customer-facing publication, campaign activation",
]) assert.ok(ui.includes(marker), `Product Launch Studio UI missing: ${marker}`);

const css = readFileSync(cssPath, "utf8");
assert.ok(!css.includes("position:fixed"), "Product Launch Studio must not introduce floating controls.");

const index = readFileSync(indexPath, "utf8");
assert.ok(index.includes("scripts/product-launch-studio.js"), "Command Center does not load Product Launch Studio.");
assert.ok(index.includes("styles/product-launch-studio.css"), "Command Center does not load Product Launch Studio styles.");

console.log(JSON.stringify({
  status: "ready",
  productLaunchStudio: true,
  fiveStageWorkflow: true,
  pricingApprovalGate: true,
  publicationApprovalGate: true,
  campaignApprovalGate: true,
  rollbackEvidenceRequired: true,
  workQueueIntegration: true,
  floatingControls: 0,
}, null, 2));
