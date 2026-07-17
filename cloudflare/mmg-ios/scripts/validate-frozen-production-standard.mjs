import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "../..");
const read = path => readFileSync(path, "utf8");
const requireFile = path => assert.ok(existsSync(path), `Missing production file: ${path}`);
const requireAll = (source, markers, label) => markers.forEach(marker => assert.ok(source.includes(marker), `${label} missing: ${marker}`));

const paths = {
  manifest: join(root, "production-baseline.json"),
  wrangler: join(root, "wrangler.toml"),
  entry: join(root, "src/kairos-production-entry-v46.js"),
  deterministicEntry: join(root, "src/kairos-production-entry-v45.js"),
  sourceBoundEntry: join(root, "src/kairos-production-entry-v44.js"),
  deterministicFirst: join(root, "src/kairos-web003-deterministic-first-runtime-v1.js"),
  composite: join(root, "src/kairos-web003-source-bound-composite-runtime-v1.js"),
  deterministic: join(root, "src/kairos-homepage-deterministic-copy-planner-v1.js"),
  deterministicMarkup: join(root, "src/kairos-homepage-deterministic-markup-copy-planner-v1.js"),
  deterministicLiquid: join(root, "src/kairos-homepage-deterministic-liquid-copy-planner-v1.js"),
  intelligence: join(root, "src/kairos-intelligence-v1.js"),
  executor: join(root, "src/kairos-homepage-template-text-executor-v1.js"),
  liquidExecutor: join(root, "src/kairos-homepage-liquid-text-fallback-v1.js"),
  nativeExceptions: join(root, "src/kairos-website-retool-exception-executor-v1.js"),
  dashboard: join(repo, "web/kairos-dashboard/index.html"),
  hub: join(repo, "web/kairos-dashboard/scripts/command-hub.js"),
};
Object.values(paths).forEach(requireFile);
const manifest = JSON.parse(read(paths.manifest));
const sources = Object.fromEntries(Object.entries(paths).filter(([name]) => name !== "manifest").map(([name, path]) => [name, read(path)]));

assert.equal(manifest.status, "frozen");
assert.equal(manifest.baseline, "kairos-production-standard-20260717-46");
assert.equal(manifest.worker.entry, "src/kairos-production-entry-v46.js");
assert.equal(manifest.worker.build, "kairos-production-entry-20260717-104");
assert.equal(manifest.dashboard.selfContainedCommandCenter, "kairos-command-center-inline-20260717-1");
assert.equal(manifest.dashboard.web003SourceBoundComposite, "kairos-web003-source-bound-composite-runtime-20260717-3");
assert.equal(manifest.dashboard.web003DeterministicFirst, "kairos-web003-deterministic-first-runtime-20260717-3");
assert.equal(manifest.dashboard.homepageDeterministicCopyPlanner, "kairos-homepage-deterministic-copy-planner-20260717-1");
assert.equal(manifest.dashboard.homepageDeterministicMarkupCopyPlanner, "kairos-homepage-deterministic-markup-copy-planner-20260717-1");
assert.equal(manifest.dashboard.homepageDeterministicLiquidCopyPlanner, "kairos-homepage-deterministic-liquid-copy-planner-20260717-1");
for (const flag of [
  "homepageVisibleTextDeltaRequired",
  "homepageCanonicalPackageFallbackProhibited",
  "sourceBoundCopyCompositeRequired",
  "sourceBoundCopyDeltaBeforeNativeThemeRequired",
  "canonicalNoOpCompositePreviewProhibited",
  "deterministicHomepageCopyFallbackRequired",
  "deterministicFallbackSourceHashBindingRequired",
  "deterministicFirstCombinedWebsitePlanningRequired",
  "combinedWebsiteModelFormattingDependencyRetired",
  "deterministicEmbeddedMarkupCopyRequired",
  "embeddedMarkupTokenPreservationRequired",
  "embeddedMarkupNodeDistributionPreservationRequired",
  "deterministicHomepageLiquidCopyRequired",
  "homepageSpecificLiquidDeterministicFallbackRequired",
  "deterministicLiquidMarkupSignatureRequired",
  "deterministicLiquidNodeDistributionRequired",
  "explicitPreviewApprovalRequired",
  "explicitLiveApplicationRequired",
  "finalLiveApprovalRequired",
  "liveReadbackVerificationRequired",
  "rollbackReceiptRequired",
  "rootAppShellDirectAssetsRequired",
  "rootAppNoStoreRequired"
]) assert.equal(manifest.approvedExpansion[flag], true, `Required production doctrine is disabled: ${flag}`);
assert.equal(manifest.approvedExpansion.automaticExternalExecution, false);
assert.equal(manifest.approvedExpansion.modelReasoningPersisted, false);
assert.equal(manifest.approvedExpansion.activeEdge, "src/kairos-production-entry-v46.js");
assert.equal(manifest.approvedExpansion.preservesPriorEdge, "src/kairos-production-entry-v45.js");
assert.equal(manifest.approvedExpansion.preservesSourceBoundEdge, "src/kairos-production-entry-v44.js");

const activeEntries = sources.wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim()));
assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry-v46.js"']);
requireAll(sources.wrangler, [
  '[assets]', 'run_worker_first = true', '[ai]', 'binding = "AI"',
  'SHOPIFY_STORE_DOMAIN = "07kd8e-qw.myshopify.com"',
  'MMG_STOREFRONT_ORIGIN = "https://themindsetmediagroup.com"'
], "Wrangler");
requireAll(sources.entry, [
  './kairos-production-entry-v45.js',
  'kairos-production-entry-20260717-104',
  'ROOT_SHELL_PATHS',
  'new Set(["/", "/index.html"])',
  'serveRootShell',
  'direct-assets-root-shell',
  'no-store, no-cache, must-revalidate',
  'X-Kairos-App-Entry'
], "Production entry v46");
requireAll(sources.deterministicEntry, [
  './kairos-production-entry-v44.js', './kairos-web003-deterministic-first-runtime-v1.js',
  'kairos-production-entry-20260717-103', 'handleDeterministicFirstWeb003Request',
  'modelFormattedCopyPlanDependency: "retired-for-combined-retool"',
  'X-Kairos-Deterministic-WEB-003',
  '/api/website/diagnostics/deterministic-plan',
  'liquidTextPatches'
], "Preserved production entry v45");
requireAll(sources.sourceBoundEntry, [
  './kairos-production-entry-v43.js', './kairos-web003-source-bound-composite-runtime-v1.js',
  'kairos-production-entry-20260717-102', 'handleSourceBoundWeb003Request'
], "Preserved production entry v44");
requireAll(sources.deterministicFirst, [
  'kairos-web003-deterministic-first-runtime-20260717-3',
  './kairos-homepage-deterministic-copy-planner-v1.js',
  './kairos-homepage-deterministic-markup-copy-planner-v1.js',
  './kairos-homepage-deterministic-liquid-copy-planner-v1.js',
  'deterministicTextPlan',
  'deterministicMarkupPlanner.fetch',
  'deterministicLiquidPlanner.fetch',
  'plain-template-settings',
  'embedded-template-markup',
  'homepage-specific-liquid',
  'buildCompositePlan',
  'sourceBoundCopyComposite = true',
  'deterministicFirst = true',
  'canonicalPackage = null',
  'canonicalHomepageInstallation: false',
  'modelPlanningRequired: false',
  'unchangedPreviewProhibited: true'
], "Deterministic-first WEB-003 planner");
requireAll(sources.composite, [
  'kairos-web003-source-bound-composite-runtime-20260717-3',
  'canonicalPackage = null',
  'canonicalHomepageInstallation: false',
  'executeWebsiteRetoolExceptions',
  'published-main-template-text-settings-v1',
  'published-main-liquid-visible-text-v1',
  'published-main-homepage-instance-liquid-text-v1'
], "Source-bound execution composite");
requireAll(sources.deterministic, [
  'kairos-homepage-deterministic-copy-planner-20260717-1',
  'activePlainTextCandidates',
  'buildDeterministicOperations',
  'published-main-template-text-settings-v1',
  'deterministicFallback: true',
  'canonicalPackage: null',
  'productionPublishAuthorized: false',
  'liveThemeMutationAuthorized: false',
  'publishedFrameworkPreserved: true',
  'expectedCandidateSha256',
  'publishedSemanticHash',
  'candidateSemanticHash'
], "Deterministic plain copy planner");
assert.ok(!sources.deterministic.includes('writeThemeFile('), "Deterministic plain planner must remain read-only");
requireAll(sources.deterministicMarkup, [
  'kairos-homepage-deterministic-markup-copy-planner-20260717-1',
  'activeEmbeddedMarkupSettings',
  'buildGroups',
  'writeGroupPreservingNodes',
  'markupSignature',
  'visibleReplacements',
  'embeddedMarkupTextOnly: true',
  'nodeDistributionPreserved: true',
  'published-main-template-text-settings-v1',
  'canonicalPackage: null',
  'productionPublishAuthorized: false',
  'liveThemeMutationAuthorized: false',
  'expectedCandidateSha256',
  'publishedSemanticHash',
  'candidateSemanticHash'
], "Deterministic embedded markup copy planner");
assert.ok(!sources.deterministicMarkup.includes('writeThemeFile('), "Deterministic embedded markup planner must remain read-only");
requireAll(sources.deterministicLiquid, [
  'kairos-homepage-deterministic-liquid-copy-planner-20260717-1',
  'activeHomepageSectionFilenames',
  'isHomepageSpecificSection',
  'buildGroups',
  'buildDeterministicReplacements',
  'writeGroupPreservingNodes',
  'markupSignature',
  'published-main-liquid-visible-text-v1',
  'liquidTextPatches',
  'nodeDistributionPreserved: true',
  'deterministicFallback: true',
  'canonicalPackage: null',
  'productionPublishAuthorized: false',
  'liveThemeMutationAuthorized: false',
  'expectedCandidateSha256'
], "Deterministic homepage Liquid copy planner");
assert.ok(!sources.deterministicLiquid.includes('writeThemeFiles('), "Deterministic Liquid planner must remain read-only");
requireAll(sources.intelligence, [
  'STRUCTURED_OUTPUT_ATTEMPTS = 3',
  'structured-retry-',
  'parseStrictJSON(text)',
  'openai: "prohibited"',
  'cloudflare-account-scoped',
  '@cf/qwen/qwen3-30b-a3b-fp8'
], "Intelligence runtime");
requireAll(sources.executor, [
  'published-main-template-text-settings-v1',
  'writeThemeFile',
  'homepage_template_readback_mismatch',
  'published_main_theme_changed',
  'productionPublishAuthorized: false'
], "Template text executor");
requireAll(sources.liquidExecutor, [
  'published-main-liquid-visible-text-v1',
  'writeThemeFiles',
  'homepage_liquid_readback_mismatch',
  'published_main_theme_changed',
  'nodeDistributionPreserved: true'
], "Liquid text executor");
requireAll(sources.nativeExceptions, [
  'executeWebsiteRetoolExceptions',
  'rollbackWebsiteRetoolExceptions',
  'targetThemeID',
  'sourceSha256'
], "Native theme exception executor");
requireAll(sources.dashboard, [
  'id="kairos-hub"',
  'kairos-command-center-inline-20260717-1',
  '/scripts/command-hub.js',
  '/scripts/website-intent-router.js'
], "Dashboard");
requireAll(sources.hub, [
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification',
  '/api/shopify/homepage-release/publish'
], "Command Hub");

console.log(`KAIROS_FROZEN_STANDARD=${JSON.stringify({
  status: "passed",
  baseline: manifest.baseline,
  workerEntry: manifest.worker.entry,
  workerBuild: manifest.worker.build,
  rootShell: manifest.dashboard.selfContainedCommandCenter,
  deterministicFirst: manifest.dashboard.web003DeterministicFirst,
  deterministicTextSources: ["plain-template-settings", "embedded-template-markup", "homepage-specific-liquid"],
  deterministicPlainCopyPlanner: manifest.dashboard.homepageDeterministicCopyPlanner,
  deterministicMarkupCopyPlanner: manifest.dashboard.homepageDeterministicMarkupCopyPlanner,
  deterministicLiquidCopyPlanner: manifest.dashboard.homepageDeterministicLiquidCopyPlanner,
  modelPlanningRequiredForCombinedRetool: false,
  canonicalNoOpPreview: "prohibited",
  visibleCopyDeltaRequired: true,
  rootAppDirectAssetShell: true,
  stagingOnlyBeforeApproval: true,
  liveApprovalRequired: true
})}`);
