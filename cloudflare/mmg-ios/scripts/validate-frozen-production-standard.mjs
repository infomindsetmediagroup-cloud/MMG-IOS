import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "../..");
const read = path => readFileSync(path, "utf8");
const requireMarker = (source, marker, label) => assert.ok(source.includes(marker), `${label} missing: ${marker}`);
const requireAll = (source, markers, label) => markers.forEach(marker => requireMarker(source, marker, label));
const prohibitedUI = ["MutationObserver", "setInterval(", "scrollIntoView", "scrollTo(", "scrollBy("];

const paths = {
  manifest: join(root, "production-baseline.json"),
  wrangler: join(root, "wrangler.toml"),
  entry: join(root, "src/kairos-production-entry-v42.js"),
  priorEntry: join(root, "src/kairos-production-entry-v41.js"),
  preservePlanner: join(root, "src/kairos-homepage-preserve-planner-v1.js"),
  renderedPlanner: join(root, "src/kairos-rendered-homepage-text-planner-v1.js"),
  templateExecutor: join(root, "src/kairos-homepage-template-text-executor-v1.js"),
  liquidFallback: join(root, "src/kairos-homepage-liquid-text-fallback-v1.js"),
  childRuntime: join(root, "src/kairos-child-action-runtime-v1.js"),
  operational: join(root, "src/kairos-operational-runtime-v1.js"),
  autonomy: join(root, "src/kairos-autonomy-runtime-v1.js"),
  nativeTask: join(root, "src/kairos-native-task-execution-v1.js"),
  intelligence: join(root, "src/kairos-intelligence-v1.js"),
  web003: join(root, "src/kairos-web003-composite-runtime-v1.js"),
  index: join(repo, "web/kairos-dashboard/index.html"),
  quick: join(repo, "web/kairos-dashboard/scripts/homepage-quick-action.js"),
  quickCSS: join(repo, "web/kairos-dashboard/styles/homepage-quick-action.css"),
  bridge: join(repo, "web/kairos-dashboard/scripts/child-action-bridge.js"),
  websiteRouter: join(repo, "web/kairos-dashboard/scripts/website-intent-router.js"),
  workflow: join(repo, "web/kairos-dashboard/scripts/workflow-runtime.js"),
  workflowCSS: join(repo, "web/kairos-dashboard/styles/workflow-runtime.css"),
  hub: join(repo, "web/kairos-dashboard/scripts/command-hub.js"),
  workspace: join(repo, "web/kairos-dashboard/scripts/workspace-runtime.js"),
};
for (const [name, path] of Object.entries(paths)) assert.ok(existsSync(path), `Missing production file: ${name}`);
const manifest = JSON.parse(read(paths.manifest));
const sources = Object.fromEntries(Object.entries(paths).filter(([name]) => name !== "manifest").map(([name, path]) => [name, read(path)]));

assert.equal(manifest.status, "frozen");
assert.equal(manifest.baseline, "kairos-production-standard-20260716-35");
assert.equal(manifest.worker.entry, "src/kairos-production-entry-v42.js");
assert.equal(manifest.dashboard.homepageQuickAction, "kairos-homepage-quick-action-20260716-3");
assert.equal(manifest.dashboard.homepagePreservePlanner, "kairos-homepage-preserve-planner-20260716-2");
assert.equal(manifest.dashboard.homepageRenderedTextPlanner, "kairos-rendered-homepage-text-planner-20260716-1");
assert.equal(manifest.dashboard.homepageTemplateTextExecutor, "kairos-homepage-template-text-executor-20260716-1");
assert.equal(manifest.dashboard.homepageLiquidTextFallback, "kairos-homepage-liquid-text-fallback-20260716-1");
for (const flag of [
  "synchronousChildActionExecution", "childActionObjectiveBridgeRequired", "queuedAcknowledgementOnlyRetired",
  "childActionDurableReadbackRequired", "childActionResultPersistenceRequired", "completedWorkTimelineArchiveRequired",
  "currentWorkExcludesCompleted", "workArchiveDayWeekMonthGroupingRequired", "workArchiveItemsRemainClickable",
  "homepagePreserveDesignExecutionRequired", "oneButtonHomepagePreviewRequired", "automaticStagingPreviewExecution",
  "homepagePublishedMainSourceRequired", "homepagePublishedFrameworkPreservationRequired", "homepageTemplateSettingsFirstRequired",
  "homepageLiteralLiquidTextFallbackRequired", "homepageHomepageSpecificLiquidScopeRequired", "homepageVisibleTextDeltaRequired",
  "homepageHiddenTextSuccessProhibited", "homepageLiquidMarkupSignaturePreservationRequired",
  "homepageLiquidTextNodeDistributionPreservationRequired", "homepageLiquidLogicMutationProhibited",
  "homepageStylesheetMutationProhibitedInPreserveMode", "homepageAssetMutationProhibitedInPreserveMode",
  "homepageClassAndDesignTokenMutationProhibitedInPreserveMode", "homepageSectionIdentityPreservationRequired",
  "homepageBlockIdentityPreservationRequired", "homepageSectionAndBlockOrderPreservationRequired",
  "homepageCanonicalPackageFallbackProhibited", "homepageMultiFileStagingRollbackRequired",
  "homepageStopInsteadOfUnsafeMutationRequired", "boundedInternalAutomaticExecution", "eventDrivenAutonomousExecution",
  "verifiedNativeTaskArtifactsRequired", "nativeTaskReadbackBeforeCompletion", "explicitPreviewApprovalRequired",
  "explicitLiveApplicationRequired", "finalLiveApprovalRequired", "web003CompositeWebsiteProductionRequired",
  "compositeWebsiteRollbackRequired"
]) assert.equal(manifest.approvedExpansion[flag], true, `Frozen baseline flag is not enabled: ${flag}`);
assert.equal(manifest.approvedExpansion.automaticExternalExecution, false);
assert.equal(manifest.approvedExpansion.modelReasoningPersisted, false);

const activeEntries = sources.wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim()));
assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry-v42.js"']);
requireAll(sources.wrangler, [
  '[ai]', 'binding = "AI"', 'name = "KAIROS_PROJECTS"', 'KAIROS_AUTONOMY_ENABLED = "true"',
  'KAIROS_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"', 'crons = ["*/15 * * * *"]'
], "Wrangler");

requireAll(sources.entry, [
  './kairos-production-entry-v41.js', './kairos-rendered-homepage-text-planner-v1.js',
  './kairos-homepage-liquid-text-fallback-v1.js', 'kairos-production-entry-20260716-99',
  'rendered_homepage_text_delta_missing', 'published_homepage_text_settings_missing',
  'safe_template_text_changes_missing', 'published-main-liquid-visible-text-v1',
  'published-main-template-settings-then-node-preserving-liquid-text',
  'homepageLiquidLiteralTextFallback: "operational"', 'X-Kairos-Homepage-Liquid-Fallback',
  'X-Kairos-Canonical-Rebuild-Fallback', 'published-main-theme'
], "Production entry v42");
requireAll(sources.priorEntry, [
  './kairos-production-entry-v40.js', './kairos-homepage-template-text-executor-v1.js',
  'kairos-production-entry-20260716-98', 'published-main-template-text-settings-v1'
], "Preserved production entry v41");

requireAll(sources.preservePlanner, [
  'kairos-homepage-preserve-planner-20260716-2', 'sourceOfTruth: "published-main-theme"',
  'published-main-template-text-settings-v1', 'onlyExistingStringSettingsChanged: true',
  'publishedFrameworkPreserved: true', 'canonicalPackage: null'
], "Template-settings planner");
requireAll(sources.renderedPlanner, [
  'kairos-rendered-homepage-text-planner-20260716-1', 'activeOrderedSectionsOnly: true',
  'activeOrderedBlocksOnly: true', 'rendered_homepage_text_delta_missing'
], "Rendered text gate");
requireAll(sources.templateExecutor, [
  'kairos-homepage-template-text-executor-20260716-1', 'published-main-template-text-settings-v1',
  'writeThemeFile', 'publishedFrameworkPreserved: true', 'templateTextOnly: true',
  'liquidFilesWritten: []', 'stylesheetsWritten: []', 'assetsWritten: []'
], "Template text executor");

requireAll(sources.liquidFallback, [
  'kairos-homepage-liquid-text-fallback-20260716-1', 'published-main-liquid-visible-text-v1',
  'sourceOfTruth: "published-main-theme"', 'homepage_liquid_scope_unsafe',
  'homepage-specific Liquid section', 'writeThemeFiles', 'markupSignature',
  'nodeDistributionPreserved: true', 'liquidStructureMutationAuthorized: false',
  'canonicalPackage: null', 'visibleTextReplacementCount', 'publishedFrameworkPreserved: true',
  'stylesheetsWritten: []', 'assetsWritten: []', 'classesChanged: false', 'designTokensChanged: false',
  'Rollback restores the exact pre-execution Kairos Staging template and Liquid section files.'
], "Liquid text fallback");
assert.ok(!sources.liquidFallback.includes('writeThemeFiles(env, evidence.mainTheme.gid'), "Liquid fallback must never write to MAIN");
assert.ok(!sources.liquidFallback.includes('productionPublishAuthorized: true'), "Liquid fallback must not authorize production publishing");

requireAll(sources.index, [
  'kairos-command-center-operational-20260716-18',
  '/scripts/homepage-quick-action.js?v=operational-20260716-3',
  '/scripts/website-intent-router.js?v=operational-20260716-2',
  '/scripts/child-action-bridge.js?v=operational-20260716-1'
], "Command Center index");
requireAll(sources.quick, [
  'kairos-homepage-quick-action-20260716-3', 'kairos.homepage.quick-action.v4',
  'kairos.homepage.quick-action.v3', 'Keep my homepage. Change the words.',
  'literalLiquidTextFallbackAuthorized: true', 'published-main-template-text-settings-v1',
  'published-main-liquid-visible-text-v1', 'templateTextOnly', 'liquidTextOnly',
  'visibleTextReplacementCount', 'textSettingReplacementCount',
  '/api/shopify/staging/plan/jobs', '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification', '/api/shopify/staging/visual-approval',
  '/api/shopify/homepage-release/prepare', '/api/shopify/homepage-release/publish'
], "Homepage Quick Action");
requireAll(sources.quickCSS, ['.homepage-quick-action', '.homepage-design-lock', '.homepage-preview-links', '@media(max-width:620px)'], "Homepage Quick Action CSS");
for (const marker of prohibitedUI) assert.ok(!sources.quick.includes(marker), `Homepage Quick Action contains prohibited behavior: ${marker}`);

requireAll(sources.workflow, [
  'kairos-workflow-runtime-ui-20260716-4', 'Work Timeline', 'Current Work', 'Completed Timeline',
  'Recent days', 'Previous weeks', 'Earlier months', 'data-open-workflow', 'Open verified deliverable'
], "Work timeline");
requireAll(sources.workflowCSS, ['.workflow-archive', '.workflow-archive-tier', '.workflow-archive-group'], "Work timeline CSS");
requireAll(sources.workspace, ['kairos-workspace-runtime-20260716-3', 'workflow-runtime.js', 'await import(`./${definition.module}?v=${BUILD}`)'], "Workspace registry");
requireAll(sources.websiteRouter, ['kairos-website-intent-router-20260716-2', 'EXPLICIT_CONTENT_ONLY', 'requestType:"full-retool"'], "Website intent router");
requireAll(sources.bridge, ['kairos-child-action-bridge-20260716-1', 'Execute & Return Deliverable', 'fetch("/api/hub/execute"'], "Child action bridge");
requireAll(sources.childRuntime, ['kairos-child-action-runtime-20260716-1', 'const EXECUTE_ROUTE = "/api/hub/execute"', 'artifactReadbackVerified', 'child-action-results'], "Child action runtime");
assert.ok(!sources.childRuntime.includes('"/api/hub/run"'), "Direct execution regressed to queued-only endpoint");
requireAll(sources.operational, ['KAIROS_ACTION_CONTRACTS', 'ledgerBatchUpsert', 'work-items', 'execution-receipts'], "Operational runtime");
requireAll(sources.autonomy, ['runAutonomyCycle', 'executeNativeTask', 'artifactReadbackVerified: true', 'atomicCommitVerified: true'], "Autonomy runtime");
requireAll(sources.nativeTask, ['executeNativeTask', 'native-task-artifacts', 'durableReadbackRequired: true', 'crypto.subtle.digest'], "Native task runtime");
requireAll(sources.intelligence, ['openai: "prohibited"', 'openAIModels: "prohibited"', 'cloudflare-account-scoped', '@cf/qwen/qwen3-30b-a3b-fp8'], "Intelligence policy");
requireAll(sources.web003, ['buildCompositePlan', 'mergeCompositeExecution', 'web-003-composite', 'rollbackCanonicalExecution'], "WEB-003 runtime");
requireAll(sources.hub, ['/api/shopify/staging/plan/jobs', '/api/shopify/staging/execute/jobs', '/api/shopify/staging/visual-verification', '/api/shopify/homepage-release/publish'], "Command Hub");

console.log(`KAIROS_FROZEN_STANDARD=${JSON.stringify({
  status: "passed",
  baseline: manifest.baseline,
  workerEntry: manifest.worker.entry,
  homepageQuickAction: manifest.dashboard.homepageQuickAction,
  homepageTextSourceOrder: ["template-settings", "homepage-specific-liquid-literal-text"],
  liquidFallback: manifest.dashboard.homepageLiquidTextFallback,
  visibleTextDeltaRequired: true,
  publishedFrameworkPreserved: true,
  markupAndNodeDistributionPreserved: true,
  stagingOnlyBeforeApproval: true,
  canonicalRebuildFallback: "prohibited",
  objectiveToVerifiedDeliverable: true,
  queuedAcknowledgementOnly: "retired"
})}`);
