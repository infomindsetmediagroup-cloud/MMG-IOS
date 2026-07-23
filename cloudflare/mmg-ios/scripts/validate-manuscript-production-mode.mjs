import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BUILD = "kairos-manuscript-production-validator-20260722-3";
const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(here, "..");
const sourceRoot = join(workerRoot, "src");

const wranglerPath = join(workerRoot, "wrangler.toml");
const entryPath = join(sourceRoot, "kairos-production-entry-manuscript-online-v1.js");
const boundaryPath = join(sourceRoot, "kairos-manuscript-operation-boundary-v1.js");
const publishingEntryPath = join(sourceRoot, "kairos-production-entry-publishing-readiness-v1.js");
const setupPath = join(sourceRoot, "kairos-manuscript-project-setup-v1.js");
const packagePath = join(sourceRoot, "kairos-publishing-package-v1.js");
const autoPipelinePath = join(sourceRoot, "kairos-manuscript-auto-pipeline-v1.js");
const liveReplacementPath = join(sourceRoot, "kairos-manuscript-live-product-replacement-v1.js");
const productPublicationPath = join(sourceRoot, "kairos-product-publication-v1.js");

for (const file of [
  wranglerPath,
  entryPath,
  boundaryPath,
  publishingEntryPath,
  setupPath,
  packagePath,
  autoPipelinePath,
  liveReplacementPath,
  productPublicationPath,
]) {
  assert.ok(existsSync(file), `Required manuscript production file is missing: ${file}`);
}

const wrangler = readFileSync(wranglerPath, "utf8");
assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry-manuscript-online-v1\.js"/m, "Wrangler must point to the manuscript-only production entry.");
assert.match(wrangler, /KAIROS_MANUSCRIPT_RUNTIME_ENABLED\s*=\s*"true"/, "The manuscript runtime activation flag must be enabled.");
assert.match(wrangler, /KAIROS_SHOPIFY_WRITES_ENABLED\s*=\s*"true"/, "The approval-gated Shopify capability must be enabled.");
assert.match(wrangler, /KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED\s*=\s*"true"/, "The explicit live-product capability must be enabled.");
assert.match(wrangler, /crons\s*=\s*\["0 15 \* \* \*", "0 2 \* \* \*"\]/, "Only the approved morning and evening schedules may remain configured.");
assert.ok(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must remain disabled.");
for (const binding of ['binding = "ASSETS"', 'binding = "AI"', 'binding = "IMAGES"', 'name = "KAIROS_PROJECTS"']) {
  assert.ok(wrangler.includes(binding), `Required Cloudflare binding is missing: ${binding}`);
}

const entry = readFileSync(entryPath, "utf8");
for (const marker of [
  './kairos-production-entry-publishing-readiness-v1.js',
  './kairos-manuscript-operation-boundary-v1.js',
  './kairos-manuscript-auto-pipeline-v1.js',
  './kairos-manuscript-live-product-replacement-v1.js',
  'handleManuscriptLiveProductReplacement',
  'inspectManuscriptOperation',
  '/api/kairos/manuscripts/status',
  'mode: "manuscript-only"',
  'shopifyAccess: shopifyDraftWritesEnabled ? "exact-product-release-only" : "none"',
  'automaticMetadataExtraction: true',
  'productionReadyAssetManufacturing: true',
  'adminAssetVaultStorage: true',
  'controlledExistingLiveProductReplacement: true',
  'existingProductHandlePreservation: true',
  'existingProductPricePreservation: true',
  'existingDigitalDeliveryAssociationPreservation: true',
  'replacementRollbackEvidence: true',
  'liveProductReplacementApprovalRequired: true',
  'manualCatalogEntryRequired: false',
  'websiteMutationAuthorized: false',
  'navigationMutationAuthorized: false',
  'homepageMutationAuthorized: false',
  'themeMutationAuthorized: false',
  'minuteWebsiteCronEnabled: false',
]) {
  assert.ok(entry.includes(marker), `Manuscript production entry is missing: ${marker}`);
}

const boundary = readFileSync(boundaryPath, "utf8");
for (const marker of [
  'MANUSCRIPT_AUTO_PIPELINE',
  'MANUSCRIPT_LIVE_REPLACEMENT',
  'manuscript-production-package',
  'approval-gated-shopify-draft',
  'approval-gated-shopify-publication',
  'controlled-live-product-replacement-review',
  'approval-gated-live-product-replacement',
  'approval-gated-live-product-replacement-rollback',
  'WEBSITE_MUTATION_DENIED',
  'OPERATION_OUT_OF_SCOPE',
  'NON_MANUSCRIPT_CONTENT_DENIED',
  'NON_MANUSCRIPT_HUB_ACTION_DENIED',
  '/api/manuscript/',
  '/api/production-registry/manuscripts/',
  '/api/publishing/jobs',
  '/api/content/generate',
  '/api/native-intelligence/route',
]) {
  assert.ok(boundary.includes(marker), `Manuscript operation boundary is missing: ${marker}`);
}
for (const prohibitedCapability of [
  'shopify', 'navigation', 'page-shell', 'theme', 'main-menu', 'website-builder', 'product-launch', 'product-publication', 'product-media',
]) {
  assert.ok(boundary.includes(prohibitedCapability), `Direct website mutation denial is missing: ${prohibitedCapability}`);
}

const autoPipeline = readFileSync(autoPipelinePath, "utf8");
for (const marker of [
  'derivePublicationMetadata',
  '/admin-vault/manifest',
  'complete-production-package.zip',
  'CREATE SHOPIFY PRODUCT DRAFT',
  'PUBLISH PRODUCT LIVE',
  'manualCatalogEntryRequired: false',
  'websiteThemeMutationAuthorized: false',
  'navigationMutationAuthorized: false',
]) {
  assert.ok(autoPipeline.includes(marker), `Automatic manuscript production pipeline is missing: ${marker}`);
}

const liveReplacement = readFileSync(liveReplacementPath, "utf8");
for (const marker of [
  'buildLiveProductReplacementPlan',
  'REPLACE LIVE PRODUCT FROM VAULT',
  'ROLL BACK LIVE PRODUCT REPLACEMENT',
  'existingProductUpdatedInPlace: true',
  'handlePreserved: true',
  'pricePreserved: true',
  'activeStatusPreserved: true',
  'digitalDeliveryAssociationsPreserved: true',
  'adminAssetVaultRequired: true',
  'customTemplateAllowlisted: true',
  'storefrontVerificationRequired: true',
  'rollbackEvidenceRequired: true',
  'themeMutationAuthorized: false',
  'navigationMutationAuthorized: false',
  'pageMutationAuthorized: false',
  'product_template_not_approved',
  'replacement_price_preservation_failed',
  'replacement_storefront_verification_failed',
]) {
  assert.ok(liveReplacement.includes(marker), `Controlled live-product replacement is missing: ${marker}`);
}

const productPublication = readFileSync(productPublicationPath, "utf8");
for (const marker of ['APPROVED_TEMPLATE_SUFFIXES', 'mmg-ai-image-mastery', 'mmg-book-product', 'status: "DRAFT"', 'product_template_verification_failed', 'existing_live_product_protected']) {
  assert.ok(productPublication.includes(marker), `Governed Shopify product publication is missing: ${marker}`);
}

const runtimeModule = await import(`${pathToFileURL(entryPath).href}?validation=${Date.now()}`);
assert.equal(typeof runtimeModule.default?.fetch, "function", "Manuscript production runtime must export fetch().");
assert.equal(typeof runtimeModule.default?.scheduled, "function", "Manuscript production runtime must export scheduled().");
assert.equal(typeof runtimeModule.KairosProject, "function", "Manuscript production runtime must export KairosProject.");

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  mode: "manuscript-only",
  shopifyAccess: "approval-gated-exact-product-release-and-live-replacement",
  adminAssetVault: true,
  finalZipRequired: true,
  manualCatalogEntryRequired: false,
  controlledExistingLiveProductReplacement: true,
  existingProductIdentityPreserved: true,
  existingProductPricePreserved: true,
  existingDigitalDeliveryAssociationsPreserved: true,
  rollbackEvidenceRequired: true,
  directWebsiteMutationAuthorized: false,
  minuteWebsiteCronEnabled: false,
  productionEntry: "kairos-production-entry-manuscript-online-v1.js",
}, null, 2));
