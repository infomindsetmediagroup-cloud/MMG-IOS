import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const paths = {
  wrangler: "cloudflare/mmg-ios/wrangler.toml",
  entry: "cloudflare/mmg-ios/src/kairos-production-entry-manuscript-online-v1.js",
  boundary: "cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js",
  registry: "governance/kairos-builder-plugin-registry-v1.json",
  deploy: ".github/workflows/deploy-kairos-manuscript-runtime.yml",
};

for (const [name, relative] of Object.entries(paths)) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Missing ${name}: ${relative}`);
}

const wrangler = read(paths.wrangler);
const entry = read(paths.entry);
const boundary = read(paths.boundary);
const deploy = read(paths.deploy);
const registry = JSON.parse(read(paths.registry));

assert(wrangler.includes('main = "src/kairos-production-entry-manuscript-online-v1.js"'), "The active Worker must use the manuscript-only entry.");
assert(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must be removed.");
assert(wrangler.includes('KAIROS_MANUSCRIPT_RUNTIME_ENABLED = "true"'), "Manuscript runtime activation flag is missing.");
assert(wrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "false"'), "Shopify writes must remain disabled.");
assert(entry.includes("inspectManuscriptOperation"), "The manuscript entry must enforce the operation boundary.");
assert(entry.includes("shopifyAccess: \"none\""), "The manuscript status contract must declare zero Shopify access.");
assert(boundary.includes("WEBSITE_MUTATION_DENIED"), "Website mutation denial is missing.");
assert(boundary.includes("OPERATION_OUT_OF_SCOPE"), "Default-deny operation handling is missing.");
assert(deploy.includes("working-directory: cloudflare/mmg-ios"), "Deployment must use the configured manuscript Worker directory.");
assert(deploy.includes("/api/kairos/manuscripts/status"), "Deployment must verify manuscript readiness.");
assert(deploy.includes("/api/shopify/page-shell/publish"), "Deployment must probe the Shopify denial boundary.");
assert(!deploy.includes("REPAIR_MMG_AUDITED_PAGES_NOW"), "Legacy Shopify page repair must not be deployable.");
assert(!deploy.includes("PUBLISH_MMG_PAGE_SHELL_RECONCILIATION"), "Legacy page-shell publication must not be deployable.");
assert(registry.defaultDecision === "deny-production-authority", "Builder plugins must default to no production authority.");
assert(registry.runtime.openAiRuntimeRequired === false, "Builder guidance must not impose an OpenAI production runtime.");
assert(registry.runtime.shopifyRuntimeAccessFromBuilderPlugins === "none", "Builder plugins must not gain Shopify runtime access.");
assert(registry.enforcement.builderGuidanceCannotExpandTaskScope === true, "Builder guidance must not expand task scope.");
assert(registry.enforcement.manuscriptWorkflowShopifyAccess === "none", "Manuscript workflows must have zero Shopify access.");

for (const advisor of registry.advisors || []) {
  assert(advisor.productionDependency === false, `${advisor.id} cannot be a production dependency by default.`);
  assert(advisor.mutationAuthority !== true, `${advisor.id} cannot have unrestricted mutation authority.`);
}

console.log("Kairos manuscript activation and builder-plugin validation passed.");

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
