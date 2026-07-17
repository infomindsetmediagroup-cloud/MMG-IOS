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
  entry: join(root, "src/kairos-production-entry-v43.js"),
  priorEntry: join(root, "src/kairos-production-entry-v42.js"),
  preservePlanner: join(root, "src/kairos-homepage-preserve-planner-v1.js"),
  renderedPlanner: join(root, "src/kairos-rendered-homepage-text-planner-v1.js"),
  markupPlanner: join(root, "src/kairos-homepage-template-markup-text-planner-v1.js"),
  templateExecutor: join(root, "src/kairos-homepage-template-text-executor-v1.js"),
  liquidFallback: join(root, "src/kairos-homepage-liquid-text-fallback-v1.js"),
  instancePlanner: join(root, "src/kairos-homepage-instance-liquid-fallback-v1.js"),
  instanceExecutor: join(root, "src/kairos-homepage-instance-liquid-executor-v2.js"),
  childRuntime: join(root, "src/kairos-child-action-runtime-v1.js"),
  operational: join(root, "src/kairos-operational-runtime-v1.js"),
  autonomy: join(root, "src/kairos-autonomy-runtime-v1.js"),
  nativeTask: join(root, "src/kairos-native-task-execution-v1.js"),
  intelligence: join(root, "src/kairos-intelligence-v1.js"),
  web003: join(root, "src/kairos-web003-composite-runtime-v1.js"),
  index: join(repo, "web/kairos-dashboard/index.html"),
  reset: join(repo, "web/kairos-dashboard/scripts/homepage-session-reset-v5.js"),
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
assert.equal(manifest.baseline, "kairos-production-standard-20260717-38");
assert.equal(manifest.worker.entry, "src/kairos-production-entry-v43.js");
assert.equal(manifest.worker.build, "kairos-production-entry-20260717-101");
assert.equal(manifest.dashboard.homepageQuickAction, "kairos-homepage-quick-action-20260717-4");
assert.equal(manifest.dashboard.homepageSessionReset, "kairos-homepage-session-reset-20260717-1");
assert.equal(manifest.dashboard.homepageTemplateMarkupTextPlanner, "kairos-homepage-template-markup-text-planner-20260717-1");
assert.equal(manifest.dashboard.homepageLiquidTextFallback, "kairos-homepage-liquid-text-fallback-20260716-1");
assert.equal(manifest.dashboard.homepageInstanceLiquidFallback, "kairos-homepage-instance-liquid-fallback-20260717-1");
assert.equal(manifest.dashboard.homepageInstanceLiquidExecutor, "kairos-homepage-instance-liquid-executor-20260717-2");

for (const flag of [
  "synchronousChildActionExecution", "childActionObjectiveBridgeRequired", "queuedAcknowledgementOnlyRetired",
  "childActionDurableReadbackRequired", "childActionResultPersistenceRequired", "completedWorkTimelineArchiveRequired",
  "currentWorkExcludesCompleted", "workArchiveDayWeekMonthGroupingRequired", "workArchiveItemsRemainClickable",
  "homepagePreserveDesignExecutionRequired", "oneButtonHomepagePreviewRequired", "automaticStagingPreviewExecution",
  "homepagePublishedMainSourceRequired", "homepagePublishedFrameworkPreservationRequired", "homepageTemplateSettingsFirstRequired",
  "homepageEmbeddedTemplateMarkupTextRequired", "homepageLiteralLiquidTextFallbackRequired", "homepageHomepageSpecificLiquidScopeRequired",
  "homepageSharedSectionInstanceIsolationRequired", "homepageOriginalSharedSectionImmutabilityRequired",
  "homepageSelectedInstanceTypeReferenceOnlyRequired", "homepageDeterministicCloneFilenameRequired",
  "homepageInstanceCloneReadbackRequired", "homepageInstanceExecutorRequired",
  "homepageTemplateSemanticReadbackRequired", "homepageCloneExactReadbackRequired",
  "homepageVisibleTextDeltaRequired", "homepageHiddenTextSuccessProhibited",
  "homepageMarkupSignaturePreservationRequired", "homepageTextNodeDistributionPreservationRequired",
  "homepageLiquidLogicMutationProhibited", "homepageStylesheetMutationProhibitedInPreserveMode",
  "homepageAssetMutationProhibitedInPreserveMode", "homepageClassAndDesignTokenMutationProhibitedInPreserveMode",
  "homepageSectionIdentityPreservationRequired", "homepageBlockIdentityPreservationRequired",
  "homepageSectionAndBlockOrderPreservationRequired", "homepageCanonicalPackageFallbackProhibited",
  "homepageMultiFileStagingRollbackRequired", "homepageStopInsteadOfUnsafeMutationRequired",
  "homepageStaleSessionMigrationRequired", "boundedInternalAutomaticExecution", "eventDrivenAutonomousExecution",
  "verifiedNativeTaskArtifactsRequired", "nativeTaskReadbackBeforeCompletion", "explicitPreviewApprovalRequired",
  "explicitLiveApplicationRequired", "finalLiveApprovalRequired", "web003CompositeWebsiteProductionRequired",
  "compositeWebsiteRollbackRequired"
]) assert.equal(manifest.approvedExpansion[flag], true, `Frozen baseline flag is not enabled: ${flag}`);
assert.equal(manifest.approvedExpansion.automaticExternalExecution, false);
assert.equal(manifest.approvedExpansion.modelReasoningPersisted, false);

const activeEntries = sources.wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim()));
assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry-v43.js"']);
requireAll(sources.wrangler, [
  '[ai]', 'binding = "AI"', 'name = "KAIROS_PROJECTS"', 'KAIROS_AUTONOMY_ENABLED = "true"',
  'KAIROS_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"', 'crons = ["*/15 * * * *"]'
], "Wrangler");

requireAll(sources.entry, [
  './kairos-production-entry-v42.js', './kairos-rendered-homepage-text-planner-v1.js',
  './kairos-homepage-template-markup-text-planner-v1.js', './kairos-homepage-liquid-text-fallback-v1.js',
  './kairos-homepage-instance-liquid-fallback-v1.js', './kairos-homepage-instance-liquid-executor-v2.js',
  'kairos-production-entry-20260717-101', 'homepage_liquid_scope_unsafe',
  'published-main-homepage-instance-liquid-text-v1', 'published-main-four-source-visible-text-preservation',
  'homepage-instance isolated shared-section clone', 'homepageSharedSectionInstanceIsolation: "operational"',
  'homepageOriginalSharedSectionProtection: "required"', 'homepageTemplateSemanticReadback: "required"',
  'instanceExecutorBuild', 'canonical-json-semantics', 'exact-bytes-and-sha256',
  'X-Kairos-Homepage-Instance-Fallback', 'X-Kairos-Homepage-Instance-Executor',
  'X-Kairos-Template-Readback', 'X-Kairos-Clone-Readback',
  'X-Kairos-Original-Shared-Sections', 'X-Kairos-Canonical-Rebuild-Fallback'
], "Production entry v43");
requireAll(sources.priorEntry, [
  './kairos-production-entry-v41.js', './kairos-rendered-homepage-text-planner-v1.js',
  './kairos-homepage-liquid-text-fallback-v1.js', 'kairos-production-entry-20260716-99'
], "Preserved production entry v42");

requireAll(sources.preservePlanner, [
  'kairos-homepage-preserve-planner-20260716-2', 'sourceOfTruth: "published-main-theme"',
  'published-main-template-text-settings-v1', 'onlyExistingStringSettingsChanged: true',
  'publishedFrameworkPreserved: true', 'canonicalPackage: null'
], "Template-settings planner");
requireAll(sources.renderedPlanner, [
  'kairos-rendered-homepage-text-planner-20260716-1', 'activeOrderedSectionsOnly: true',
  'activeOrderedBlocksOnly: true', 'rendered_homepage_text_delta_missing'
], "Rendered text gate");
requireAll(sources.markupPlanner, [
  'kairos-homepage-template-markup-text-planner-20260717-1', 'activeEmbeddedMarkupSettings',
  'embedded_template_markup_text_missing', 'safe_embedded_markup_text_changes_missing',
  'published-main-template-text-settings-v1', 'embeddedMarkupTextOnly: true',
  'visibleTextReplacementCount', 'markupSignature', 'nodeDistributionPreserved: true',
  'canonicalPackage: null', 'productionPublishAuthorized: false', 'liveThemeMutationAuthorized: false'
], "Embedded template markup planner");
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
  'stylesheetsWritten: []', 'assetsWritten: []', 'classesChanged: false', 'designTokensChanged: false'
], "Homepage-specific Liquid fallback");
assert.ok(!sources.liquidFallback.includes('writeThemeFiles(env, evidence.mainTheme.gid'), "Liquid fallback must never write to MAIN");
assert.ok(!sources.markupPlanner.includes('writeThemeFile('), "Embedded markup planner must remain read-only");

requireAll(sources.instancePlanner, [
  'kairos-homepage-instance-liquid-fallback-20260717-1', 'published-main-homepage-instance-liquid-text-v1',
  'homepage-instance-isolated-liquid-literal-text-only', 'originalSharedSourceChanged: false',
  'homepageInstanceIsolated: true', 'markupSignature', 'nodeDistributionPreserved: true',
  'cloneTypeFor', 'kairos-home-', 'published-main-theme', 'visibleTextReplacementCount',
  'The original shared section files remain byte-for-byte unchanged.'
], "Homepage instance isolation planner");
assert.ok(!sources.instancePlanner.includes('writeThemeFiles(env, evidence.mainTheme.gid'), "Instance planner must never write to MAIN");
assert.ok(!sources.instancePlanner.includes('productionPublishAuthorized: true'), "Instance planner must not authorize production publishing");

requireAll(sources.instanceExecutor, [
  'kairos-homepage-instance-liquid-executor-20260717-2', 'published-main-homepage-instance-liquid-text-v1',
  'published-homepage-instance-liquid-text-executor-v2', 'writeThemeFiles(env, evidence.stagingTheme.gid',
  'canonicalJsonEqual', 'canonical-json-semantics', 'exact-bytes-and-sha256',
  'homepageInstanceIsolation: true', 'originalSharedSectionsChanged: false', 'publishedThemeChanged: false',
  'templateSemanticReadbackVerified: true', 'cloneExactReadbackVerified: true',
  'published_main_theme_changed', 'rollbackFiles', 'originalSharedSourceChanged !== false'
], "Homepage instance semantic executor");
assert.ok(!sources.instanceExecutor.includes('writeThemeFiles(env, evidence.mainTheme.gid'), "Instance executor must never write to MAIN");
assert.ok(!sources.instanceExecutor.includes('productionPublishAuthorized: true'), "Instance executor must not authorize production publishing");

requireAll(sources.index, [
  'kairos-command-center-operational-20260717-19',
  '/scripts/homepage-session-reset-v5.js?v=operational-20260717-1',
  '/scripts/homepage-quick-action.js?v=operational-20260717-4',
  '/scripts/website-intent-router.js?v=operational-20260716-2',
  '/scripts/child-action-bridge.js?v=operational-20260716-1'
], "Command Center index");
requireAll(sources.reset, [
  'kairos-homepage-session-reset-20260717-1', 'kairos.homepage.session-migration.v5',
  'kairos.homepage.quick-action.v4', 'sessionStorage.removeItem'
], "Homepage session reset");
requireAll(sources.quick, [
  'kairos-homepage-quick-action-20260717-4', 'kairos.homepage.quick-action.v5',
  'kairos.homepage.quick-action.v4', 'Keep my homepage. Change the words.',
  'literalLiquidTextFallbackAuthorized: true', 'homepageInstanceIsolationAuthorized: true',
  'originalSharedSectionsImmutable: true', 'published-main-template-text-settings-v1',
  'published-main-liquid-visible-text-v1', 'published-main-homepage-instance-liquid-text-v1',
  'templateTextOnly', 'liquidTextOnly', 'homepageInstanceIsolation',
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
  workerBuild: manifest.worker.build,
  homepageTextSourceOrder: ["template-settings", "embedded-template-markup", "homepage-specific-liquid", "homepage-instance-clone"],
  instancePlanner: manifest.dashboard.homepageInstanceLiquidFallback,
  instanceExecutor: manifest.dashboard.homepageInstanceLiquidExecutor,
  originalSharedSections: "immutable",
  templateReadback: "canonical-json-semantics",
  cloneReadback: "exact-bytes-and-sha256",
  selectedHomepageInstanceIsolation: true,
  visibleTextDeltaRequired: true,
  publishedFrameworkPreserved: true,
  stagingOnlyBeforeApproval: true,
  canonicalRebuildFallback: "prohibited",
  objectiveToVerifiedDeliverable: true,
  queuedAcknowledgementOnly: "retired"
})}`);
