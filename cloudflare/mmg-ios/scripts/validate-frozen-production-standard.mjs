import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "../..");
const read = path => readFileSync(path, "utf8");
const required = (source, marker, label) => assert.ok(source.includes(marker), `${label} missing: ${marker}`);
const requiredAll = (source, markers, label) => markers.forEach(marker => required(source, marker, label));
const prohibited = ["MutationObserver", "setInterval(", "scrollIntoView", "scrollTo(", "scrollBy("];

const paths = {
  manifest: join(root, "production-baseline.json"),
  wrangler: join(root, "wrangler.toml"),
  entry: join(root, "src/kairos-production-entry-v40.js"),
  priorEntry: join(root, "src/kairos-production-entry-v39.js"),
  preservePlanner: join(root, "src/kairos-homepage-preserve-planner-v1.js"),
  liquidExecutor: join(root, "src/kairos-liquid-content-only-executor-v1.js"),
  childRuntime: join(root, "src/kairos-child-action-runtime-v1.js"),
  operational: join(root, "src/kairos-operational-runtime-v1.js"),
  autonomy: join(root, "src/kairos-autonomy-runtime-v1.js"),
  nativeTask: join(root, "src/kairos-native-task-execution-v1.js"),
  intelligence: join(root, "src/kairos-intelligence-v1.js"),
  web003: join(root, "src/kairos-web003-composite-runtime-v1.js"),
  index: join(repo, "web/kairos-dashboard/index.html"),
  bridge: join(repo, "web/kairos-dashboard/scripts/child-action-bridge.js"),
  websiteRouter: join(repo, "web/kairos-dashboard/scripts/website-intent-router.js"),
  homepageQuick: join(repo, "web/kairos-dashboard/scripts/homepage-quick-action.js"),
  homepageQuickCSS: join(repo, "web/kairos-dashboard/styles/homepage-quick-action.css"),
  workflow: join(repo, "web/kairos-dashboard/scripts/workflow-runtime.js"),
  workflowCSS: join(repo, "web/kairos-dashboard/styles/workflow-runtime.css"),
  hub: join(repo, "web/kairos-dashboard/scripts/command-hub.js"),
  workspace: join(repo, "web/kairos-dashboard/scripts/workspace-runtime.js"),
};
for (const [name, path] of Object.entries(paths)) assert.ok(existsSync(path), `Missing production file: ${name}`);

const manifest = JSON.parse(read(paths.manifest));
const sources = Object.fromEntries(Object.entries(paths).filter(([name]) => name !== "manifest").map(([name, path]) => [name, read(path)]));

assert.equal(manifest.status, "frozen");
assert.equal(manifest.baseline, "kairos-production-standard-20260716-33");
assert.equal(manifest.worker.entry, "src/kairos-production-entry-v40.js");
assert.equal(manifest.dashboard.workspaceRuntime, "kairos-workspace-runtime-20260716-3");
assert.equal(manifest.dashboard.workflowRuntime, "kairos-workflow-runtime-ui-20260716-4");
assert.equal(manifest.dashboard.homepageQuickAction, "kairos-homepage-quick-action-20260716-1");
assert.equal(manifest.dashboard.homepagePreservePlanner, "kairos-homepage-preserve-planner-20260716-1");
for (const flag of [
  "synchronousChildActionExecution",
  "childActionObjectiveBridgeRequired",
  "queuedAcknowledgementOnlyRetired",
  "childActionDurableReadbackRequired",
  "childActionResultPersistenceRequired",
  "completedWorkTimelineArchiveRequired",
  "currentWorkExcludesCompleted",
  "workArchiveDayWeekMonthGroupingRequired",
  "workArchiveItemsRemainClickable",
  "homepagePreserveDesignExecutionRequired",
  "oneButtonHomepagePreviewRequired",
  "automaticStagingPreviewExecution",
  "designTokenPreservationRequired",
  "homepageTemplatePreservationRequired",
  "homepageStylesheetPreservationRequired",
  "homepageMarkupSignaturePreservationRequired",
  "homepageStyledTextNodeDistributionRequired",
  "structuralIntentOverridesContentOnlyLock",
  "websiteRetoolDefaultsToStructural",
  "literalContentOnlyIsolationRequired",
  "boundedInternalAutomaticExecution",
  "eventDrivenAutonomousExecution",
  "verifiedNativeTaskArtifactsRequired",
  "nativeTaskReadbackBeforeCompletion",
  "explicitPreviewApprovalRequired",
  "explicitLiveApplicationRequired",
  "finalLiveApprovalRequired",
  "web003CompositeWebsiteProductionRequired",
  "compositeWebsiteRollbackRequired",
]) assert.equal(manifest.approvedExpansion[flag], true, `Frozen baseline flag is not enabled: ${flag}`);
assert.equal(manifest.approvedExpansion.automaticExternalExecution, false);
assert.equal(manifest.approvedExpansion.modelReasoningPersisted, false);

const activeEntries = sources.wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim()));
assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry-v40.js"']);
requiredAll(sources.wrangler, [
  '[ai]', 'binding = "AI"', 'name = "KAIROS_PROJECTS"',
  'KAIROS_AUTONOMY_ENABLED = "true"',
  'KAIROS_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"',
  'crons = ["*/15 * * * *"]',
], "Wrangler");

requiredAll(sources.entry, [
  './kairos-production-entry-v39.js',
  './kairos-homepage-preserve-planner-v1.js',
  './kairos-liquid-content-only-executor-v1.js',
  'kairos-production-entry-20260716-97',
  'homepagePreserveDesign',
  'oneButtonHomepagePreview',
  'completedWorkTimelineArchive',
  'objective-to-node-preserving-homepage-preview',
  'X-Kairos-Homepage-Mode',
  'template-css-markup-node-distribution',
], "Production entry v40");
requiredAll(sources.priorEntry, [
  'kairos-production-entry-v38.js',
  'structural-objective-overrode-content-only-lock',
  'structuralIntentOverridesContentOnlyLock',
  'websiteRetoolDefaultsToStructural',
], "Preserved production entry v39");

requiredAll(sources.preservePlanner, [
  'kairos-homepage-preserve-planner-20260716-1',
  'runKairosIntelligence',
  'parseStrictJSON',
  'visibleTextInventory',
  'preserveExistingDesign',
  'markupSignature',
  'nodeDistributionPreserved',
  'templateUnchanged',
  'stylesheetUnchanged',
  'existing-liquid-visible-text',
  'intelligent-preserve-design-copy',
  'The current HTML, Liquid, classes, colors, typography, pills, cards, spacing, section order, links, template, stylesheet, and layout are immutable.',
], "Preserve-design homepage planner");
requiredAll(sources.liquidExecutor, [
  'existing-liquid-visible-text',
  'nodeDistributionPreserved',
  'liquid_markup_signature_mismatch',
  'non_content_file_changed',
  'templateUnchanged:true',
  'stylesheetUnchanged:true',
  'writeThemeFile',
], "Node-preserving Shopify executor");

requiredAll(sources.index, [
  'kairos-command-center-operational-20260716-16',
  '/styles/homepage-quick-action.css?v=operational-20260716-1',
  '/scripts/homepage-quick-action.js?v=operational-20260716-1',
  '/scripts/website-intent-router.js?v=operational-20260716-2',
  '/scripts/child-action-bridge.js?v=operational-20260716-1',
], "Command Center index");
requiredAll(sources.homepageQuick, [
  'kairos-homepage-quick-action-20260716-1',
  'Homepage Quick Action',
  'Current design locked',
  'Build My Homepage Preview',
  'homepage-preserve-design',
  'preserve-current-design',
  'preserveExistingDesign:true',
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification',
  '/api/shopify/staging/visual-approval',
  '/api/shopify/homepage-release/prepare',
  '/api/shopify/homepage-release/publish',
  'Template unchanged',
  'explicit approval',
], "Homepage quick action");
requiredAll(sources.homepageQuickCSS, [
  '.homepage-quick-action',
  '.homepage-design-lock',
  '.homepage-preview-links',
  '@media(max-width:620px)',
  '@media(prefers-reduced-motion:reduce)',
], "Homepage quick action CSS");
for (const marker of prohibited) assert.ok(!sources.homepageQuick.includes(marker), `Homepage quick action contains prohibited behavior: ${marker}`);

requiredAll(sources.workflow, [
  'kairos-workflow-runtime-ui-20260716-4',
  'Work Timeline',
  'Current Work',
  'Completed Timeline',
  'Recent days',
  'Previous weeks',
  'Earlier months',
  'workflow-archive-tier',
  'state.filter==="archive"',
  '!["completed","cancelled"].includes(item.state)',
  'data-open-workflow',
  'Open verified deliverable',
], "Work timeline runtime");
requiredAll(sources.workflowCSS, [
  '.workflow-archive',
  '.workflow-archive-tier',
  '.workflow-archive-group',
  '.workflow-filter.active',
  '@media(max-width:800px)',
], "Work timeline CSS");
for (const marker of prohibited) assert.ok(!sources.workflow.includes(marker), `Work timeline runtime contains prohibited behavior: ${marker}`);

requiredAll(sources.workspace, [
  'kairos-workspace-runtime-20260716-3',
  '"work-queue": workspace("workflow-runtime.js"',
  'workflow-runtime.css',
  'await import(`./${definition.module}?v=${BUILD}`)',
], "Workspace registry");
requiredAll(sources.websiteRouter, [
  'kairos-website-intent-router-20260716-2',
  'EXPLICIT_CONTENT_ONLY',
  'isExplicitContentOnly',
  'structuralObjective',
  'requestType:"full-retool"',
], "Website intent router");
requiredAll(sources.bridge, [
  'kairos-child-action-bridge-20260716-1',
  'Execute & Return Deliverable',
  'fetch("/api/hub/execute"',
  'Open My Work',
], "Child action bridge");
for (const marker of prohibited) {
  assert.ok(!sources.websiteRouter.includes(marker), `Website intent router contains prohibited behavior: ${marker}`);
  assert.ok(!sources.bridge.includes(marker), `Child action bridge contains prohibited behavior: ${marker}`);
}

requiredAll(sources.childRuntime, ['kairos-child-action-runtime-20260716-1', 'const EXECUTE_ROUTE = "/api/hub/execute"', 'artifactReadbackVerified', 'child-action-results'], "Child action runtime");
assert.ok(!sources.childRuntime.includes('"/api/hub/run"'), "Direct execution regressed to the queued-only endpoint");
requiredAll(sources.operational, ["KAIROS_ACTION_CONTRACTS", "ledgerBatchUpsert", "work-items", "execution-receipts"], "Operational runtime");
requiredAll(sources.autonomy, ["runAutonomyCycle", "executeNativeTask", "artifactReadbackVerified: true", "atomicCommitVerified: true"], "Autonomy runtime");
requiredAll(sources.nativeTask, ["executeNativeTask", "native-task-artifacts", "durableReadbackRequired: true", "crypto.subtle.digest"], "Native task runtime");
requiredAll(sources.intelligence, ['openai: "prohibited"', 'openAIModels: "prohibited"', 'cloudflare-account-scoped', '@cf/qwen/qwen3-30b-a3b-fp8', 'customer-content-isolated-no-training'], "Intelligence policy");
requiredAll(sources.web003, ["buildCompositePlan", "mergeCompositeExecution", "websiteRetoolExceptions", "nativeThemeDecision", "web-003-composite", "rollbackCanonicalExecution"], "WEB-003 runtime");
requiredAll(sources.hub, ['/api/shopify/staging/plan/jobs', '/api/shopify/staging/execute/jobs', '/api/shopify/staging/visual-verification', '/api/shopify/homepage-release/publish', 'openDomainWorkspace'], "Command Hub");

console.log(`KAIROS_FROZEN_STANDARD=${JSON.stringify({
  status: "passed",
  baseline: manifest.baseline,
  workerEntry: manifest.worker.entry,
  homepagePreservePlanner: manifest.dashboard.homepagePreservePlanner,
  homepageQuickAction: manifest.dashboard.homepageQuickAction,
  workflowRuntime: manifest.dashboard.workflowRuntime,
  completedWorkTimelineArchive: true,
  workArchiveGrouping: "day-week-month",
  currentWorkExcludesCompleted: true,
  homepagePreserveDesignExecution: true,
  oneButtonHomepagePreview: true,
  stagingPreviewAutomatic: true,
  templateStylesheetAndMarkupPreserved: true,
  previewApprovalRequired: true,
  liveApplicationApprovalRequired: true,
  objectiveToVerifiedDeliverable: true,
  queuedAcknowledgementOnly: "retired",
})}`);