import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD = "kairos-manuscript-production-validator-20260729-10";
const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(here, "..");
const sourceRoot = join(workerRoot, "src");
const wranglerPath = join(workerRoot, "wrangler.toml");
const manuscriptEntryPath = join(sourceRoot, "kairos-production-entry-manuscript-online-v1.js");
const governedEntryPath = join(sourceRoot, "kairos-production-entry-local-inference-v1.js");
const revenueEntryPath = join(sourceRoot, "kairos-production-entry-revenue-dashboard-v1.js");
const operationalEntryPath = join(sourceRoot, "kairos-production-entry-operational-execution-v1.js");
const backendGenerationPath = join(sourceRoot, "kairos-manuscript-generation-job-v1.js");
const boundaryPath = join(sourceRoot, "kairos-manuscript-operation-boundary-v1.js");
const publishingEntryPath = join(sourceRoot, "kairos-production-entry-publishing-readiness-v1.js");
const setupPath = join(sourceRoot, "kairos-manuscript-project-setup-v1.js");
const packagePath = join(sourceRoot, "kairos-publishing-package-v1.js");
const autoPipelinePath = join(sourceRoot, "kairos-manuscript-auto-pipeline-v1.js");
const productPublicationPath = join(sourceRoot, "kairos-product-publication-v1.js");

for (const file of [wranglerPath, manuscriptEntryPath, governedEntryPath, revenueEntryPath, operationalEntryPath, backendGenerationPath, boundaryPath, publishingEntryPath, setupPath, packagePath, autoPipelinePath, productPublicationPath]) {
  assert.ok(existsSync(file), `Required manuscript production file is missing: ${file}`);
}

const wrangler = readFileSync(wranglerPath, "utf8");
const activeEntryMatch = wrangler.match(/^main\s*=\s*"src\/(kairos-production-entry-[^"]+\.js)"/m);
assert.ok(activeEntryMatch, "Wrangler must declare an explicit Kairos production entry.");
assert.ok(
  [
    "kairos-production-entry-manuscript-online-v1.js",
    "kairos-production-entry-local-inference-v1.js",
    "kairos-production-entry-revenue-dashboard-v1.js",
    "kairos-production-entry-operational-execution-v1.js",
  ].includes(activeEntryMatch[1]),
  "Wrangler must point to the manuscript runtime or a validated governed compatibility wrapper.",
);

for (const marker of [
  'KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"',
  'KAIROS_SHOPIFY_WRITES_ENABLED = "true"',
  'KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"',
  'crons = ["0 15 * * *", "0 2 * * *"]',
  'binding = "ASSETS"',
  'binding = "IMAGES"',
  'name = "KAIROS_PROJECTS"',
  'name = "KAIROS_PROJECT_AGENT"',
  'binding = "KAIROS_PROJECT_WORKFLOW"',
  'binding = "KAIROS_MANUSCRIPT_WORKFLOW"',
]) assert.ok(wrangler.includes(marker), `Required production configuration is missing: ${marker}`);
assert.ok(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must remain disabled.");
assert.ok(!wrangler.includes('binding = "AI"'), "Paid Cloudflare AI binding must remain absent.");

const governedEntry = readFileSync(governedEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-customer-delivery-v2.js',
  './kairos-manuscript-generation-job-v1.js',
  'handleManuscriptGeneration',
  'resumeManuscriptGenerationAlarm',
  'backend-provider-governed',
  'X-Kairos-Manuscript-Generation',
  'X-Kairos-Cloudflare-Neurons',
  'export class KairosProject',
  'export default',
  'async fetch(request, env, ctx)',
  'async scheduled(controller, env, ctx)',
]) assert.ok(governedEntry.includes(marker), `Governed manuscript production wrapper is missing: ${marker}`);

const revenueEntry = readFileSync(revenueEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-local-inference-v1.js',
  'CurrentKairosProject',
  'currentRuntime.fetch',
  'currentRuntime.scheduled',
  'X-Kairos-Automatic-Publication',
]) assert.ok(revenueEntry.includes(marker), `Governed revenue wrapper is missing: ${marker}`);

const operationalEntry = readFileSync(operationalEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-revenue-dashboard-v1.js',
  'KAIROS_OPERATIONAL_EXECUTION_BUILD',
  'KAIROS_PROJECT_AGENT',
  'KAIROS_PROJECT_WORKFLOW',
  'KAIROS_MANUSCRIPT_WORKFLOW',
  '/api/operational-readiness',
  '/api/hub/run',
  '/api/workflows',
  'bootstrapProject',
  'startFoundationWorkflow',
  'approveFoundationWorkflow',
  'createAndStoreAuthoritativeSource',
  'startManuscriptGenerationWorkflow',
  'approvalPolicy: "explicit"',
  'automaticPublicationAllowed: false',
  'commerceMutationAllowed: false',
]) assert.ok(operationalEntry.includes(marker), `Operational execution wrapper is missing governed contract: ${marker}`);

const backendGeneration = readFileSync(backendGenerationPath, "utf8");
for (const marker of [
  '/generation-job',
  'setAlarm',
  'resumeManuscriptGenerationAlarm',
  'KAIROS_MODEL_PROVIDER',
  'KAIROS_MODEL_ENDPOINT',
  'KAIROS_MODEL_AUTH_TOKEN',
  'provider==="ollama"',
  'provider==="openai-compatible"',
  'cloudflareNeuronsUsed:0',
]) assert.ok(backendGeneration.includes(marker), `Backend manuscript generation is missing: ${marker}`);

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

for (const prohibitedCapability of ['shopify','navigation','page-shell','theme','main-menu','website-builder','product-launch','product-publication','product-media']) {
  assert.ok(boundary.includes(prohibitedCapability), `Direct website mutation denial is missing: ${prohibitedCapability}`);
}

const autoPipeline = readFileSync(autoPipelinePath, "utf8");
for (const marker of ['derivePublicationMetadata','/admin-vault/manifest','complete-production-package.zip','CREATE SHOPIFY PRODUCT DRAFT','PUBLISH PRODUCT LIVE','websiteThemeMutationAuthorized: false','navigationMutationAuthorized: false']) {
  assert.ok(autoPipeline.includes(marker), `Automatic manuscript production pipeline is missing: ${marker}`);
}

const productPublication = readFileSync(productPublicationPath, "utf8");
for (const marker of ['APPROVED_TEMPLATE_SUFFIXES','mmg-ai-image-mastery','mmg-book-product','status: "DRAFT"','product_template_verification_failed']) {
  assert.ok(productPublication.includes(marker), `Governed Shopify product publication is missing: ${marker}`);
}

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  mode: "manuscript-only-backend-generation",
  phoneInferenceRequired: false,
  backendGenerationDurable: true,
  shopifyAccess: "approval-gated-exact-product-release",
  adminAssetVault: true,
  directWebsiteMutationAuthorized: false,
  minuteWebsiteCronEnabled: false,
  productionEntry: activeEntryMatch[1],
  operationalExecutionValidated: activeEntryMatch[1] === "kairos-production-entry-operational-execution-v1.js",
  runtimeVerification: "wrangler-dry-run",
}, null, 2));
