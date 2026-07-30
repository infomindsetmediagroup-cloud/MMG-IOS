import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const paths = {
  wrangler: "cloudflare/mmg-ios/wrangler.toml",
  localEntry: "cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js",
  revenueEntry: "cloudflare/mmg-ios/src/kairos-production-entry-revenue-dashboard-v1.js",
  operationalEntry: "cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js",
  localOperationalEntry: "cloudflare/mmg-ios/src/kairos-production-entry-local-operational-v1.js",
  localInferenceStore: "cloudflare/mmg-ios/src/kairos-local-inference-v1.js",
  backendGeneration: "cloudflare/mmg-ios/src/kairos-manuscript-generation-job-v1.js",
  browserLocalInference: "web/kairos-dashboard/scripts/kairos-local-inference.js",
  browserLocalBridge: "web/kairos-dashboard/scripts/executive-os-local-production-bridge.js",
  safari: "web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js",
  entry: "cloudflare/mmg-ios/src/kairos-production-entry-digital-asset-v2-v1.js",
  deliveryEntry: "cloudflare/mmg-ios/src/kairos-production-entry-customer-delivery-v2.js",
  delivery: "cloudflare/mmg-ios/src/kairos-customer-delivery-v2.js",
  boundary: "cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js",
  autoPipeline: "cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js",
  productPublication: "cloudflare/mmg-ios/src/kairos-product-publication-v1.js",
  digitalAssetContract: "cloudflare/mmg-ios/src/kairos-digital-asset-edition-v2-contract-v1.js",
  creationArtifacts: "cloudflare/mmg-ios/src/kairos-creation-artifacts-v1.js",
  client: "web/kairos-dashboard/scripts/manuscript-auto-pipeline.js",
  index: "web/kairos-dashboard/index.html",
  governanceContract: "governance/mmg-digital-asset-edition-v2-contract-v1.json",
  doctrine: "docs/doctrine/mmg-digital-asset-edition-v2-customer-release-doctrine.md",
  registry: "governance/kairos-builder-plugin-registry-v1.json",
  deploy: ".github/workflows/deploy-kairos-manuscript-runtime.yml",
};

for (const [name, relative] of Object.entries(paths)) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Missing ${name}: ${relative}`);
}

const values = Object.fromEntries(Object.entries(paths).map(([name, relative]) => [
  name,
  name === "governanceContract" || name === "registry" ? JSON.parse(read(relative)) : read(relative),
]));
const {
  wrangler,
  localEntry,
  revenueEntry,
  operationalEntry,
  localOperationalEntry,
  localInferenceStore,
  backendGeneration,
  browserLocalInference,
  browserLocalBridge,
  safari,
  entry,
  deliveryEntry,
  delivery,
  boundary,
  autoPipeline,
  productPublication,
  digitalAssetContract,
  creationArtifacts,
  client,
  index,
  governanceContract,
  doctrine,
  registry,
  deploy,
} = values;

const usesCompatibilityEntry = wrangler.includes('main = "src/kairos-production-entry-local-inference-v1.js"');
const usesRevenueEntry = wrangler.includes('main = "src/kairos-production-entry-revenue-dashboard-v1.js"');
const usesOperationalEntry = wrangler.includes('main = "src/kairos-production-entry-operational-execution-v1.js"');
const usesLocalOperationalEntry = wrangler.includes('main = "src/kairos-production-entry-local-operational-v1.js"');
assert(
  usesCompatibilityEntry || usesRevenueEntry || usesOperationalEntry || usesLocalOperationalEntry,
  "The active Worker must use a governed manuscript, revenue, operational, or local-only operational entry.",
);

if (usesRevenueEntry || usesOperationalEntry || usesLocalOperationalEntry) {
  assert(revenueEntry.includes('from "./kairos-production-entry-local-inference-v1.js"'), "The revenue wrapper must import the governed manuscript entry.");
  assert(revenueEntry.includes("currentRuntime.fetch"), "The revenue wrapper must delegate unmatched requests to the governed manuscript runtime.");
  assert(revenueEntry.includes('X-Kairos-Automatic-Publication", "disabled"'), "The revenue wrapper must preserve the publication-disabled boundary.");
}

if (usesOperationalEntry) {
  for (const marker of [
    'from "./kairos-production-entry-revenue-dashboard-v1.js"',
    "KAIROS_PROJECT_AGENT",
    "KAIROS_PROJECT_WORKFLOW",
    "KAIROS_MANUSCRIPT_WORKFLOW",
    "startFoundationWorkflow",
    "approveFoundationWorkflow",
    'approvalPolicy: "explicit"',
    "automaticPublicationAllowed: false",
    "commerceMutationAllowed: false",
  ]) assert(operationalEntry.includes(marker), `The operational wrapper is missing a governed contract: ${marker}`);
}

if (usesLocalOperationalEntry) {
  for (const marker of [
    "KAIROS_LOCAL_OPERATIONAL_BUILD",
    "KAIROS_PROJECT_AGENT",
    "KAIROS_PROJECT_WORKFLOW",
    "approveFoundationWorkflow",
    "prepare-source",
    "LOCAL_BROWSER_INFERENCE_REQUIRED",
    "LOCAL_INFERENCE_VERIFICATION_FAILED",
    'provider: "browser-webgpu"',
    "externalPaidAPIUsed: false",
    "openAICallAllowed: false",
    "automaticPublicationAllowed: false",
    "commerceMutationAllowed: false",
  ]) assert(localOperationalEntry.includes(marker), `The local operational wrapper is missing: ${marker}`);
  assert(!localOperationalEntry.includes("handleKairosAPI"), "The active local wrapper must not invoke the provider-backed Kairos API.");
  assert(!localOperationalEntry.includes("startManuscriptGenerationWorkflow"), "The active local wrapper must not start provider-backed manuscript generation.");
  assert(!localOperationalEntry.includes("api.openai.com"), "The active local wrapper must not contain an OpenAI endpoint.");
}

for (const marker of [
  'KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"',
  'KAIROS_CLOUDFLARE_NEURONS_ENABLED = "false"',
  'KAIROS_MODEL_PROVIDER = "browser-webgpu"',
  'KAIROS_MODEL_ENDPOINT = ""',
  'KAIROS_MODEL_NAME = "Kairos Local WebLLM"',
  'KAIROS_NO_COST_MODE = "true"',
  'KAIROS_LOCAL_INFERENCE_ENABLED = "true"',
  'KAIROS_MANUSCRIPT_START_MODE = "local-browser"',
  'KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED = "false"',
  'binding = "KAIROS_PROJECT_WORKFLOW"',
  'binding = "KAIROS_MANUSCRIPT_WORKFLOW"',
]) assert(wrangler.includes(marker), `Local production configuration is missing: ${marker}`);
assert(!wrangler.includes('KAIROS_MODEL_PROVIDER = "openai"'), "The active production Worker must not select OpenAI.");
assert(!wrangler.includes("api.openai.com"), "The active production Worker must not configure the OpenAI endpoint.");
assert(!wrangler.includes("KAIROS_OPENAI_MODEL"), "The active production Worker must not select an OpenAI model.");

for (const marker of [
  "generateSource",
  "SOURCE_TARGET_WORDS = 1500",
  "/source-text",
  "STORE LOCAL INFERENCE",
  "/local-inference",
  'provider: "browser-webgpu"',
  "externalPaidAPIUsed: false",
  "navigator?.gpu",
  "CreateMLCEngine",
]) assert(browserLocalInference.includes(marker), `Browser-local inference is missing: ${marker}`);
assert(!browserLocalInference.includes("api.openai.com"), "Browser-local inference must not call OpenAI.");

for (const marker of [
  "approveAndGenerateSource",
  "generateAndReconcileProduction",
  "KairosLocalInference",
  "prepare-source",
  "start-production",
  "browser-webgpu",
]) assert(browserLocalBridge.includes(marker), `The Executive OS local-production bridge is missing: ${marker}`);
assert(safari.includes("activateLocalProductionBridge"), "The Executive OS must load the local-production bridge.");
assert(safari.includes("executive-os-local-production-bridge.js?v=20260730-1"), "The Executive OS must pin the local-production bridge build.");

for (const marker of [
  'provider: "browser-webgpu"',
  "noCost: true",
  "externalPaidAPIUsed: false",
  "cloudflareNeuronsUsed: 0",
  "backupOriginalText",
]) assert(localInferenceStore.includes(marker), `The local inference storage contract is missing: ${marker}`);

assert(localEntry.includes("currentRuntime.fetch"), "The compatibility entry must retain the governed runtime chain.");
assert(localEntry.includes('X-Kairos-Cloudflare-Neurons", "0"'), "The compatibility entry must report zero Cloudflare neurons.");
assert(backendGeneration.includes("/generation-job"), "The historical generation-job contract must remain readable for compatibility.");
assert(backendGeneration.includes("cloudflareNeuronsUsed:0"), "Historical generation records must prove zero Cloudflare neurons.");
assert(client.includes("generationEndpoint"), "The advanced compatibility client must retain its historical generation route.");
assert(!index.includes("webllm-bundle.js"), "The app must not depend on a retired static WebLLM bundle.");
assert(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must be removed.");
assert(wrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "true"'), "The approval-gated Shopify draft capability must be enabled.");
assert(wrangler.includes('KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"'), "The explicit live-publication control must be enabled.");

for (const marker of ["rewriteManufacturingRequest","enforceExistingSetupForRun","Mindset Media Group™","MINIMUM_FINISHED_PAGES","sanitizeText"]) assert(entry.includes(marker), `Digital Asset V2 runtime is missing: ${marker}`);
for (const marker of ["executeDraftWithDelivery","rollbackAndFail"]) assert(deliveryEntry.includes(marker), `Customer delivery entry is missing: ${marker}`);
for (const marker of ["webhookSubscriptionCreate",'webhookSubscription: { uri, format: "JSON" }',"unwrapOrderPayload"]) assert(delivery.includes(marker), `Customer delivery runtime is missing: ${marker}`);
for (const marker of ["MINIMUM_FINISHED_PAGES = 100","buildCustomerSpecSheetPDF","buildThumbnailCoverPNG","digital_asset_v2_padding_detected"]) assert(digitalAssetContract.includes(marker), `Digital Asset V2 contract is missing: ${marker}`);
for (const marker of ["CUSTOMER_DELIVERABLE_NAMES","customer-spec-sheet.pdf","kdp-interior-6x9.pdf","digital-asset-edition-v2.pdf","cover-portrait-2048x3072.png","cover-thumbnail-2048x2048.png","Object.keys(files).length !== 6"]) assert(creationArtifacts.includes(marker), `Customer release artifact contract is missing: ${marker}`);
assert(governanceContract.contractId === "mmg-digital-asset-edition-v2", "The machine-readable V2 contract ID is incorrect.");
assert(governanceContract.manuscript.minimumFinishedPages === 100, "The machine-readable contract must require 100 finished pages.");
assert(governanceContract.customerRelease.exactDeliverableCount === 6, "The machine-readable contract must require six customer deliverables.");
assert(governanceContract.publisherIdentity === "Mindset Media Group™", "The publisher identity is incorrect.");
assert(governanceContract.individualAttributionAllowed === false, "Individual attribution must remain prohibited.");
assert(doctrine.includes("Everything in the customer release package must be written for the customer") || doctrine.includes("Every item in the customer release package must be written for the customer"), "The customer-facing doctrine is missing.");
for (const marker of ["MANUSCRIPT_AUTO_PIPELINE","approval-gated-shopify-draft","approval-gated-shopify-publication","WEBSITE_MUTATION_DENIED","OPERATION_OUT_OF_SCOPE"]) assert(boundary.includes(marker), `Manuscript boundary is missing: ${marker}`);
for (const marker of ["derivePublicationMetadata","/admin-vault/manifest","complete-production-package.zip","CREATE SHOPIFY PRODUCT DRAFT","PUBLISH PRODUCT LIVE"]) assert(autoPipeline.includes(marker), `Automatic production pipeline is missing: ${marker}`);
assert(productPublication.includes("APPROVED_TEMPLATE_SUFFIXES"), "The custom product-template allowlist is missing.");
assert(productPublication.includes('status: "DRAFT"'), "Shopify product creation must begin as DRAFT.");

assert(deploy.includes("workflow_dispatch:"), "Production deployment must be manually dispatched.");
assert(!/^\s{2}push:/m.test(deploy), "Production deployment must not trigger automatically on repository pushes.");
for (const marker of [
  "DEPLOY KAIROS MANUSCRIPT RUNTIME",
  "github.ref == 'refs/heads/main'",
  "environment: production",
  "inputs.release_id",
  "working-directory: cloudflare/mmg-ios",
  "npx wrangler deploy --dry-run",
  "run: npx wrangler deploy",
  "/api/kairos/manuscripts/status",
  "KairosManuscriptAutoPipelineController",
  "/api/shopify/page-shell/publish",
]) assert(deploy.includes(marker), `Deployment contract is missing: ${marker}`);
assert(!deploy.includes("REPAIR_MMG_AUDITED_PAGES_NOW"), "Legacy Shopify page repair must not be deployable.");
assert(!deploy.includes("PUBLISH_MMG_PAGE_SHELL_RECONCILIATION"), "Legacy page-shell publication must not be deployable.");

assert(registry.defaultDecision === "deny-production-authority", "Builder plugins must default to no production authority.");
assert(registry.runtime.openAiRuntimeRequired === false, "Builder guidance must not impose an OpenAI production runtime.");
assert(registry.runtime.shopifyRuntimeAccessFromBuilderPlugins === "none", "Builder plugins must not gain Shopify runtime access.");
assert(registry.enforcement.builderGuidanceCannotExpandTaskScope === true, "Builder guidance must not expand task scope.");
assert(registry.enforcement.builderGuidanceCannotMutateShopify === true, "Builder plugins must not mutate Shopify.");
assert(registry.enforcement.manuscriptWorkflowShopifyAccess === "approval-gated-exact-product-release", "Manuscript Shopify access must remain approval-gated.");
assert(registry.productionReleasePolicy?.scope === "single-manuscript-product", "The production release must be scoped to one manuscript product.");
assert(registry.productionReleasePolicy?.directShopifyRoutesAllowed === false, "Direct Shopify routes must remain denied.");
assert(registry.productionReleasePolicy?.adminAssetVaultRequired === true, "Admin Asset Vault completion must be required.");
assert(registry.productionReleasePolicy?.finalZipRequired === true, "A final production ZIP must be required.");
assert(registry.productionReleasePolicy?.draftRequiresExplicitUserAction === true, "Shopify DRAFT creation must require explicit user action.");
assert(registry.productionReleasePolicy?.livePublishRequiresExplicitUserAction === true, "Live publication must require explicit user action.");
assert(registry.productionReleasePolicy?.themeMutationAuthorized === false, "Theme mutation must remain unauthorized.");
assert(registry.productionReleasePolicy?.navigationMutationAuthorized === false, "Navigation mutation must remain unauthorized.");
for (const advisor of registry.advisors || []) {
  assert(advisor.productionDependency === false, `${advisor.id} cannot be a production dependency by default.`);
  assert(advisor.mutationAuthority !== true, `${advisor.id} cannot have unrestricted mutation authority.`);
}

console.log("Kairos local WebGPU manuscript generation, Executive OS orchestration, Digital Asset Edition V2, customer delivery, Admin Asset Vault, and governed product-release validation passed.");

function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function assert(condition, message) { if (!condition) fail(message); }
function fail(message) { console.error(`Kairos manuscript activation validation failed: ${message}`); process.exit(1); }
