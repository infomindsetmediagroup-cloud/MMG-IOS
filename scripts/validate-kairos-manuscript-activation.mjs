import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const paths={
  wrangler:"cloudflare/mmg-ios/wrangler.toml",
  localEntry:"cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js",
  localInference:"cloudflare/mmg-ios/src/kairos-local-inference-v1.js",
  backendGeneration:"cloudflare/mmg-ios/src/kairos-manuscript-generation-job-v1.js",
  entry:"cloudflare/mmg-ios/src/kairos-production-entry-digital-asset-v2-v1.js",
  deliveryEntry:"cloudflare/mmg-ios/src/kairos-production-entry-customer-delivery-v2.js",
  delivery:"cloudflare/mmg-ios/src/kairos-customer-delivery-v2.js",
  boundary:"cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js",
  autoPipeline:"cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js",
  productPublication:"cloudflare/mmg-ios/src/kairos-product-publication-v1.js",
  digitalAssetContract:"cloudflare/mmg-ios/src/kairos-digital-asset-edition-v2-contract-v1.js",
  creationArtifacts:"cloudflare/mmg-ios/src/kairos-creation-artifacts-v1.js",
  client:"web/kairos-dashboard/scripts/manuscript-auto-pipeline.js",
  index:"web/kairos-dashboard/index.html",
  governanceContract:"governance/mmg-digital-asset-edition-v2-contract-v1.json",
  doctrine:"docs/doctrine/mmg-digital-asset-edition-v2-customer-release-doctrine.md",
  registry:"governance/kairos-builder-plugin-registry-v1.json",
  deploy:".github/workflows/deploy-kairos-manuscript-runtime.yml",
};
for(const[name,relative]of Object.entries(paths))if(!fs.existsSync(path.join(root,relative)))fail(`Missing ${name}: ${relative}`);
const values=Object.fromEntries(Object.entries(paths).map(([name,relative])=>[name,name==="governanceContract"||name==="registry"?JSON.parse(read(relative)):read(relative)]));
const{wrangler,localEntry,localInference,backendGeneration,entry,deliveryEntry,delivery,boundary,autoPipeline,productPublication,digitalAssetContract,creationArtifacts,client,index,governanceContract,doctrine,registry,deploy}=values;

assert(wrangler.includes('main = "src/kairos-production-entry-local-inference-v1.js"'),"The active Worker must use the governed manuscript entry.");
assert(wrangler.includes('KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"'),"Manuscript runtime activation flag is missing.");
assert(wrangler.includes('KAIROS_CLOUDFLARE_NEURONS_ENABLED = "false"'),"Cloudflare neuron use must remain disabled.");
assert(localEntry.includes("handleManuscriptGeneration"),"The active entry must route backend generation jobs.");
assert(localEntry.includes("resumeManuscriptGenerationAlarm"),"The Durable Object alarm continuation is missing.");
assert(localEntry.includes("X-Kairos-Manuscript-Generation"),"The runtime must report the backend generation build.");
assert(backendGeneration.includes("/generation-job"),"The durable generation-job API is missing.");
assert(backendGeneration.includes("setAlarm"),"Backend generation must continue through Durable Object alarms.");
assert(backendGeneration.includes('provider==="ollama"'),"Ollama backend generation support is missing.");
assert(backendGeneration.includes('provider==="openai-compatible"'),"OpenAI-compatible backend generation support is missing.");
assert(backendGeneration.includes("KAIROS_MODEL_AUTH_TOKEN"),"Backend model authentication support is missing.");
assert(backendGeneration.includes("cloudflareNeuronsUsed:0"),"Backend generation must prove zero Cloudflare neurons.");
assert(localInference.includes("backupOriginalText"),"The authoritative manuscript backup path must remain available.");
assert(client.includes("generationEndpoint"),"The mobile client must use the backend generation-job route.");
assert(client.includes("You may close this page"),"The mobile client must state that backend work survives page closure.");
assert(!client.includes("window.KairosLocalInference.run"),"The primary production client must not execute inference on the phone.");
assert(!index.includes("kairos-local-inference-same-origin.js"),"The primary app must not load the WebLLM phone runtime.");
assert(!index.includes("webllm-bundle.js"),"The primary app must not load a WebLLM bundle.");
assert(!wrangler.includes('"* * * * *"'),"Minute-level website reconciliation must be removed.");
assert(wrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "true"'),"The approval-gated Shopify draft capability must be enabled.");
assert(wrangler.includes('KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"'),"The explicit live-publication control must be enabled.");

for(const marker of["rewriteManufacturingRequest","enforceExistingSetupForRun","Mindset Media Group™","MINIMUM_FINISHED_PAGES","sanitizeText"])assert(entry.includes(marker),`Digital Asset V2 runtime is missing: ${marker}`);
for(const marker of["executeDraftWithDelivery","rollbackAndFail"])assert(deliveryEntry.includes(marker),`Customer delivery entry is missing: ${marker}`);
for(const marker of["webhookSubscriptionCreate",'webhookSubscription: { uri, format: "JSON" }',"unwrapOrderPayload"])assert(delivery.includes(marker),`Customer delivery runtime is missing: ${marker}`);
for(const marker of["MINIMUM_FINISHED_PAGES = 100","buildCustomerSpecSheetPDF","buildThumbnailCoverPNG","digital_asset_v2_padding_detected"])assert(digitalAssetContract.includes(marker),`Digital Asset V2 contract is missing: ${marker}`);
for(const marker of["CUSTOMER_DELIVERABLE_NAMES","customer-spec-sheet.pdf","kdp-interior-6x9.pdf","digital-asset-edition-v2.pdf","cover-portrait-2048x3072.png","cover-thumbnail-2048x2048.png","Object.keys(files).length !== 6"])assert(creationArtifacts.includes(marker),`Customer release artifact contract is missing: ${marker}`);
assert(governanceContract.contractId==="mmg-digital-asset-edition-v2","The machine-readable V2 contract ID is incorrect.");
assert(governanceContract.manuscript.minimumFinishedPages===100,"The machine-readable contract must require 100 finished pages.");
assert(governanceContract.customerRelease.exactDeliverableCount===6,"The machine-readable contract must require six customer deliverables.");
assert(governanceContract.publisherIdentity==="Mindset Media Group™","The publisher identity is incorrect.");
assert(governanceContract.individualAttributionAllowed===false,"Individual attribution must remain prohibited.");
assert(doctrine.includes("Everything in the customer release package must be written for the customer")||doctrine.includes("Every item in the customer release package must be written for the customer"),"The customer-facing doctrine is missing.");
for(const marker of["MANUSCRIPT_AUTO_PIPELINE","approval-gated-shopify-draft","approval-gated-shopify-publication","WEBSITE_MUTATION_DENIED","OPERATION_OUT_OF_SCOPE"])assert(boundary.includes(marker),`Manuscript boundary is missing: ${marker}`);
for(const marker of["derivePublicationMetadata","/admin-vault/manifest","complete-production-package.zip","CREATE SHOPIFY PRODUCT DRAFT","PUBLISH PRODUCT LIVE"])assert(autoPipeline.includes(marker),`Automatic production pipeline is missing: ${marker}`);
assert(productPublication.includes("APPROVED_TEMPLATE_SUFFIXES"),"The custom product-template allowlist is missing.");
assert(productPublication.includes('status: "DRAFT"'),"Shopify product creation must begin as DRAFT.");

assert(deploy.includes("workflow_dispatch:"),"Production deployment must be manually dispatched.");
assert(!/^\s{2}push:/m.test(deploy),"Production deployment must not trigger automatically on repository pushes.");
for(const marker of["DEPLOY KAIROS MANUSCRIPT RUNTIME","github.ref == 'refs/heads/main'","environment: production","inputs.release_id","working-directory: cloudflare/mmg-ios","npx wrangler deploy --dry-run","run: npx wrangler deploy","/api/kairos/manuscripts/status","kairos-manuscript-generation-job-v1.js","generation-job","phone-independent","KairosManuscriptAutoPipelineController","/api/shopify/page-shell/publish"])assert(deploy.includes(marker),`Deployment contract is missing: ${marker}`);
assert(!deploy.includes("npm run build:webllm"),"Production deployment must not build the retired phone WebLLM runtime.");
assert(!deploy.includes("CreateMLCEngine"),"Production deployment must not certify the retired phone WebLLM runtime.");
assert(!deploy.includes("REPAIR_MMG_AUDITED_PAGES_NOW"),"Legacy Shopify page repair must not be deployable.");
assert(!deploy.includes("PUBLISH_MMG_PAGE_SHELL_RECONCILIATION"),"Legacy page-shell publication must not be deployable.");

assert(registry.defaultDecision==="deny-production-authority","Builder plugins must default to no production authority.");
assert(registry.runtime.openAiRuntimeRequired===false,"Builder guidance must not impose an OpenAI production runtime.");
assert(registry.runtime.shopifyRuntimeAccessFromBuilderPlugins==="none","Builder plugins must not gain Shopify runtime access.");
assert(registry.enforcement.builderGuidanceCannotExpandTaskScope===true,"Builder guidance must not expand task scope.");
assert(registry.enforcement.builderGuidanceCannotMutateShopify===true,"Builder plugins must not mutate Shopify.");
assert(registry.enforcement.manuscriptWorkflowShopifyAccess==="approval-gated-exact-product-release","Manuscript Shopify access must remain approval-gated.");
assert(registry.productionReleasePolicy?.scope==="single-manuscript-product","The production release must be scoped to one manuscript product.");
assert(registry.productionReleasePolicy?.directShopifyRoutesAllowed===false,"Direct Shopify routes must remain denied.");
assert(registry.productionReleasePolicy?.adminAssetVaultRequired===true,"Admin Asset Vault completion must be required.");
assert(registry.productionReleasePolicy?.finalZipRequired===true,"A final production ZIP must be required.");
assert(registry.productionReleasePolicy?.draftRequiresExplicitUserAction===true,"Shopify DRAFT creation must require explicit user action.");
assert(registry.productionReleasePolicy?.livePublishRequiresExplicitUserAction===true,"Live publication must require explicit user action.");
assert(registry.productionReleasePolicy?.themeMutationAuthorized===false,"Theme mutation must remain unauthorized.");
assert(registry.productionReleasePolicy?.navigationMutationAuthorized===false,"Navigation mutation must remain unauthorized.");
for(const advisor of registry.advisors||[]){assert(advisor.productionDependency===false,`${advisor.id} cannot be a production dependency by default.`);assert(advisor.mutationAuthority!==true,`${advisor.id} cannot have unrestricted mutation authority.`);}
console.log("Kairos backend-owned manuscript generation, Digital Asset Edition V2, customer delivery, Admin Asset Vault, and governed product-release validation passed.");
function read(relative){return fs.readFileSync(path.join(root,relative),"utf8");}function assert(condition,message){if(!condition)fail(message);}function fail(message){console.error(`Kairos manuscript activation validation failed: ${message}`);process.exit(1);}
