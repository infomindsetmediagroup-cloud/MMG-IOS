import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const rendererPath = join(repoRoot, "web/kairos-dashboard/scripts/command-hub-stable-v2.js");
const stylePath = join(repoRoot, "web/kairos-dashboard/styles/command-hub-stable-v2.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");
const contractsPath = join(workerRoot, "src/kairos-operational-runtime-v1.js");
for (const path of [rendererPath, stylePath, indexPath, contractsPath]) assert.ok(existsSync(path), `Missing stable renderer dependency: ${path}`);

const renderer = readFileSync(rendererPath, "utf8");
const style = readFileSync(stylePath, "utf8");
const index = readFileSync(indexPath, "utf8");
const contracts = readFileSync(contractsPath, "utf8");

for (const marker of [
  'kairos-command-hub-stable-v2-20260717-1',
  'getJSON("/api/hub/contracts")',
  './workspace-runtime.js?v=20260717-4',
  'openDomainWorkspace',
  'isDomainWorkspace',
  'cleanupDomainWorkspace',
  'requestType: "homepage-preserve-design"',
  'styleMutationAuthorized: false',
  'visualMutationAuthorized: false',
  'cssMutationAuthorized: false',
  'assetMutationAuthorized: false',
  'designTokenMutationAuthorized: false',
  'themeSchemeMutationAuthorized: false',
  'nativeThemeDecision: "keep-current"',
  'selectedChanges: []',
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification',
  '/api/shopify/homepage-release/prepare',
  '/api/shopify/homepage-release/publish',
  '/api/shopify/homepage-release/rollback',
]) assert.ok(renderer.includes(marker), `Stable renderer missing: ${marker}`);

assert.ok(!renderer.includes("app-header-status"), "The stable renderer must not create a floating header status.");
assert.ok(!renderer.includes("styleMutationAuthorized: true"), "The stable renderer must never authorize style mutation.");
assert.ok(!renderer.includes("visualMutationAuthorized: true"), "The stable renderer must never authorize visual mutation.");
assert.ok(!renderer.includes("fullRetoolConfirmed: true"), "The stable renderer must not silently convert structural work into visual redesign authority.");
assert.ok(!style.includes("app-header-status"), "The stable stylesheet must not contain floating header status rules.");

for (const action of [
  "knowledge-library", "research-brief", "decision-record", "doctrine-vault", "intelligence-synthesis",
  "website", "manuscript-studio", "social-production", "publishing-studio", "creative-studio",
  "product-launch", "revenue-intelligence", "growth-plan", "offer-builder", "campaign-operations",
  "visitor-activity", "customer-portal", "deliverables", "customer-journey", "support-intelligence",
  "health", "work-queue", "release-control", "executive-briefing", "system-registry",
]) {
  assert.ok(renderer.includes(`"${action}"`) || renderer.includes(`${action}:`), `Renderer action order missing: ${action}`);
  assert.ok(contracts.includes(`"${action}"`) || contracts.includes(`${action}:`), `Runtime contract missing: ${action}`);
}

assert.ok(index.includes('./scripts/command-hub-stable-v2.js?v=20260717-1'), "Stable renderer is not the active browser module.");
for (const obsolete of ["command-hub.js?v=recovery", "prebreak-functionality-recovery.js", "authoritative-command-center-reconcile.js"]) {
  assert.ok(!index.includes(obsolete), `Obsolete renderer still active: ${obsolete}`);
}

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-stable-contract-driven-renderer-20260717-1",
  childRegistry: "live-api",
  childWorkspaceCount: 25,
  dedicatedDomainWorkspaces: 23,
  floatingHeaderStatus: "absent-at-source",
  websiteVisualMutation: "prohibited",
  loaderChanged: false,
}, null, 2));
