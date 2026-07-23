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
const manuscriptEntryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-production-entry-manuscript-online-v1.js");
const manuscriptBoundaryPath = path.join(root, "cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js");
const manuscriptReleasePath = path.join(root, "cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js");
const liveReplacementPath = path.join(root, "cloudflare/mmg-ios/src/kairos-manuscript-live-product-replacement-v1.js");
const productPublicationPath = path.join(root, "cloudflare/mmg-ios/src/kairos-product-publication-v1.js");
const builderRegistryPath = path.join(root, "governance/kairos-builder-plugin-registry-v1.json");

const requiredFiles = [
  policyPath, doctrinePath, workflowPath, firewallPath, workerPath, rootWranglerPath,
  productionWranglerPath, manuscriptEntryPath, manuscriptBoundaryPath, manuscriptReleasePath,
  liveReplacementPath, productPublicationPath, builderRegistryPath,
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) fail(`Missing required Kairos policy file: ${path.relative(root, file)}`);
}

for (const workflow of [
  ".github/workflows/deploy-clean-page-shell-on-pr.yml",
  ".github/workflows/diagnose-native-page-repair-on-pr.yml",
  ".github/workflows/execute-native-page-repair-on-pr.yml",
  ".github/workflows/verify-audited-page-shell-on-pr.yml",
]) {
  assert(!fs.existsSync(path.join(root, workflow)), `Deprecated broad-scope storefront workflow must remain removed: ${workflow}`);
}

const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const builderRegistry = JSON.parse(fs.readFileSync(builderRegistryPath, "utf8"));
const doctrine = fs.readFileSync(doctrinePath, "utf8");
const workflows = fs.readFileSync(workflowPath, "utf8");
const firewall = fs.readFileSync(firewallPath, "utf8");
const worker = fs.readFileSync(workerPath, "utf8");
const rootWrangler = fs.readFileSync(rootWranglerPath, "utf8");
const productionWrangler = fs.readFileSync(productionWranglerPath, "utf8");
const manuscriptEntry = fs.readFileSync(manuscriptEntryPath, "utf8");
const manuscriptBoundary = fs.readFileSync(manuscriptBoundaryPath, "utf8");
const manuscriptRelease = fs.readFileSync(manuscriptReleasePath, "utf8");
const liveReplacement = fs.readFileSync(liveReplacementPath, "utf8");
const productPublication = fs.readFileSync(productPublicationPath, "utf8");

assert(policy.defaultDecision === "deny", "Policy must default deny.");
assert(policy.runtime.requiredProvider === "cloudflare", "Cloudflare must be the required runtime.");
assert(policy.runtime.vercelAllowed === false, "Vercel must be prohibited.");
assert(policy.runtime.openAiRequired === false, "OpenAI must not be required.");
assert(policy.authority.taskIntentGrantsStoreWideAuthority === false, "Task intent must not grant store-wide authority.");
assert(policy.workflows["manuscript.write.v1"].shopifyAccess === "none", "The generic manuscript artifact workflow must retain zero Shopify access.");
assert(JSON.stringify(policy.workflows["manuscript.write.v1"].allowedOperations) === JSON.stringify(["artifact.manuscript.write"]), "The generic manuscript workflow may only assemble manuscript artifacts.");

for (const denied of ["shopify.arbitraryGraphql.execute", "shopify.theme.publish", "shopify.theme.mainFiles.upsert", "shopify.theme.delete"]) {
  assert(policy.permanentlyDeniedOperations.includes(denied), `Missing permanent denial: ${denied}`);
}

assert(!worker.includes("vercel"), "Cloudflare Worker must not contain a Vercel proxy or origin.");
assert(!worker.includes("VERCEL_RUNTIME_ORIGIN"), "Legacy Vercel runtime constant is prohibited.");
assert(worker.includes("handleKairosApiRequest"), "Cloudflare Worker must route API requests to Kairos runtime.");
assert(rootWrangler.includes('name = "mmg-ios-staging-host"'), "Root Wrangler config must use a non-production staging Worker name.");
assert(!rootWrangler.includes('name = "mmg-ios"'), "Root Wrangler config must not collide with the production Worker name.");
assert(rootWrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "false"'), "Root staging Shopify writes must default to disabled.");
assert(productionWrangler.includes('name = "mmg-ios"'), "Production Wrangler config must retain the canonical Worker name.");
assert(productionWrangler.includes('main = "src/kairos-production-entry-manuscript-online-v1.js"'), "Production Worker must use the manuscript-only entry.");
assert(productionWrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "true"'), "The exact approval-gated Shopify capability must be enabled.");
assert(productionWrangler.includes('KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"'), "The exact live-product capability must be enabled.");
assert(!productionWrangler.includes('"* * * * *"'), "Minute-level website mutation cron must remain removed.");
assert(manuscriptEntry.includes("inspectManuscriptOperation"), "Production manuscript entry must enforce the operation boundary.");
assert(manuscriptEntry.includes("handleManuscriptLiveProductReplacement"), "Production manuscript entry must route the controlled replacement controller.");
assert(manuscriptEntry.includes('shopifyAccess: shopifyDraftWritesEnabled ? "exact-product-release-only" : "none"'), "Production status must describe only exact product-release authority.");
assert(manuscriptEntry.includes("liveProductReplacementApprovalRequired: true"), "Live product replacement must require explicit approval.");
assert(manuscriptEntry.includes("websiteMutationAuthorized: false"), "Website mutation authority must remain false.");
assert(manuscriptEntry.includes("navigationMutationAuthorized: false"), "Navigation mutation authority must remain false.");
assert(manuscriptBoundary.includes("MANUSCRIPT_AUTO_PIPELINE"), "The exact manuscript release-route matcher is missing.");
assert(manuscriptBoundary.includes("MANUSCRIPT_LIVE_REPLACEMENT"), "The exact live-product replacement matcher is missing.");
assert(manuscriptBoundary.includes("approval-gated-live-product-replacement"), "The exact replacement scope is missing.");
assert(manuscriptBoundary.includes("approval-gated-live-product-replacement-rollback"), "The exact replacement rollback scope is missing.");
assert(manuscriptBoundary.includes("WEBSITE_MUTATION_DENIED"), "Production boundary must deny direct website mutations.");
assert(manuscriptBoundary.includes("OPERATION_OUT_OF_SCOPE"), "Production boundary must fail closed for unrelated mutations.");
assert(manuscriptRelease.includes("/admin-vault/manifest"), "Admin Asset Vault completion is required before product release.");
assert(manuscriptRelease.includes("CREATE SHOPIFY PRODUCT DRAFT"), "DRAFT creation must require the exact visible approval action.");
assert(manuscriptRelease.includes("PUBLISH PRODUCT LIVE"), "Live publication must require the exact visible approval action.");
assert(liveReplacement.includes("REPLACE LIVE PRODUCT FROM VAULT"), "Live replacement must require the exact visible approval action.");
assert(liveReplacement.includes("ROLL BACK LIVE PRODUCT REPLACEMENT"), "Replacement rollback must require the exact visible approval action.");
assert(liveReplacement.includes("existingProductUpdatedInPlace: true"), "Existing products must be updated in place.");
assert(liveReplacement.includes("handlePreserved: true"), "Existing product handles must be preserved.");
assert(liveReplacement.includes("pricePreserved: true"), "Existing product prices must be preserved.");
assert(liveReplacement.includes("digitalDeliveryAssociationsPreserved: true"), "Existing digital-delivery associations must be preserved.");
assert(liveReplacement.includes("storefrontVerificationRequired: true"), "Storefront verification must be required.");
assert(liveReplacement.includes("themeMutationAuthorized: false"), "The replacement controller must not gain theme authority.");
assert(liveReplacement.includes("navigationMutationAuthorized: false"), "The replacement controller must not gain navigation authority.");
assert(productPublication.includes("APPROVED_TEMPLATE_SUFFIXES"), "Product publication must enforce a custom-template allowlist.");
assert(productPublication.includes('status: "DRAFT"'), "Product creation must begin as DRAFT.");
assert(productPublication.includes("existing_live_product_protected"), "The generic DRAFT path must protect active products.");
assert(builderRegistry.runtime.shopifyRuntimeAccessFromBuilderPlugins === "none", "Builder plugins must not gain Shopify runtime access.");
assert(builderRegistry.enforcement.builderGuidanceCannotExpandTaskScope === true, "Builder guidance must not expand task scope.");
assert(builderRegistry.enforcement.builderGuidanceCannotMutateShopify === true, "Builder plugins must not mutate Shopify.");
assert(builderRegistry.enforcement.manuscriptWorkflowShopifyAccess === "approval-gated-exact-product-release-and-live-replacement", "Only exact manuscript release and replacement controllers may access Shopify.");
assert(builderRegistry.productionReleasePolicy?.directShopifyRoutesAllowed === false, "Direct Shopify routes must remain denied.");
assert(builderRegistry.productionReleasePolicy?.liveReplacementRequiresExplicitUserAction === true, "Live replacement must require explicit user action.");
assert(builderRegistry.productionReleasePolicy?.liveReplacementRollbackRequiresExplicitUserAction === true, "Replacement rollback must require explicit user action.");
assert(builderRegistry.productionReleasePolicy?.existingProductIdentityMustBePreserved === true, "Existing product identity must be preserved.");
assert(builderRegistry.productionReleasePolicy?.existingProductHandleMustBePreserved === true, "Existing product handle must be preserved.");
assert(builderRegistry.productionReleasePolicy?.existingProductPriceMustBePreserved === true, "Existing product price must be preserved.");
assert(builderRegistry.productionReleasePolicy?.existingDigitalDeliveryAssociationsMustBePreserved === true, "Existing digital-delivery associations must be preserved.");
assert(workflows.includes('"manuscript.write.v1"'), "Generic manuscript workflow definition is missing.");
assert(workflows.includes('shopifyAccess: "none"'), "Generic manuscript workflow Shopify denial is missing.");
assert(firewall.includes("CROSS_DOMAIN_OPERATION_DENIED"), "Cross-domain firewall rule is missing.");
assert(firewall.includes("TARGET_OUT_OF_SCOPE"), "Exact-target firewall rule is missing.");
assert(firewall.includes("FIELD_OUT_OF_SCOPE"), "Exact-field firewall rule is missing.");
assert(firewall.includes("RECEIPT_STORE_REQUIRED"), "Persistent receipt requirement is missing.");
assert(doctrine.includes("storeWideAuthorityFromTaskIntent: false"), "Doctrine must deny implied store-wide authority.");
assert(doctrine.includes("arbitraryGraphqlAllowed: false"), "Doctrine must deny arbitrary GraphQL.");

console.log("Kairos Shopify operation policy validation passed.");

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  console.error(`Kairos Shopify policy validation failed: ${message}`);
  process.exit(1);
}
