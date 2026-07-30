import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const policyPath = path.join(root, "governance/kairos-shopify-operation-scope-v1.json");
const doctrinePath = path.join(root, "cloudflare/kairos/shopify-doctrine.js");
const workflowPath = path.join(root, "cloudflare/kairos/workflow-registry.js");
const firewallPath = path.join(root, "cloudflare/kairos/scope-firewall.js");
const workerPath = path.join(root, "cloudflare/mmg-ios-worker.js");
const rootWranglerPath = path.join(root, "wrangler.toml");
const productionWranglerPath = path.join(root, "cloudflare/mmg-ios/wrangler.toml");
const localInferenceEntryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js");
const revenueDashboardEntryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-production-entry-revenue-dashboard-v1.js");
const operationalExecutionEntryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js");
const localOperationalEntryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-production-entry-local-operational-v1.js");
const localBrowserInferencePath = path.join(root, "web/kairos-dashboard/scripts/kairos-local-inference.js");
const manuscriptEntryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-production-entry-manuscript-online-v1.js");
const manuscriptBoundaryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js");
const manuscriptReleasePath = path.join(root, "cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js");
const productPublicationPath = path.join(root, "cloudflare/mmg-ios/src/kairos-product-publication-v1.js");
const builderRegistryPath = path.join(root, "governance/kairos-builder-plugin-registry-v1.json");

const requiredFiles = [policyPath,doctrinePath,workflowPath,firewallPath,workerPath,rootWranglerPath,productionWranglerPath,localInferenceEntryPath,revenueDashboardEntryPath,operationalExecutionEntryPath,localOperationalEntryPath,localBrowserInferencePath,manuscriptEntryPath,manuscriptBoundaryPath,manuscriptReleasePath,productPublicationPath,builderRegistryPath];
for (const file of requiredFiles) if (!fs.existsSync(file)) fail(`Missing required Kairos policy file: ${path.relative(root, file)}`);

for (const workflow of [
  ".github/workflows/deploy-clean-page-shell-on-pr.yml",
  ".github/workflows/diagnose-native-page-repair-on-pr.yml",
  ".github/workflows/execute-native-page-repair-on-pr.yml",
  ".github/workflows/verify-audited-page-shell-on-pr.yml",
]) assert(!fs.existsSync(path.join(root, workflow)),`Deprecated broad-scope storefront workflow must remain removed: ${workflow}`);

const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const builderRegistry = JSON.parse(fs.readFileSync(builderRegistryPath, "utf8"));
const doctrine = fs.readFileSync(doctrinePath, "utf8");
const workflows = fs.readFileSync(workflowPath, "utf8");
const firewall = fs.readFileSync(firewallPath, "utf8");
const worker = fs.readFileSync(workerPath, "utf8");
const rootWrangler = fs.readFileSync(rootWranglerPath, "utf8");
const productionWrangler = fs.readFileSync(productionWranglerPath, "utf8");
const localInferenceEntry = fs.readFileSync(localInferenceEntryPath, "utf8");
const revenueDashboardEntry = fs.readFileSync(revenueDashboardEntryPath, "utf8");
const operationalExecutionEntry = fs.readFileSync(operationalExecutionEntryPath, "utf8");
const localOperationalEntry = fs.readFileSync(localOperationalEntryPath, "utf8");
const localBrowserInference = fs.readFileSync(localBrowserInferencePath, "utf8");
const manuscriptEntry = fs.readFileSync(manuscriptEntryPath, "utf8");
const manuscriptBoundary = fs.readFileSync(manuscriptBoundaryPath, "utf8");
const manuscriptRelease = fs.readFileSync(manuscriptReleasePath, "utf8");
const productPublication = fs.readFileSync(productPublicationPath, "utf8");

assert(policy.defaultDecision === "deny", "Policy must default deny.");
assert(policy.runtime.requiredProvider === "cloudflare", "Cloudflare must be the required runtime.");
assert(policy.runtime.vercelAllowed === false, "Vercel must be prohibited.");
assert(policy.authority.taskIntentGrantsStoreWideAuthority === false, "Task intent must not grant store-wide authority.");
assert(policy.workflows["manuscript.write.v1"].shopifyAccess === "none", "The generic manuscript artifact workflow must retain zero Shopify access.");
assert(JSON.stringify(policy.workflows["manuscript.write.v1"].allowedOperations) === JSON.stringify(["artifact.manuscript.write"]),"The generic manuscript workflow may only assemble manuscript artifacts.");

for (const denied of ["shopify.arbitraryGraphql.execute","shopify.theme.publish","shopify.theme.mainFiles.upsert","shopify.theme.delete"]) assert(policy.permanentlyDeniedOperations.includes(denied), `Missing permanent denial: ${denied}`);

assert(!worker.includes("vercel"), "Cloudflare Worker must not contain a Vercel proxy or origin.");
assert(!worker.includes("VERCEL_RUNTIME_ORIGIN"), "Legacy Vercel runtime constant is prohibited.");
assert(worker.includes("handleKairosApiRequest"), "Cloudflare Worker must route API requests to Kairos runtime.");
assert(rootWrangler.includes('name = "mmg-ios-staging-host"'), "Root Wrangler config must use a non-production staging Worker name.");
assert(!rootWrangler.includes('name = "mmg-ios"'), "Root Wrangler config must not collide with the production Worker name.");
assert(rootWrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "false"'), "Root staging Shopify writes must default to disabled.");
assert(productionWrangler.includes('name = "mmg-ios"'), "Production Wrangler config must retain the canonical Worker name.");
const usesCompatibilityEntry = productionWrangler.includes('main = "src/kairos-production-entry-local-inference-v1.js"');
const usesRevenueWrapper = productionWrangler.includes('main = "src/kairos-production-entry-revenue-dashboard-v1.js"');
const usesOperationalWrapper = productionWrangler.includes('main = "src/kairos-production-entry-operational-execution-v1.js"');
const usesLocalOperationalWrapper = productionWrangler.includes('main = "src/kairos-production-entry-local-operational-v1.js"');
assert(usesCompatibilityEntry || usesRevenueWrapper || usesOperationalWrapper || usesLocalOperationalWrapper, "Production Worker must use a governed compatibility, revenue, operational, or local-only operational entry.");
if (usesRevenueWrapper || usesOperationalWrapper || usesLocalOperationalWrapper) {
  assert(revenueDashboardEntry.includes('from "./kairos-production-entry-local-inference-v1.js"'), "Revenue wrapper must import the governed compatibility entry.");
  assert(revenueDashboardEntry.includes("currentRuntime.fetch"), "Revenue wrapper must delegate unmatched requests to the governed compatibility runtime.");
  assert(revenueDashboardEntry.includes('X-Kairos-Automatic-Publication", "disabled"'), "Revenue wrapper must preserve the automatic-publication-disabled boundary.");
}
if (usesOperationalWrapper) {
  for (const marker of ['from "./kairos-production-entry-revenue-dashboard-v1.js"','KAIROS_OPERATIONAL_EXECUTION_BUILD','approvalPolicy: "explicit"','automaticPublicationAllowed: false','commerceMutationAllowed: false']) assert(operationalExecutionEntry.includes(marker), `Operational wrapper must preserve Shopify governance: ${marker}`);
}
if (usesLocalOperationalWrapper) {
  for (const marker of ['KAIROS_LOCAL_OPERATIONAL_BUILD','provider: "browser-webgpu"','externalPaidAPIUsed: false','openAICallAllowed: false','automaticPublicationAllowed: false','commerceMutationAllowed: false','X-Kairos-Commerce-Mutation", "approval-gated"']) assert(localOperationalEntry.includes(marker), `Local operational wrapper must preserve governance: ${marker}`);
  assert(!localOperationalEntry.includes("shopifyAdminGraphql"), "Local operational execution must not gain direct Shopify GraphQL authority.");
  assert(!localOperationalEntry.includes("productCreate("), "Local operational execution must not create Shopify products directly.");
  assert(!localOperationalEntry.includes("handleKairosAPI"), "Active local execution must not invoke the provider-backed API route.");
  assert(!localOperationalEntry.includes("startManuscriptGenerationWorkflow"), "Active local execution must not start the provider-backed manuscript Workflow.");
}
assert(productionWrangler.includes('KAIROS_MODEL_PROVIDER = "browser-webgpu"'), "Production manuscript generation must use browser WebGPU.");
assert(productionWrangler.includes('KAIROS_MODEL_ENDPOINT = ""'), "Production must not configure an external model endpoint.");
assert(productionWrangler.includes('KAIROS_MODEL_NAME = "Kairos Local WebLLM"'), "Production must identify the local model runtime.");
assert(productionWrangler.includes('KAIROS_NO_COST_MODE = "true"'), "Production must report local no-cost inference mode.");
assert(productionWrangler.includes('KAIROS_LOCAL_INFERENCE_ENABLED = "true"'), "Production must enable browser-local inference.");
assert(!productionWrangler.includes('KAIROS_MODEL_PROVIDER = "openai"'), "Production must not select OpenAI.");
assert(!productionWrangler.includes("api.openai.com"), "Production must not contain the OpenAI endpoint.");
assert(productionWrangler.includes('KAIROS_CLOUDFLARE_NEURONS_ENABLED = "false"'), "Production Worker must keep paid Cloudflare inference disabled.");
assert(productionWrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "true"'), "The exact approval-gated product DRAFT capability must be enabled.");
assert(productionWrangler.includes('KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"'), "The exact live-publication approval capability must be enabled.");
assert(!productionWrangler.includes('"* * * * *"'), "Minute-level website mutation cron must remain removed.");
assert(localBrowserInference.includes("generateSource"), "Local browser runtime must generate the authoritative source.");
assert(localBrowserInference.includes('provider: "browser-webgpu"'), "Local browser runtime must identify WebGPU inference.");
assert(localBrowserInference.includes("externalPaidAPIUsed: false"), "Local browser runtime must prove no paid inference API was used.");
assert(!localBrowserInference.includes("api.openai.com"), "Local browser runtime must not call OpenAI.");
assert(localInferenceEntry.includes("currentRuntime.fetch"), "Compatibility entry must delegate to the governed runtime chain.");
assert(localInferenceEntry.includes('X-Kairos-Cloudflare-Neurons", "0"'), "Production entry must stamp zero Cloudflare neurons.");
assert(manuscriptEntry.includes("inspectManuscriptOperation"), "Production manuscript entry must enforce the operation boundary.");
assert(manuscriptEntry.includes('shopifyAccess: shopifyDraftWritesEnabled ? "draft-only" : "none"'), "Production status must describe only the gated draft capability.");
assert(manuscriptEntry.includes("liveProductPublicationApprovalRequired: true"), "Live product publication must require explicit approval.");
assert(manuscriptEntry.includes("websiteMutationAuthorized: false"), "Website mutation authority must remain false.");
assert(manuscriptEntry.includes("navigationMutationAuthorized: false"), "Navigation mutation authority must remain false.");
assert(manuscriptBoundary.includes("MANUSCRIPT_AUTO_PIPELINE"), "The exact manuscript release-route matcher is missing.");
assert(manuscriptBoundary.includes("approval-gated-shopify-draft"), "The exact DRAFT scope is missing.");
assert(manuscriptBoundary.includes("approval-gated-shopify-publication"), "The exact live-publication scope is missing.");
assert(manuscriptBoundary.includes("WEBSITE_MUTATION_DENIED"), "Production boundary must deny direct website mutations.");
assert(manuscriptBoundary.includes("OPERATION_OUT_OF_SCOPE"), "Production boundary must fail closed for unrelated mutations.");
assert(manuscriptRelease.includes("/admin-vault/manifest"), "Admin Asset Vault completion is required before product release.");
assert(manuscriptRelease.includes("CREATE SHOPIFY PRODUCT DRAFT"), "DRAFT creation must require the exact visible approval action.");
assert(manuscriptRelease.includes("PUBLISH PRODUCT LIVE"), "Live publication must require the exact visible approval action.");
assert(manuscriptRelease.includes("websiteThemeMutationAuthorized: false"), "The release controller must not gain theme authority.");
assert(manuscriptRelease.includes("navigationMutationAuthorized: false"), "The release controller must not gain navigation authority.");
assert(productPublication.includes("APPROVED_TEMPLATE_SUFFIXES"), "Product publication must enforce a custom-template allowlist.");
assert(productPublication.includes('status: "DRAFT"'), "Product creation must begin as DRAFT.");
assert(productPublication.includes("product_template_verification_failed"), "The exact custom template must be verified after creation.");
assert(builderRegistry.runtime.shopifyRuntimeAccessFromBuilderPlugins === "none", "Builder plugins must not gain Shopify runtime access.");
assert(builderRegistry.enforcement.builderGuidanceCannotExpandTaskScope === true, "Builder guidance must not expand task scope.");
assert(builderRegistry.enforcement.builderGuidanceCannotMutateShopify === true, "Builder plugins must not mutate Shopify.");
assert(builderRegistry.enforcement.manuscriptWorkflowShopifyAccess === "approval-gated-exact-product-release", "Only the exact manuscript release controller may access Shopify.");
assert(builderRegistry.productionReleasePolicy?.directShopifyRoutesAllowed === false, "Direct Shopify routes must remain denied.");
assert(builderRegistry.productionReleasePolicy?.draftRequiresExplicitUserAction === true, "DRAFT creation must require explicit user action.");
assert(builderRegistry.productionReleasePolicy?.livePublishRequiresExplicitUserAction === true, "Live publication must require explicit user action.");
assert(workflows.includes('"manuscript.write.v1"'), "Generic manuscript workflow definition is missing.");
assert(workflows.includes('shopifyAccess: "none"'), "Generic manuscript workflow Shopify denial is missing.");
assert(firewall.includes("CROSS_DOMAIN_OPERATION_DENIED"), "Cross-domain firewall rule is missing.");
assert(firewall.includes("TARGET_OUT_OF_SCOPE"), "Exact-target firewall rule is missing.");
assert(firewall.includes("FIELD_OUT_OF_SCOPE"), "Exact-field firewall rule is missing.");
assert(firewall.includes("RECEIPT_STORE_REQUIRED"), "Persistent receipt requirement is missing.");
assert(doctrine.includes("storeWideAuthorityFromTaskIntent: false"), "Doctrine must deny implied store-wide authority.");
assert(doctrine.includes("arbitraryGraphqlAllowed: false"), "Doctrine must deny arbitrary GraphQL.");

console.log("Kairos local-only inference and Shopify operation policy validation passed.");
function assert(condition, message) { if (!condition) fail(message); }
function fail(message) { console.error(`Kairos Shopify policy validation failed: ${message}`); process.exit(1); }
