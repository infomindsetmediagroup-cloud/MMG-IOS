import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const paths = {
  wrangler: "cloudflare/mmg-ios/wrangler.toml",
  canonicalEntry: "cloudflare/mmg-ios/src/kairos-production-entry-local-canonical-v1.js",
  localOnlyEntry: "cloudflare/mmg-ios/src/kairos-production-entry-local-only-v1.js",
  localExecutionEntry: "cloudflare/mmg-ios/src/kairos-production-entry-local-execution-v1.js",
  localInference: "cloudflare/mmg-ios/src/kairos-local-inference-v1.js",
  entry: "cloudflare/mmg-ios/src/kairos-production-entry-digital-asset-v2-v1.js",
  deliveryEntry: "cloudflare/mmg-ios/src/kairos-production-entry-customer-delivery-v2.js",
  delivery: "cloudflare/mmg-ios/src/kairos-customer-delivery-v2.js",
  boundary: "cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js",
  autoPipeline: "cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js",
  productPublication: "cloudflare/mmg-ios/src/kairos-product-publication-v1.js",
  digitalAssetContract: "cloudflare/mmg-ios/src/kairos-digital-asset-edition-v2-contract-v1.js",
  creationArtifacts: "cloudflare/mmg-ios/src/kairos-creation-artifacts-v1.js",
  localBridge: "web/kairos-dashboard/scripts/executive-local-inference.js",
  localBrowserRuntime: "web/kairos-dashboard/scripts/kairos-local-inference-same-origin.js",
  runtimeLoader: "web/kairos-dashboard/scripts/kairos-runtime-loader.js",
  commandLoader: "web/kairos-dashboard/scripts/legacy-runtime-loader.js",
  commandHub: "web/kairos-dashboard/scripts/command-hub.js",
  index: "web/kairos-dashboard/index.html",
  governanceContract: "governance/mmg-digital-asset-edition-v2-contract-v1.json",
  doctrine: "docs/doctrine/mmg-digital-asset-edition-v2-customer-release-doctrine.md",
  registry: "governance/kairos-builder-plugin-registry-v1.json",
  deploy: ".github/workflows/deploy-kairos-manuscript-runtime.yml",
};
for (const [name, relative] of Object.entries(paths)) if (!fs.existsSync(path.join(root, relative))) fail(`Missing ${name}: ${relative}`);
const values = Object.fromEntries(Object.entries(paths).map(([name, relative]) => [name, name === "governanceContract" || name === "registry" ? JSON.parse(read(relative)) : read(relative)]));
const { wrangler, canonicalEntry, localOnlyEntry, localExecutionEntry, localInference, entry, deliveryEntry, delivery, boundary, autoPipeline, productPublication, digitalAssetContract, creationArtifacts, localBridge, localBrowserRuntime, runtimeLoader, commandLoader, commandHub, index, governanceContract, doctrine, registry, deploy } = values;

assert(wrangler.includes('main = "src/kairos-production-entry-local-canonical-v1.js"'), "The active Worker must use the canonical local provider firewall.");
for (const marker of ['KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"','KAIROS_MANUSCRIPT_START_MODE = "local-browser"','KAIROS_MODEL_PROVIDER = "browser-webgpu"','KAIROS_NO_COST_MODE = "true"','KAIROS_LOCAL_INFERENCE_ENABLED = "true"','KAIROS_CLOUDFLARE_NEURONS_ENABLED = "false"','binding = "KAIROS_PROJECT_WORKFLOW"','binding = "KAIROS_MANUSCRIPT_WORKFLOW"']) assert(wrangler.includes(marker), `Local manuscript runtime configuration is missing: ${marker}`);
assert(!wrangler.includes('KAIROS_MODEL_PROVIDER = "openai"'), "OpenAI must not be configured as the production model provider.");
assert(!wrangler.includes('KAIROS_MODEL_ENDPOINT ='), "A backend model endpoint must not be configured.");
assert(!wrangler.includes('KAIROS_MODEL_AUTH_TOKEN ='), "A backend model auth token must not be configured.");
assert(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must be removed.");
assert(wrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "true"'), "The approval-gated Shopify draft capability must be enabled.");
assert(wrangler.includes('KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"'), "The explicit live-publication control must be enabled.");

for (const marker of ['./kairos-production-entry-local-only-v1.js','PROVIDER_INDEPENDENT_OPERATIONAL_PATHS','providerBlockedEnv','operationalCompatibilityEnv','property === "OPENAI_API_KEY"','return ""','kairos-local-readiness-sentinel-not-a-provider-key','X-Kairos-OpenAI-Calls", "disabled"']) assert(canonicalEntry.includes(marker), `The canonical local provider firewall is missing: ${marker}`);
assert(!canonicalEntry.includes("handleKairosAPI"), "The canonical provider firewall must not invoke the provider-backed API handler.");
assert(!canonicalEntry.includes("api.openai.com"), "The canonical provider firewall must not contain an OpenAI endpoint.");

for (const marker of ['./kairos-production-entry-local-execution-v1.js','LOCAL_APPROVAL','LEGACY_MANUSCRIPT_GENERATION','REVENUE_GENERATION','LOCAL_INFERENCE_REQUIRED','getProjectState','approveFoundationWorkflow(foundation.instanceId','provider: "browser-webgpu"','externalPaidAPIUsed: false','cloudflareNeuronsUsed: 0','backendProviderCalls: false']) assert(localOnlyEntry.includes(marker), `The local-only entry is missing: ${marker}`);
for (const marker of ['/api/operational-readiness','/api/kairos','prepare-source','sync-source','start-production','complete-production','browser-webgpu','same-origin-webllm','automaticPublicationAllowed: false','commerceMutationAllowed: false']) assert(localExecutionEntry.includes(marker), `The local execution bridge is missing: ${marker}`);
assert(!localExecutionEntry.includes("handleKairosAPI"), "Local execution must not invoke the provider-backed Kairos API handler.");
assert(localInference.includes("backupOriginalText"), "The authoritative manuscript backup path must remain available.");
assert(localInference.includes('provider:"browser-webgpu"') || localInference.includes('provider: "browser-webgpu"'), "Stored inference evidence must identify browser WebGPU.");
assert(localInference.includes("externalPaidAPIUsed:false") || localInference.includes("externalPaidAPIUsed: false"), "Stored inference evidence must prove no paid API use.");
assert(localInference.includes("cloudflareNeuronsUsed:0") || localInference.includes("cloudflareNeuronsUsed: 0"), "Stored inference evidence must prove zero Cloudflare neurons.");

for (const marker of ['import("../vendor/webllm-bundle.js")','KairosLocalInference.run','/prepare-source','/sync-source','/start-production','/complete-production','No OpenAI API call']) assert(localBridge.includes(marker), `The governed local inference bridge is missing: ${marker}`);
assert(localBrowserRuntime.includes('../vendor/webllm-bundle.js'), "The manuscript runtime must load the same-origin WebLLM bundle.");
assert(runtimeLoader.includes('import "./legacy-runtime-loader.js"'), "The compatibility loader must retain the command and advanced runtime.");
assert(!runtimeLoader.includes('executive-local-inference.js'), "The compatibility loader must not globally mount the local inference panel.");
assert(commandLoader.includes('commandHubMode'), "The five-center command-mode contract is missing.");
assert(commandLoader.includes('if (commandHubMode) loadCommandRuntime()'), "The five-center command runtime must boot by default.");
assert(commandLoader.includes('"command-hub.js"'), "The Command Hub is missing from the default runtime.");
assert(commandLoader.includes('"kairos-local-inference.js"'), "Local manuscript inference must remain available inside governed operations.");
assert((commandHub.match(/id: "(?:knowledge|content|business|customers|operations)"/g) || []).length === 5, "The Command Hub must contain exactly five canonical parent centers.");
assert(commandHub.includes("Five operating centers"), "The five-center dashboard contract is missing.");
assert((index.match(/<script type="module"/g) || []).length === 2, "The dashboard must preserve a two-module boot.");
assert(index.includes("kairos-five-center-dashboard-restored-20260730-1"), "The restored five-center dashboard marker is missing.");
assert(index.includes("legacy-runtime-loader.js"), "The five-center dashboard must load the command runtime.");
assert(!index.includes("kairos-runtime-loader.js"), "The compatibility loader must not replace the five-center homepage.");
assert(!index.includes("executive-local-inference.js"), "The local inference panel must not mount globally.");
assert(!index.includes("webllm-bundle.js"), "The large WebLLM bundle must load lazily during governed production, not at initial page boot.");

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

assert(deploy.includes("workflow_dispatch:"), "Production deployment must be manually dispatchable.");
assert(!/^\s{2}push:/m.test(deploy), "The manual production deployment workflow must not trigger on repository pushes.");
for (const marker of ["DEPLOY KAIROS LOCAL RUNTIME","github.ref == 'refs/heads/main'","environment: production","inputs.release_id","working-directory: cloudflare/mmg-ios","npm run build:webllm","npx wrangler deploy --dry-run","run: npx wrangler deploy","/api/operational-readiness","/api/workflows","LOCAL_INFERENCE_REQUIRED","browser-webgpu","externalPaidAPIUsed","cloudflareNeuronsUsed","x-kairos-openai-calls"]) assert(deploy.includes(marker), `Local deployment contract is missing: ${marker}`);
assert(!deploy.includes("OPENAI_API_KEY: ${{"), "Local deployment must not synchronize or require an OpenAI API key secret.");
assert(deploy.includes("! grep -q 'api.openai.com'"), "Local deployment must explicitly reject an OpenAI endpoint from the active production entry.");
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
for (const advisor of registry.advisors || []) { assert(advisor.productionDependency === false, `${advisor.id} cannot be a production dependency by default.`); assert(advisor.mutationAuthority !== true, `${advisor.id} cannot have unrestricted mutation authority.`); }
console.log("Kairos five-center dashboard, canonical local-only manuscript generation, Digital Asset Edition V2, customer delivery, Admin Asset Vault, and governed product-release validation passed.");
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function assert(condition, message) { if (!condition) fail(message); }
function fail(message) { console.error(`Kairos manuscript activation validation failed: ${message}`); process.exit(1); }
