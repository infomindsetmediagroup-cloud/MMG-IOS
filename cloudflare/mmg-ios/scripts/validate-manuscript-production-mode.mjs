import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD = "kairos-manuscript-production-validator-20260730-11-local-only";
const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(here, "..");
const repoRoot = join(workerRoot, "..", "..");
const sourceRoot = join(workerRoot, "src");
const dashboardRoot = join(repoRoot, "web", "kairos-dashboard", "scripts");
const wranglerPath = join(workerRoot, "wrangler.toml");
const localOperationalPath = join(sourceRoot, "kairos-production-entry-local-operational-v1.js");
const operationalCompatibilityPath = join(sourceRoot, "kairos-production-entry-operational-execution-v1.js");
const localInferenceStorePath = join(sourceRoot, "kairos-local-inference-v1.js");
const localBrowserPath = join(dashboardRoot, "kairos-local-inference.js");
const localBridgePath = join(dashboardRoot, "executive-os-local-production-bridge.js");
const safariPath = join(dashboardRoot, "safari-manuscript-intake-compat.js");
const boundaryPath = join(sourceRoot, "kairos-manuscript-operation-boundary-v1.js");
const publishingEntryPath = join(sourceRoot, "kairos-production-entry-publishing-readiness-v1.js");
const autoPipelinePath = join(sourceRoot, "kairos-manuscript-auto-pipeline-v1.js");
const productPublicationPath = join(sourceRoot, "kairos-product-publication-v1.js");

for (const file of [
  wranglerPath,
  localOperationalPath,
  operationalCompatibilityPath,
  localInferenceStorePath,
  localBrowserPath,
  localBridgePath,
  safariPath,
  boundaryPath,
  publishingEntryPath,
  autoPipelinePath,
  productPublicationPath,
]) assert.ok(existsSync(file), `Required local production file is missing: ${file}`);

const wrangler = readFileSync(wranglerPath, "utf8");
assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry-local-operational-v1\.js"/m);
for (const marker of [
  'KAIROS_MODEL_PROVIDER = "browser-webgpu"',
  'KAIROS_MODEL_ENDPOINT = ""',
  'KAIROS_NO_COST_MODE = "true"',
  'KAIROS_LOCAL_INFERENCE_ENABLED = "true"',
  'KAIROS_MANUSCRIPT_START_MODE = "local-browser"',
  'binding = "ASSETS"',
  'name = "KAIROS_PROJECTS"',
  'name = "KAIROS_PROJECT_AGENT"',
  'binding = "KAIROS_PROJECT_WORKFLOW"',
]) assert.ok(wrangler.includes(marker), `Required local production configuration is missing: ${marker}`);
assert.ok(!wrangler.includes('KAIROS_MODEL_PROVIDER = "openai"'), "The active Worker cannot select OpenAI.");
assert.ok(!wrangler.includes("api.openai.com"), "The active Worker configuration cannot contain the OpenAI endpoint.");
assert.ok(!wrangler.includes("KAIROS_OPENAI_MODEL"), "The active Worker configuration cannot select an OpenAI model.");
assert.ok(!wrangler.includes('binding = "AI"'), "Paid Cloudflare AI binding must remain absent.");

const localOperational = readFileSync(localOperationalPath, "utf8");
for (const marker of [
  "KAIROS_LOCAL_OPERATIONAL_BUILD",
  'provider: "browser-webgpu"',
  "externalPaidAPIUsed: false",
  "openAICallAllowed: false",
  "/api/operational-readiness",
  "/api/workflows",
  "prepare-source",
  "approveFoundationWorkflow",
  "locally_generated_manuscript",
  "LOCAL_INFERENCE_VERIFICATION_FAILED",
  "automaticPublicationAllowed: false",
  "commerceMutationAllowed: false",
]) assert.ok(localOperational.includes(marker), `Local operational entry is missing: ${marker}`);
for (const prohibited of ["handleKairosAPI", "startManuscriptGenerationWorkflow", "generateManuscriptExpansion", "api.openai.com"]) {
  assert.ok(!localOperational.includes(prohibited), `The active local operational entry contains prohibited provider path: ${prohibited}`);
}

const compatibility = readFileSync(operationalCompatibilityPath, "utf8");
for (const marker of ["bootstrapProject", "startFoundationWorkflow", "advanceToApproval"]) {
  assert.ok(compatibility.includes(marker), `Foundation compatibility layer is missing: ${marker}`);
}

const localBrowser = readFileSync(localBrowserPath, "utf8");
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
]) assert.ok(localBrowser.includes(marker), `Local browser inference is missing: ${marker}`);
assert.ok(!localBrowser.includes("api.openai.com"), "Local browser inference cannot call OpenAI.");

const localBridge = readFileSync(localBridgePath, "utf8");
for (const marker of [
  "approveAndGenerateSource",
  "generateAndReconcileProduction",
  "KairosLocalInference",
  "prepare-source",
  "start-production",
  "browser-webgpu",
]) assert.ok(localBridge.includes(marker), `Executive local production bridge is missing: ${marker}`);

const safari = readFileSync(safariPath, "utf8");
assert.ok(safari.includes("activateLocalProductionBridge"), "Executive boot must load the local production bridge.");
assert.ok(safari.includes("executive-os-local-production-bridge.js?v=20260730-1"), "Executive boot must pin the local production bridge build.");

const localStore = readFileSync(localInferenceStorePath, "utf8");
for (const marker of ['provider: "browser-webgpu"', "noCost: true", "externalPaidAPIUsed: false", "cloudflareNeuronsUsed: 0"]) {
  assert.ok(localStore.includes(marker), `Local inference storage contract is missing: ${marker}`);
}

const boundary = readFileSync(boundaryPath, "utf8");
for (const marker of ["approval-gated-shopify-draft", "approval-gated-shopify-publication", "WEBSITE_MUTATION_DENIED", "OPERATION_OUT_OF_SCOPE"]) {
  assert.ok(boundary.includes(marker), `Manuscript operation boundary is missing: ${marker}`);
}

const autoPipeline = readFileSync(autoPipelinePath, "utf8");
for (const marker of ["CREATE SHOPIFY PRODUCT DRAFT", "PUBLISH PRODUCT LIVE", "websiteThemeMutationAuthorized: false", "navigationMutationAuthorized: false"]) {
  assert.ok(autoPipeline.includes(marker), `Automatic manuscript pipeline is missing: ${marker}`);
}

const productPublication = readFileSync(productPublicationPath, "utf8");
for (const marker of ["status: \"DRAFT\"", "product_template_verification_failed"]) {
  assert.ok(productPublication.includes(marker), `Governed Shopify publication is missing: ${marker}`);
}

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  mode: "browser-webgpu-local-production",
  inferenceProvider: "browser-webgpu",
  externalPaidAPIUsed: false,
  openAICallAllowed: false,
  phoneInferenceRequired: true,
  backendGenerationDurable: false,
  shopifyAccess: "approval-gated-exact-product-release",
  directWebsiteMutationAuthorized: false,
  productionEntry: "kairos-production-entry-local-operational-v1.js",
  runtimeVerification: "wrangler-dry-run",
}, null, 2));
