import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD = "kairos-manuscript-production-validator-20260807-canonical-publishing-wrapper-1";
const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(here, "..");
const sourceRoot = join(workerRoot, "src");
const wranglerPath = join(workerRoot, "wrangler.toml");
const canonicalPublishingEntryPath = join(sourceRoot, "kairos-production-entry-canonical-publishing-v1.js");
const canonicalEntryPath = join(sourceRoot, "kairos-production-entry-local-canonical-v1.js");
const localOnlyEntryPath = join(sourceRoot, "kairos-production-entry-local-only-v1.js");
const localExecutionEntryPath = join(sourceRoot, "kairos-production-entry-local-execution-v1.js");
const manuscriptEntryPath = join(sourceRoot, "kairos-production-entry-manuscript-online-v1.js");
const boundaryPath = join(sourceRoot, "kairos-manuscript-operation-boundary-v1.js");
const publishingEntryPath = join(sourceRoot, "kairos-production-entry-publishing-readiness-v1.js");
const setupPath = join(sourceRoot, "kairos-manuscript-project-setup-v1.js");
const packagePath = join(sourceRoot, "kairos-publishing-package-v1.js");
const autoPipelinePath = join(sourceRoot, "kairos-manuscript-auto-pipeline-v1.js");
const productPublicationPath = join(sourceRoot, "kairos-product-publication-v1.js");

for (const file of [
  wranglerPath,
  canonicalPublishingEntryPath,
  canonicalEntryPath,
  localOnlyEntryPath,
  localExecutionEntryPath,
  manuscriptEntryPath,
  boundaryPath,
  publishingEntryPath,
  setupPath,
  packagePath,
  autoPipelinePath,
  productPublicationPath,
]) assert.ok(existsSync(file), `Required manuscript production file is missing: ${file}`);

const wrangler = readFileSync(wranglerPath, "utf8");
const activeEntryMatch = wrangler.match(/^main\s*=\s*"src\/(kairos-production-entry-[^"]+\.js)"/m);
assert.ok(activeEntryMatch, "Wrangler must declare an explicit Kairos production entry.");
const allowedProductionEntries = new Set([
  "kairos-production-entry-local-canonical-v1.js",
  "kairos-production-entry-canonical-publishing-v1.js",
]);
assert.ok(
  allowedProductionEntries.has(activeEntryMatch[1]),
  "Wrangler must point to the canonical local provider firewall or the canonical publishing wrapper that delegates to it.",
);

const canonicalPublishingEntry = readFileSync(canonicalPublishingEntryPath, "utf8");
if (activeEntryMatch[1] === "kairos-production-entry-canonical-publishing-v1.js") {
  assert.ok(
    canonicalPublishingEntry.includes('./kairos-production-entry-local-canonical-v1.js'),
    "Canonical publishing wrapper must delegate to the canonical local provider firewall.",
  );
  assert.ok(
    canonicalPublishingEntry.includes("canonicalRuntime.fetch(request, env, ctx)"),
    "Canonical publishing wrapper must fall through to the canonical local runtime.",
  );
}

for (const marker of [
  'KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"',
  'KAIROS_MANUSCRIPT_START_MODE = "local-browser"',
  'KAIROS_MODEL_PROVIDER = "browser-webgpu"',
  'KAIROS_NO_COST_MODE = "true"',
  'KAIROS_LOCAL_INFERENCE_ENABLED = "true"',
  'KAIROS_CLOUDFLARE_NEURONS_ENABLED = "false"',
  'KAIROS_SHOPIFY_WRITES_ENABLED = "true"',
  'KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"',
  'binding = "ASSETS"',
  'binding = "IMAGES"',
  'name = "KAIROS_PROJECTS"',
  'name = "KAIROS_PROJECT_AGENT"',
  'binding = "KAIROS_PROJECT_WORKFLOW"',
  'binding = "KAIROS_MANUSCRIPT_WORKFLOW"',
]) assert.ok(wrangler.includes(marker), `Required local production configuration is missing: ${marker}`);

const triggerMatch = wrangler.match(/^\[triggers\]\s*\ncrons\s*=\s*\[([^\]]*)\]/mu);
assert.ok(triggerMatch, "Wrangler must declare the governed production cron list.");
const configuredCrons = [...triggerMatch[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
for (const requiredCron of ["0 15 * * *", "0 2 * * * *", "0 * * * *"]) {
  assert.equal(
    configuredCrons.filter((cron) => cron === requiredCron).length,
    1,
    `Required production cron must appear exactly once: ${requiredCron}`,
  );
}
assert.equal(configuredCrons.length, 3, "Wrangler must contain only the two manuscript crons and the governed hourly autonomy cron.");

assert.ok(!wrangler.includes('binding = "AI"'), "Paid Cloudflare AI binding must remain absent.");
assert.ok(!wrangler.includes('KAIROS_MODEL_PROVIDER = "openai"'), "OpenAI must not be configured as the production model provider.");
assert.ok(!wrangler.includes('KAIROS_MODEL_ENDPOINT ='), "A backend model endpoint must not be configured for local-only production.");
assert.ok(!wrangler.includes('KAIROS_MODEL_AUTH_TOKEN ='), "A backend model auth token must not be configured for local-only production.");
assert.ok(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must remain disabled.");

const canonicalEntry = readFileSync(canonicalEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-local-only-v1.js',
  'PROVIDER_INDEPENDENT_OPERATIONAL_PATHS',
  'providerBlockedEnv',
  'operationalCompatibilityEnv',
  'property === "OPENAI_API_KEY"',
  'return ""',
  'kairos-local-readiness-sentinel-not-a-provider-key',
  'X-Kairos-Canonical-Local',
  'X-Kairos-OpenAI-Calls", "disabled"',
]) assert.ok(canonicalEntry.includes(marker), `Canonical local provider firewall is missing: ${marker}`);
assert.ok(!canonicalEntry.includes("handleKairosAPI"), "Canonical local execution must not invoke a provider-backed API handler.");
assert.ok(!canonicalEntry.includes("api.openai.com"), "Canonical local execution must not contain an OpenAI endpoint.");

const localOnlyEntry = readFileSync(localOnlyEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-local-execution-v1.js',
  'LOCAL_APPROVAL',
  'LEGACY_MANUSCRIPT_GENERATION',
  'REVENUE_GENERATION',
  'LOCAL_INFERENCE_REQUIRED',
  'getProjectState',
  'approveFoundationWorkflow(foundation.instanceId',
  'provider: "browser-webgpu"',
  'externalPaidAPIUsed: false',
  'cloudflareNeuronsUsed: 0',
  'backendProviderCalls: false',
  'X-Kairos-External-Provider',
]) assert.ok(localOnlyEntry.includes(marker), `Local-only production boundary is missing: ${marker}`);

const localExecutionEntry = readFileSync(localExecutionEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-operational-execution-v1.js',
  '/api/operational-readiness',
  '/api/kairos',
  'prepare-source',
  'sync-source',
  'start-production',
  'complete-production',
  'browser-webgpu',
  'same-origin-webllm',
  'externalPaidAPIUsed: false',
  'cloudflareNeuronsUsed: 0',
  'automaticPublicationAllowed: false',
  'commerceMutationAllowed: false',
]) assert.ok(localExecutionEntry.includes(marker), `Local execution wrapper is missing: ${marker}`);
assert.ok(!localExecutionEntry.includes("handleKairosAPI"), "Local operational execution must not invoke the provider-backed Kairos API handler.");
assert.ok(!localExecutionEntry.includes("api.openai.com"), "Local operational execution must not contain an OpenAI endpoint.");

const manuscriptEntry = readFileSync(manuscriptEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-publishing-readiness-v1.js',
  './kairos-manuscript-operation-boundary-v1.js',
  './kairos-manuscript-auto-pipeline-v1.js',
  'inspectManuscriptOperation',
  '/api/kairos/manuscripts/status',
  'mode: "manuscript-only"',
  'automaticMetadataExtraction: true',
  'productionReadyAssetManufacturing: true',
  'adminAssetVaultStorage: true',
  'shopifyDraftApprovalRequired: true',
  'liveProductPublicationApprovalRequired: true',
  'websiteMutationAuthorized: false',
  'navigationMutationAuthorized: false',
  'themeMutationAuthorized: false',
]) assert.ok(manuscriptEntry.includes(marker), `Manuscript production entry is missing: ${marker}`);

const boundary = readFileSync(boundaryPath, "utf8");
for (const marker of [
  'MANUSCRIPT_AUTO_PIPELINE',
  'approval-gated-shopify-draft',
  'approval-gated-shopify-publication',
  'WEBSITE_MUTATION_DENIED',
  'OPERATION_OUT_OF_SCOPE',
  'NON_MANUSCRIPT_CONTENT_DENIED',
  'NON_MANUSCRIPT_HUB_ACTION_DENIED',
  '/api/manuscript/',
  '/api/production-registry/manuscripts/',
]) assert.ok(boundary.includes(marker), `Manuscript operation boundary is missing: ${marker}`);
for (const prohibitedCapability of ['shopify','navigation','page-shell','theme','main-menu','website-builder','product-launch','product-publication','product-media']) assert.ok(boundary.includes(prohibitedCapability), `Direct website mutation denial is missing: ${prohibitedCapability}`);

const autoPipeline = readFileSync(autoPipelinePath, "utf8");
for (const marker of ['derivePublicationMetadata','/admin-vault/manifest','complete-production-package.zip','CREATE SHOPIFY PRODUCT DRAFT','PUBLISH PRODUCT LIVE','websiteThemeMutationAuthorized: false','navigationMutationAuthorized: false']) assert.ok(autoPipeline.includes(marker), `Automatic manuscript production pipeline is missing: ${marker}`);
const productPublication = readFileSync(productPublicationPath, "utf8");
for (const marker of ['APPROVED_TEMPLATE_SUFFIXES','mmg-ai-image-mastery','mmg-book-product','status: "DRAFT"','product_template_verification_failed']) assert.ok(productPublication.includes(marker), `Governed Shopify product publication is missing: ${marker}`);

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  mode: "manuscript-local-browser-generation",
  phoneInferenceRequired: true,
  browserWebGPURequired: true,
  backendProviderCallsAllowed: false,
  externalPaidAPIUsed: false,
  cloudflareNeuronsUsed: 0,
  shopifyAccess: "approval-gated-exact-product-release",
  adminAssetVault: true,
  directWebsiteMutationAuthorized: false,
  minuteWebsiteCronEnabled: false,
  productionEntry: activeEntryMatch[1],
  canonicalPublishingWrapperValidated: activeEntryMatch[1] === "kairos-production-entry-canonical-publishing-v1.js",
  canonicalProviderFirewallValidated: true,
  runtimeVerification: "wrangler-dry-run-and-live-local-evidence",
}, null, 2));
