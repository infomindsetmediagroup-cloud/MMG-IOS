import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");
const recoveryPath = join(repoRoot, "web/kairos-dashboard/scripts/prebreak-functionality-recovery.js");
const commandHubPath = join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js");
const childBridgePath = join(repoRoot, "web/kairos-dashboard/scripts/child-action-bridge.js");

for (const path of [indexPath, recoveryPath, commandHubPath, childBridgePath]) {
  assert.ok(existsSync(path), `Missing recovery dependency: ${path}`);
}

const index = read(indexPath);
const recovery = read(recoveryPath);
const commandHub = read(commandHubPath);
const childBridge = read(childBridgePath);

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'), "The proven Tuesday loader marker changed.");
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'), "The proven Tuesday Command Center boot module changed.");
assert.ok(index.includes('./scripts/prebreak-functionality-recovery.js?v=20260717-2'), "The current pre-break recovery controller is not loaded.");
assert.ok(index.indexOf('prebreak-functionality-recovery.js') < index.indexOf('command-hub.js?v=recovery-20260714-1'), "The recovery controller must load before the Command Center runtime.");
assert.ok(!index.includes('website-intent-router.js'), "The obsolete forced-full-retool browser router must not load.");

for (const marker of [
  'kairos-prebreak-functionality-recovery-20260717-2',
  'kairos.website.operational-flow.v2',
  'kairos.website.visual-preservation-migration.v2',
  'published-main-template-text-settings-v1',
  'invalidateStaleWebsiteState()',
  'unsafe-pre-preservation-plan-invalidated',
  'pre-preservation-execution-state-invalidated',
  'staleUnsafeWebsitePlans: "invalidated"',
  '.app-header-status{display:none!important}',
  'document.querySelectorAll(".app-header-status").forEach(node => node.remove())',
  './child-action-bridge.js?v=',
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  'styleMutationAuthorized: false',
  'visualMutationAuthorized: false',
  'preserveVisualDesign: true',
  'preserveColors: true',
  'preserveTypography: true',
  'preservePillsAndButtons: true',
  'nativeThemeDecision: "keep-current"',
  'selectedChanges: []',
  'loaderMutation: false',
]) {
  assert.ok(recovery.includes(marker), `Recovery controller missing: ${marker}`);
}

for (const marker of [
  'kairos-command-hub-routed-20260716-6',
  'Five operating centers. Five governed child entry points per center.',
  'Website Retool',
  'Manuscript Studio',
  'Social Production',
  'Publishing Studio',
  'Creative Studio',
  'Product Launch',
  'Revenue Intelligence',
  'Growth Plan',
  'Offer Builder',
  'Campaign Operations',
  'Visitor Activity',
  'Customer Portal',
  'Deliverables',
  'Customer Journey',
  'Support Intelligence',
  'Runtime Health',
  'Work Queue',
  'Release Control',
  'Executive Briefing',
  'System Registry',
]) {
  assert.ok(commandHub.includes(marker), `Current child-card registry missing: ${marker}`);
}

assert.ok(childBridge.includes('const EXECUTE_ROUTE = "/api/hub/execute"') || childBridge.includes('fetch("/api/hub/execute"'), "The direct child execution bridge is not connected.");
assert.ok(childBridge.includes('kairos-child-action-bridge-20260716-1'), "The current child bridge build is missing.");

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-loader-safe-prebreak-recovery-20260717-2",
  loadingBaseline: "kairos-command-hub-recovery-20260714-1",
  floatingHeaderStatus: "removed",
  childRegistry: "current-5x5",
  childExecutionBridge: "active",
  websiteVisualMutation: "prohibited-by-default",
  staleUnsafeWebsitePlans: "invalidated",
  colorsTypographyPillsButtons: "preserved",
  nativeThemeStyling: "keep-current",
}, null, 2));
