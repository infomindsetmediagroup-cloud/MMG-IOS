import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const paths = {
  wrangler: "cloudflare/mmg-ios/wrangler.toml",
  entry: "cloudflare/mmg-ios/src/kairos-production-entry-manuscript-online-v1.js",
  boundary: "cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js",
  autoPipeline: "cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js",
  productPublication: "cloudflare/mmg-ios/src/kairos-product-publication-v1.js",
  registry: "governance/kairos-builder-plugin-registry-v1.json",
  deploy: ".github/workflows/deploy-kairos-manuscript-runtime.yml",
};

for (const [name, relative] of Object.entries(paths)) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Missing ${name}: ${relative}`);
}

const wrangler = read(paths.wrangler);
const entry = read(paths.entry);
const boundary = read(paths.boundary);
const autoPipeline = read(paths.autoPipeline);
const productPublication = read(paths.productPublication);
const deploy = read(paths.deploy);
const registry = JSON.parse(read(paths.registry));

assert(wrangler.includes('main = "src/kairos-production-entry-manuscript-online-v1.js"'), "The active Worker must use the manuscript-only entry.");
assert(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must be removed.");
assert(wrangler.includes('KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"'), "Manuscript runtime activation flag is missing.");
assert(wrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "true"'), "The approval-gated Shopify draft capability must be enabled.");
assert(wrangler.includes('KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"'), "The explicit live-publication control must be enabled.");
assert(entry.includes("inspectManuscriptOperation"), "The manuscript entry must enforce the operation boundary.");
assert(entry.includes('shopifyAccess: shopifyDraftWritesEnabled ? "draft-only" : "none"'), "The status contract must distinguish approval-gated draft access from zero access.");
assert(entry.includes("liveProductPublicationApprovalRequired: true"), "The status contract must require explicit live approval.");
assert(entry.includes("adminAssetVaultStorage: true"), "The status contract must expose Admin Asset Vault storage.");
assert(boundary.includes("MANUSCRIPT_AUTO_PIPELINE"), "The exact automatic manuscript release routes are missing.");
assert(boundary.includes("approval-gated-shopify-draft"), "The governed Shopify draft scope is missing.");
assert(boundary.includes("approval-gated-shopify-publication"), "The governed live-publication scope is missing.");
assert(boundary.includes("WEBSITE_MUTATION_DENIED"), "Direct website mutation denial is missing.");
assert(boundary.includes("OPERATION_OUT_OF_SCOPE"), "Default-deny operation handling is missing.");
assert(autoPipeline.includes("derivePublicationMetadata"), "Automatic publication metadata extraction is missing.");
assert(autoPipeline.includes("/admin-vault/manifest"), "Admin Asset Vault manifest storage is missing.");
assert(autoPipeline.includes("complete-production-package.zip"), "The final production ZIP contract is missing.");
assert(autoPipeline.includes("CREATE SHOPIFY PRODUCT DRAFT"), "Explicit Shopify DRAFT action is missing.");
assert(autoPipeline.includes("PUBLISH PRODUCT LIVE"), "Explicit live-publication action is missing.");
assert(productPublication.includes("APPROVED_TEMPLATE_SUFFIXES"), "The custom product-template allowlist is missing.");
assert(productPublication.includes('status: "DRAFT"'), "Shopify product creation must begin as DRAFT.");
assert(deploy.includes("working-directory: cloudflare/mmg-ios"), "Deployment must use the configured manuscript Worker directory.");
assert(deploy.includes("/api/kairos/manuscripts/status"), "Deployment must verify manuscript readiness.");
assert(deploy.includes("Download Production-Ready ZIP"), "Deployment must verify the vault ZIP controller.");
assert(deploy.includes("/api/shopify/page-shell/publish"), "Deployment must probe the direct Shopify denial boundary.");
assert(!deploy.includes("REPAIR_MMG_AUDITED_PAGES_NOW"), "Legacy Shopify page repair must not be deployable.");
assert(!deploy.includes("PUBLISH_MMG_PAGE_SHELL_RECONCILIATION"), "Legacy page-shell publication must not be deployable.");
assert(registry.defaultDecision === "deny-production-authority", "Builder plugins must default to no production authority.");
assert(registry.runtime.openAiRuntimeRequired === false, "Builder guidance must not impose an OpenAI production runtime.");
assert(registry.runtime.shopifyRuntimeAccessFromBuilderPlugins === "none", "Builder plugins must not gain Shopify runtime access.");
assert(registry.enforcement.builderGuidanceCannotExpandTaskScope === true, "Builder guidance must not expand task scope.");
assert(registry.enforcement.builderGuidanceCannotMutateShopify === true, "Builder plugins must not mutate Shopify.");
assert(registry.enforcement.manuscriptWorkflowShopifyAccess === "approval-gated-exact-product-release", "Manuscript Shopify access must be limited to the exact approval-gated release pipeline.");
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

console.log("Kairos manuscript activation, Admin Asset Vault, and governed product-release validation passed.");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  console.error(`Kairos manuscript activation validation failed: ${message}`);
  process.exit(1);
}
