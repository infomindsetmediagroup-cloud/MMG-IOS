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
const builderRegistryPath = path.join(root, "governance/kairos-builder-plugin-registry-v1.json");

const requiredFiles = [
  policyPath,
  doctrinePath,
  workflowPath,
  firewallPath,
  workerPath,
  rootWranglerPath,
  productionWranglerPath,
  manuscriptEntryPath,
  manuscriptBoundaryPath,
  builderRegistryPath,
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) fail(`Missing required Kairos policy file: ${path.relative(root, file)}`);
}

const prohibitedAutomaticWorkflowPaths = [
  ".github/workflows/deploy-clean-page-shell-on-pr.yml",
  ".github/workflows/diagnose-native-page-repair-on-pr.yml",
  ".github/workflows/execute-native-page-repair-on-pr.yml",
  ".github/workflows/verify-audited-page-shell-on-pr.yml",
];
for (const workflow of prohibitedAutomaticWorkflowPaths) {
  assert(
    !fs.existsSync(path.join(root, workflow)),
    `Deprecated broad-scope storefront workflow must remain removed: ${workflow}`,
  );
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

assert(policy.defaultDecision === "deny", "Policy must default deny.");
assert(policy.runtime.requiredProvider === "cloudflare", "Cloudflare must be the required runtime.");
assert(policy.runtime.vercelAllowed === false, "Vercel must be prohibited.");
assert(policy.runtime.openAiRequired === false, "OpenAI must not be required.");
assert(policy.authority.taskIntentGrantsStoreWideAuthority === false, "Task intent must not grant store-wide authority.");
assert(policy.workflows["manuscript.write.v1"].shopifyAccess === "none", "Manuscript workflow must have zero Shopify access.");
assert(
  JSON.stringify(policy.workflows["manuscript.write.v1"].allowedOperations) === JSON.stringify(["artifact.manuscript.write"]),
  "Manuscript workflow may only assemble manuscript artifacts.",
);

for (const denied of [
  "shopify.arbitraryGraphql.execute",
  "shopify.theme.publish",
  "shopify.theme.mainFiles.upsert",
  "shopify.theme.delete",
]) {
  assert(policy.permanentlyDeniedOperations.includes(denied), `Missing permanent denial: ${denied}`);
}

assert(!worker.includes("vercel"), "Cloudflare Worker must not contain a Vercel proxy or origin.");
assert(!worker.includes("VERCEL_RUNTIME_ORIGIN"), "Legacy Vercel runtime constant is prohibited.");
assert(worker.includes("handleKairosApiRequest"), "Cloudflare Worker must route API requests to Kairos runtime.");
assert(rootWrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "false"'), "Root Shopify writes must default to disabled.");
assert(productionWrangler.includes('main = "src/kairos-production-entry-manuscript-online-v1.js"'), "Production Worker must use the manuscript-only entry.");
assert(productionWrangler.includes('KAIROS_SHOPIFY_WRITES_ENABLED = "false"'), "Production Shopify writes must remain disabled.");
assert(!productionWrangler.includes('"* * * * *"'), "Minute-level website mutation cron must remain removed.");
assert(manuscriptEntry.includes("inspectManuscriptOperation"), "Production manuscript entry must enforce the operation boundary.");
assert(manuscriptEntry.includes('shopifyAccess: "none"'), "Production manuscript status must declare zero Shopify access.");
assert(manuscriptBoundary.includes("WEBSITE_MUTATION_DENIED"), "Production boundary must deny website mutations.");
assert(manuscriptBoundary.includes("OPERATION_OUT_OF_SCOPE"), "Production boundary must fail closed for unrelated mutations.");
assert(builderRegistry.runtime.shopifyRuntimeAccessFromBuilderPlugins === "none", "Builder plugins must not gain Shopify runtime access.");
assert(builderRegistry.enforcement.builderGuidanceCannotExpandTaskScope === true, "Builder guidance must not expand task scope.");
assert(workflows.includes('"manuscript.write.v1"'), "Manuscript workflow definition is missing.");
assert(workflows.includes('shopifyAccess: "none"'), "Manuscript workflow Shopify denial is missing.");
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
