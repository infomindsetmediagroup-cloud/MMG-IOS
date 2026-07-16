import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "../..");
const read = path => readFileSync(path, "utf8");
const required = (source, marker, label) => assert.ok(source.includes(marker), `${label} missing: ${marker}`);
const requiredAll = (source, markers, label) => markers.forEach(marker => required(source, marker, label));

const paths = {
  manifest: join(root, "production-baseline.json"),
  wrangler: join(root, "wrangler.toml"),
  entry: join(root, "src/kairos-production-entry-v39.js"),
  priorEntry: join(root, "src/kairos-production-entry-v38.js"),
  childRuntime: join(root, "src/kairos-child-action-runtime-v1.js"),
  operational: join(root, "src/kairos-operational-runtime-v1.js"),
  autonomy: join(root, "src/kairos-autonomy-runtime-v1.js"),
  nativeTask: join(root, "src/kairos-native-task-execution-v1.js"),
  intelligence: join(root, "src/kairos-intelligence-v1.js"),
  web003: join(root, "src/kairos-web003-composite-runtime-v1.js"),
  index: join(repo, "web/kairos-dashboard/index.html"),
  bridge: join(repo, "web/kairos-dashboard/scripts/child-action-bridge.js"),
  websiteRouter: join(repo, "web/kairos-dashboard/scripts/website-intent-router.js"),
  hub: join(repo, "web/kairos-dashboard/scripts/command-hub.js"),
  workspace: join(repo, "web/kairos-dashboard/scripts/workspace-runtime.js"),
};
for (const [name, path] of Object.entries(paths)) assert.ok(existsSync(path), `Missing production file: ${name}`);

const manifest = JSON.parse(read(paths.manifest));
const wrangler = read(paths.wrangler);
const entry = read(paths.entry);
const priorEntry = read(paths.priorEntry);
const childRuntime = read(paths.childRuntime);
const operational = read(paths.operational);
const autonomy = read(paths.autonomy);
const nativeTask = read(paths.nativeTask);
const intelligence = read(paths.intelligence);
const web003 = read(paths.web003);
const index = read(paths.index);
const bridge = read(paths.bridge);
const websiteRouter = read(paths.websiteRouter);
const hub = read(paths.hub);
const workspace = read(paths.workspace);

assert.equal(manifest.status, "frozen");
assert.equal(manifest.baseline, "kairos-production-standard-20260716-32");
assert.equal(manifest.worker.entry, "src/kairos-production-entry-v39.js");
assert.equal(manifest.dashboard.childActionRuntime, "kairos-child-action-runtime-20260716-1");
assert.equal(manifest.dashboard.childActionBridge, "kairos-child-action-bridge-20260716-1");
assert.equal(manifest.dashboard.websiteIntentRouter, "kairos-website-intent-router-20260716-1");
for (const flag of [
  "synchronousChildActionExecution",
  "childActionObjectiveBridgeRequired",
  "queuedAcknowledgementOnlyRetired",
  "childActionDomainEvidenceRequired",
  "childActionDurableReadbackRequired",
  "childActionResultPersistenceRequired",
  "structuralIntentOverridesContentOnlyLock",
  "websiteRetoolDefaultsToStructural",
  "staleContentOnlyStateMigrationRequired",
  "literalContentOnlyIsolationRequired",
  "boundedInternalAutomaticExecution",
  "eventDrivenAutonomousExecution",
  "verifiedNativeTaskArtifactsRequired",
  "nativeTaskReadbackBeforeCompletion",
  "explicitPreviewApprovalRequired",
  "explicitLiveApplicationRequired",
  "web003CompositeWebsiteProductionRequired",
  "compositeWebsiteRollbackRequired",
]) assert.equal(manifest.approvedExpansion[flag], true, `Frozen baseline flag is not enabled: ${flag}`);
assert.equal(manifest.approvedExpansion.automaticExternalExecution, false);
assert.equal(manifest.approvedExpansion.modelReasoningPersisted, false);

const activeEntries = wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim()));
assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry-v39.js"']);
requiredAll(wrangler, [
  '[ai]', 'binding = "AI"', 'name = "KAIROS_PROJECTS"',
  'KAIROS_AUTONOMY_ENABLED = "true"',
  'KAIROS_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"',
  'crons = ["*/15 * * * *"]',
], "Wrangler");

requiredAll(entry, [
  'kairos-production-entry-v38.js',
  'kairos-production-entry-20260716-96',
  'structural-objective-overrode-content-only-lock',
  'structural-objective-overrides-stale-content-only-lock',
  'structuralIntentOverridesContentOnlyLock',
  'websiteRetoolDefaultsToStructural',
  'staleContentOnlyStateMigration',
  'contentOnlyLocked: false',
  'fullRetoolConfirmed: true',
  'X-Kairos-Website-Intent-Guard',
], "Production entry v39");
requiredAll(priorEntry, [
  'kairos-production-entry-v37.js',
  'handleChildActionRequest',
  'KAIROS_CHILD_ACTION_RUNTIME_BUILD',
  'synchronousChildActionExecution',
  'verifiedChildDeliverableReadback',
  'queuedAcknowledgementOnly',
  'childWorkspaceObjectiveBridge',
  'websiteRetool: "separate-approval-pipeline"',
], "Preserved production entry v38");
requiredAll(childRuntime, [
  'kairos-child-action-runtime-20260716-1',
  'const EXECUTE_ROUTE = "/api/hub/execute"',
  'KAIROS_ACTION_CONTRACTS',
  'analyzeNativeObjective',
  'runAutonomyCycle',
  'collectDomainEvidence',
  'ledgerBatchUpsert',
  'native-task-artifacts',
  'child-action-results',
  'artifactReadbackVerified',
  'internal-domain-deliverable',
  'externalActionTaken: false',
  'liveMutationPerformed: false',
  'modelReasoningStored: false',
], "Child action runtime");
assert.ok(!childRuntime.includes('"/api/hub/run"'), "Direct execution regressed to the queued-only endpoint");

requiredAll(index, [
  'kairos-command-center-operational-20260716-14',
  '/scripts/command-hub.js?v=operational-20260716-12',
  '/scripts/website-intent-router.js?v=operational-20260716-1',
  '/scripts/child-action-bridge.js?v=operational-20260716-1',
], "Command Center index");
requiredAll(websiteRouter, [
  'kairos-website-intent-router-20260716-1',
  'kairos.website.operational-flow.v2',
  'structuralObjective',
  'requestType:"full-retool"',
  'mode:"input"',
  'plan:null',
  'data-website-plan',
  'data-website-full-retool-confirm',
  'location.reload()',
], "Website intent router");
for (const forbidden of ["MutationObserver", "setInterval(", "scrollIntoView", "scrollTo(", "scrollBy("]) {
  assert.ok(!websiteRouter.includes(forbidden), `Website intent router contains prohibited behavior: ${forbidden}`);
}
requiredAll(bridge, [
  'kairos-child-action-bridge-20260716-1',
  'Kairos Direct Execution',
  'Execute & Return Deliverable',
  'fetch("/api/hub/execute"',
  'direct-objective-to-deliverable',
  'sessionStorage',
  'artifactID',
  'contentHash',
  'Run Another Objective',
  'Open My Work',
], "Child action bridge");
for (const forbidden of ["MutationObserver", "setInterval(", "scrollIntoView", "scrollTo(", "scrollBy("]) {
  assert.ok(!bridge.includes(forbidden), `Child action bridge contains prohibited behavior: ${forbidden}`);
}

requiredAll(operational, ["KAIROS_ACTION_CONTRACTS", "ledgerBatchUpsert", "work-items", "execution-receipts"], "Operational runtime");
requiredAll(autonomy, ["runAutonomyCycle", "executeNativeTask", "verified-native-intelligent-autonomy", "artifactReadbackVerified: true", "atomicCommitVerified: true"], "Autonomy runtime");
requiredAll(nativeTask, ["executeNativeTask", "normalizeNativeTaskOutput", "native-task-artifacts", "evidenceCatalogEnforced: true", "durableReadbackRequired: true", "crypto.subtle.digest"], "Native task runtime");
requiredAll(intelligence, ['openai: "prohibited"', 'openAIModels: "prohibited"', 'cloudflare-account-scoped', '@cf/qwen/qwen3-30b-a3b-fp8', 'customer-content-isolated-no-training'], "Intelligence policy");

requiredAll(web003, ["buildCompositePlan", "mergeCompositeExecution", "websiteRetoolExceptions", "nativeThemeDecision", "web-003-composite", "rollbackCanonicalExecution"], "WEB-003 runtime");
requiredAll(hub, [
  '/api/shopify/staging/plan/jobs', '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification', '/api/shopify/homepage-release/prepare',
  '/api/shopify/homepage-release/publish', 'fullRetoolConfirmed:fullRetool',
  'contentOnlyLocked:!fullRetool', 'openDomainWorkspace',
], "Command Hub");
requiredAll(workspace, ["knowledge-library", "manuscript-studio", "product-launch", "customer-portal", "work-queue", "system-registry", 'await import(`./${definition.module}`)'], "Workspace registry");

console.log(`KAIROS_FROZEN_STANDARD=${JSON.stringify({
  status: "passed",
  baseline: manifest.baseline,
  workerEntry: manifest.worker.entry,
  childActionRuntime: manifest.dashboard.childActionRuntime,
  childActionBridge: manifest.dashboard.childActionBridge,
  websiteIntentRouter: manifest.dashboard.websiteIntentRouter,
  structuralIntentOverridesContentOnlyLock: true,
  staleContentOnlyStateMigration: true,
  objectiveToVerifiedDeliverable: true,
  queuedAcknowledgementOnly: "retired",
  websiteApprovalPipeline: "preserved",
})}`);
