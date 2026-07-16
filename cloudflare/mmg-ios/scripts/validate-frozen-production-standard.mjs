import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "../..");
const read = path => readFileSync(path, "utf8");
const requireMarkers = (source, markers, label) => {
  for (const marker of markers) assert.ok(source.includes(marker), `${label} missing ${marker}`);
};

const manifest = JSON.parse(read(join(root, "production-baseline.json")));
const wrangler = read(join(root, "wrangler.toml"));
const entry = read(join(root, "src/kairos-production-entry-v38.js"));
const priorEntry = read(join(root, "src/kairos-production-entry-v37.js"));
const childRuntime = read(join(root, "src/kairos-child-action-runtime-v1.js"));
const operational = read(join(root, "src/kairos-operational-runtime-v1.js"));
const autonomy = read(join(root, "src/kairos-autonomy-runtime-v1.js"));
const nativeTask = read(join(root, "src/kairos-native-task-execution-v1.js"));
const intelligence = read(join(root, "src/kairos-intelligence-v1.js"));
const web003 = read(join(root, "src/kairos-web003-composite-runtime-v1.js"));
const index = read(join(repo, "web/kairos-dashboard/index.html"));
const bridge = read(join(repo, "web/kairos-dashboard/scripts/child-action-bridge.js"));
const hub = read(join(repo, "web/kairos-dashboard/scripts/command-hub.js"));
const workspace = read(join(repo, "web/kairos-dashboard/scripts/workspace-runtime.js"));

assert.equal(manifest.baseline, "kairos-production-standard-20260716-31");
assert.equal(manifest.status, "frozen");
assert.equal(manifest.worker.entry, "src/kairos-production-entry-v38.js");
assert.equal(manifest.dashboard.childActionRuntime, "kairos-child-action-runtime-20260716-1");
assert.equal(manifest.dashboard.childActionBridge, "kairos-child-action-bridge-20260716-1");
assert.equal(manifest.approvedExpansion.synchronousChildActionExecution, true);
assert.equal(manifest.approvedExpansion.childActionObjectiveBridgeRequired, true);
assert.equal(manifest.approvedExpansion.queuedAcknowledgementOnlyRetired, true);
assert.equal(manifest.approvedExpansion.childActionDomainEvidenceRequired, true);
assert.equal(manifest.approvedExpansion.childActionDurableReadbackRequired, true);
assert.equal(manifest.approvedExpansion.childActionResultPersistenceRequired, true);
assert.equal(manifest.approvedExpansion.automaticExternalExecution, false);
assert.equal(manifest.approvedExpansion.explicitPreviewApprovalRequired, true);
assert.equal(manifest.approvedExpansion.explicitLiveApplicationRequired, true);
assert.equal(manifest.governance.productionValidationRequired, true);
assert.equal(manifest.governance.cloudflareDeploymentRequired, true);

for (let version = 20; version <= 38; version += 1) {
  assert.ok(existsSync(join(root, `src/kairos-production-entry-v${version}.js`)), `Missing production entry v${version}`);
}
assert.ok(existsSync(join(root, "src/kairos-child-action-runtime-v1.js")));
assert.ok(existsSync(join(repo, "web/kairos-dashboard/scripts/child-action-bridge.js")));

assert.deepEqual(
  wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim())),
  ['main = "src/kairos-production-entry-v38.js"'],
);
requireMarkers(wrangler, [
  '[ai]',
  'binding = "AI"',
  'name = "KAIROS_PROJECTS"',
  'KAIROS_AUTONOMY_ENABLED = "true"',
  'KAIROS_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"',
  'crons = ["*/15 * * * *"]',
], "Wrangler production configuration");

requireMarkers(entry, [
  './kairos-production-entry-v37.js',
  'handleChildActionRequest',
  'KAIROS_CHILD_ACTION_RUNTIME_BUILD',
  'synchronousChildActionExecution',
  'verifiedChildDeliverableReadback',
  'queuedAcknowledgementOnly',
  'childWorkspaceObjectiveBridge',
], "Production entry v38");
requireMarkers(priorEntry, [
  './kairos-production-entry-v36.js',
  'handleWeb003CompositeRequest',
  'web003CompositeWebsiteProduction',
], "Preserved WEB-003 edge");

requireMarkers(childRuntime, [
  'KAIROS_CHILD_ACTION_RUNTIME_BUILD',
  'kairos-child-action-runtime-20260716-1',
  'const EXECUTE_ROUTE = "/api/hub/execute"',
  'KAIROS_ACTION_CONTRACTS',
  'analyzeNativeObjective',
  'runAutonomyCycle',
  'collectDomainEvidence',
  'ledgerBatchUpsert',
  'ledgerGet',
  'ledgerList',
  'internal-domain-deliverable',
  'native-task-artifacts',
  'child-action-results',
  'artifactReadbackVerified',
  'externalActionTaken: false',
  'liveMutationPerformed: false',
  'modelReasoningStored: false',
  'websiteRetool',
], "Child action runtime");
assert.ok(!childRuntime.includes('"/api/hub/run"'), "Direct child execution must not fall back to the queued-only endpoint");

requireMarkers(operational, [
  'KAIROS_ACTION_CONTRACTS',
  'ledgerBatchUpsert',
  'work-items',
  'execution-receipts',
  'KAIROS_PROJECTS',
], "Operational runtime");
requireMarkers(autonomy, [
  'runAutonomyCycle',
  'executeNativeTask',
  'verified-native-intelligent-autonomy',
  'artifactReadbackVerified: true',
  'atomicCommitVerified: true',
  'externalActionTaken: false',
], "Autonomy runtime");
requireMarkers(nativeTask, [
  'executeNativeTask',
  'normalizeNativeTaskOutput',
  'native-task-artifacts',
  'evidenceCatalogEnforced: true',
  'structuredOutputNormalization: true',
  'durableReadbackRequired: true',
  'contentHash',
  'crypto.subtle.digest',
], "Native task execution");
requireMarkers(intelligence, [
  'openai: "prohibited"',
  'openAIModels: "prohibited"',
  'cloudflare-account-scoped',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  'customer-content-isolated-no-training',
], "Kairos intelligence policy");

requireMarkers(index, [
  'kairos-command-center-operational-20260716-13',
  '/scripts/command-hub.js?v=operational-20260716-12',
  '/scripts/child-action-bridge.js?v=operational-20260716-1',
  '/scripts/website-stage-three-recovery.js?v=20260715-2',
], "Command Center index");
assert.equal((index.match(/<script type="module"/g) || []).length, 6);

requireMarkers(bridge, [
  'kairos-child-action-bridge-20260716-1',
  'Kairos Direct Execution',
  'Execute & Return Deliverable',
  'const EXCLUDED = new Set(["website", "health"])',
  'fetch("/api/hub/execute"',
  'direct-objective-to-deliverable',
  'sessionStorage',
  'artifactID',
  'contentHash',
  'Run Another Objective',
  'Open My Work',
], "Child action UI bridge");
for (const forbidden of ["MutationObserver", "setInterval(", "scrollIntoView", "scrollTo(", "scrollBy("]) {
  assert.ok(!bridge.includes(forbidden), `Child action bridge contains prohibited ${forbidden}`);
}

requireMarkers(hub, [
  'isDomainWorkspace',
  'openDomainWorkspace',
  'workspace-runtime-host',
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification',
  '/api/shopify/homepage-release/prepare',
  '/api/shopify/homepage-release/publish',
  'fullRetoolConfirmed:fullRetool',
  'contentOnlyLocked:!fullRetool',
], "Command Hub");

for (const action of [
  "knowledge-library", "research-brief", "decision-record", "doctrine-vault", "intelligence-synthesis",
  "manuscript-studio", "social-production", "publishing-studio", "creative-studio", "product-launch",
  "revenue-intelligence", "growth-plan", "offer-builder", "campaign-operations", "visitor-activity",
  "customer-portal", "deliverables", "customer-journey", "support-intelligence", "work-queue",
  "release-control", "executive-briefing", "system-registry",
]) {
  assert.ok(workspace.includes(`"${action}"`), `Workspace registry missing ${action}`);
}
requireMarkers(workspace, ['await import(`./${definition.module}`)', 'window.dispatchEvent(new CustomEvent(definition.event'], "Workspace runtime");
requireMarkers(web003, [
  'buildCompositePlan',
  'mergeCompositeExecution',
  'websiteRetoolExceptions',
  'nativeThemeDecision',
  'web-003-composite',
  'rollbackCanonicalExecution',
], "WEB-003 composite runtime");

console.log(`KAIROS_FROZEN_STANDARD=${JSON.stringify({
  status: "passed",
  baseline: manifest.baseline,
  workerEntry: manifest.worker.entry,
  childActionRuntime: manifest.dashboard.childActionRuntime,
  childActionBridge: manifest.dashboard.childActionBridge,
  queuedAcknowledgementOnly: "retired",
  websiteApprovalPipeline: "preserved",
})}`);
