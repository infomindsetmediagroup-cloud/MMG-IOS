import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BUILD = "kairos-manuscript-production-validator-20260723-3";
const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(here, "..");
const sourceRoot = join(workerRoot, "src");
const wranglerPath = join(workerRoot, "wrangler.toml");
const manuscriptEntryPath = join(sourceRoot, "kairos-production-entry-manuscript-online-v1.js");
const localInferenceEntryPath = join(sourceRoot, "kairos-production-entry-local-inference-v1.js");
const boundaryPath = join(sourceRoot, "kairos-manuscript-operation-boundary-v1.js");
const publishingEntryPath = join(sourceRoot, "kairos-production-entry-publishing-readiness-v1.js");
const setupPath = join(sourceRoot, "kairos-manuscript-project-setup-v1.js");
const packagePath = join(sourceRoot, "kairos-publishing-package-v1.js");
const autoPipelinePath = join(sourceRoot, "kairos-manuscript-auto-pipeline-v1.js");
const productPublicationPath = join(sourceRoot, "kairos-product-publication-v1.js");

for (const file of [wranglerPath, manuscriptEntryPath, localInferenceEntryPath, boundaryPath, publishingEntryPath, setupPath, packagePath, autoPipelinePath, productPublicationPath]) {
  assert.ok(existsSync(file), `Required manuscript production file is missing: ${file}`);
}

const wrangler = readFileSync(wranglerPath, "utf8");
const activeEntryMatch = wrangler.match(/^main\s*=\s*"src\/(kairos-production-entry-[^"]+\.js)"/m);
assert.ok(activeEntryMatch, "Wrangler must declare an explicit Kairos production entry.");
assert.ok(
  ["kairos-production-entry-manuscript-online-v1.js", "kairos-production-entry-local-inference-v1.js"].includes(activeEntryMatch[1]),
  "Wrangler must point to the manuscript runtime or its certified local-inference wrapper.",
);

for (const marker of [
  'KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"',
  'KAIROS_SHOPIFY_WRITES_ENABLED = "true"',
  'KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"',
  'crons = ["0 15 * * *", "0 2 * * *"]',
  'binding = "ASSETS"',
  'binding = "IMAGES"',
  'name = "KAIROS_PROJECTS"',
]) assert.ok(wrangler.includes(marker), `Required production configuration is missing: ${marker}`);
assert.ok(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must remain disabled.");
assert.ok(!wrangler.includes('binding = "AI"'), "Paid Cloudflare AI binding must remain absent in local-inference no-cost mode.");

const localInferenceEntry = readFileSync(localInferenceEntryPath, "utf8");
for (const marker of [
  './kairos-production-entry-customer-delivery-v2.js',
  './kairos-local-inference-v1.js',
  'device-compute-no-paid-api',
  'X-Kairos-Cloudflare-Neurons',
]) assert.ok(localInferenceEntry.includes(marker), `Local-inference production wrapper is missing: ${marker}`);

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

const activeEntryPath = join(sourceRoot, activeEntryMatch[1]);
const runtimeModule = await import(`${pathToFileURL(activeEntryPath).href}?validation=${Date.now()}`);
assert.equal(typeof runtimeModule.default?.fetch, "function", "Production runtime must export fetch().");
assert.equal(typeof runtimeModule.default?.scheduled, "function", "Production runtime must export scheduled().");
assert.equal(typeof runtimeModule.KairosProject, "function", "Production runtime must export KairosProject.");

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  mode: "manuscript-only-local-inference",
  noCostMode: true,
  shopifyAccess: "approval-gated-exact-product-release",
  adminAssetVault: true,
  directWebsiteMutationAuthorized: false,
  minuteWebsiteCronEnabled: false,
  productionEntry: activeEntryMatch[1],
}, null, 2));
