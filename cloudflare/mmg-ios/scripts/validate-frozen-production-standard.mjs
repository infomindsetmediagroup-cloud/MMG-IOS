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
  entry: join(root, "src/kairos-production-entry-v45.js"),
  priorEntry: join(root, "src/kairos-production-entry-v44.js"),
  deterministicFirst: join(root, "src/kairos-web003-deterministic-first-runtime-v1.js"),
  composite: join(root, "src/kairos-web003-source-bound-composite-runtime-v1.js"),
  deterministic: join(root, "src/kairos-homepage-deterministic-copy-planner-v1.js"),
  intelligence: join(root, "src/kairos-intelligence-v1.js"),
  executor: join(root, "src/kairos-homepage-template-text-executor-v1.js"),
  nativeExceptions: join(root, "src/kairos-website-retool-exception-executor-v1.js"),
  dashboard: join(repo, "web/kairos-dashboard/index.html"),
  hub: join(repo, "web/kairos-dashboard/scripts/command-hub.js"),
};
Object.values(paths).forEach(requireFile);
const manifest = JSON.parse(read(paths.manifest));
const sources = Object.fromEntries(Object.entries(paths).filter(([name]) => name !== "manifest").map(([name, path]) => [name, read(path)]));

assert.equal(manifest.status, "frozen");
assert.equal(manifest.baseline, "kairos-production-standard-20260717-43");
assert.equal(manifest.worker.entry, "src/kairos-production-entry-v45.js");
assert.equal(manifest.worker.build, "kairos-production-entry-20260717-103");
assert.equal(manifest.dashboard.web003SourceBoundComposite, "kairos-web003-source-bound-composite-runtime-20260717-3");
assert.equal(manifest.dashboard.web003DeterministicFirst, "kairos-web003-deterministic-first-runtime-20260717-1");
assert.equal(manifest.dashboard.homepageDeterministicCopyPlanner, "kairos-homepage-deterministic-copy-planner-20260717-1");
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
  "explicitPreviewApprovalRequired",
  "explicitLiveApplicationRequired",
  "finalLiveApprovalRequired",
  "liveReadbackVerificationRequired",
  "rollbackReceiptRequired"
]) assert.equal(manifest.approvedExpansion[flag], true, `Required production doctrine is disabled: ${flag}`);
assert.equal(manifest.approvedExpansion.automaticExternalExecution, false);
assert.equal(manifest.approvedExpansion.modelReasoningPersisted, false);

const activeEntries = sources.wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim()));
assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry-v45.js"']);
requireAll(sources.wrangler, [
  '[assets]', 'run_worker_first = true', '[ai]', 'binding = "AI"',
  'SHOPIFY_STORE_DOMAIN = "07kd8e-qw.myshopify.com"',
  'MMG_STOREFRONT_ORIGIN = "https://themindsetmediagroup.com"'
], "Wrangler");
requireAll(sources.entry, [
  './kairos-production-entry-v44.js', './kairos-web003-deterministic-first-runtime-v1.js',
  'kairos-production-entry-20260717-103', 'handleDeterministicFirstWeb003Request',
  'modelFormattedCopyPlanDependency: "retired-for-combined-retool"',
  'X-Kairos-Deterministic-WEB-003'
], "Production entry v45");
requireAll(sources.priorEntry, [
  './kairos-production-entry-v43.js', './kairos-web003-source-bound-composite-runtime-v1.js',
  'kairos-production-entry-20260717-102', 'handleSourceBoundWeb003Request'
], "Preserved production entry v44");
requireAll(sources.deterministicFirst, [
  'kairos-web003-deterministic-first-runtime-20260717-1',
  './kairos-homepage-deterministic-copy-planner-v1.js',
  'deterministicCopyPlanner.fetch',
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
  './kairos-homepage-deterministic-copy-planner-v1.js',
  'deterministicCopyPlanner.fetch',
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
], "Deterministic copy planner");
assert.ok(!sources.deterministic.includes('writeThemeFile('), "Deterministic planner must remain read-only");
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
requireAll(sources.nativeExceptions, [
  'executeWebsiteRetoolExceptions',
  'rollbackWebsiteRetoolExceptions',
  'targetThemeID',
  'sourceSha256'
], "Native theme exception executor");
requireAll(sources.dashboard, ['id="kairos-hub"', '/scripts/command-hub.js', '/scripts/website-intent-router.js'], "Dashboard");
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
  deterministicFirst: manifest.dashboard.web003DeterministicFirst,
  sourceBoundComposite: manifest.dashboard.web003SourceBoundComposite,
  deterministicCopyPlanner: manifest.dashboard.homepageDeterministicCopyPlanner,
  modelPlanningRequiredForCombinedRetool: false,
  canonicalNoOpPreview: "prohibited",
  visibleCopyDeltaRequired: true,
  stagingOnlyBeforeApproval: true,
  liveApprovalRequired: true
})}`);
