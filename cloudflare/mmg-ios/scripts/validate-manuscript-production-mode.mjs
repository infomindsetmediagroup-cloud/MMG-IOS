import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BUILD = "kairos-manuscript-production-validator-20260722-1";
const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(here, "..");
const sourceRoot = join(workerRoot, "src");

const wranglerPath = join(workerRoot, "wrangler.toml");
const entryPath = join(sourceRoot, "kairos-production-entry-manuscript-online-v1.js");
const boundaryPath = join(sourceRoot, "kairos-manuscript-operation-boundary-v1.js");
const publishingEntryPath = join(sourceRoot, "kairos-production-entry-publishing-readiness-v1.js");
const setupPath = join(sourceRoot, "kairos-manuscript-project-setup-v1.js");
const packagePath = join(sourceRoot, "kairos-publishing-package-v1.js");

for (const file of [
  wranglerPath,
  entryPath,
  boundaryPath,
  publishingEntryPath,
  setupPath,
  packagePath,
]) {
  assert.ok(existsSync(file), `Required manuscript production file is missing: ${file}`);
}

const wrangler = readFileSync(wranglerPath, "utf8");
assert.match(
  wrangler,
  /^main\s*=\s*"src\/kairos-production-entry-manuscript-online-v1\.js"/m,
  "Wrangler must point to the manuscript-only production entry.",
);
assert.match(
  wrangler,
  /KAIROS_MANUSCRIPT_RUNTIME_ENABLED\s*=\s*"true"/,
  "The manuscript runtime activation flag must be enabled.",
);
assert.match(
  wrangler,
  /KAIROS_SHOPIFY_WRITES_ENABLED\s*=\s*"false"/,
  "Shopify writes must remain disabled in manuscript mode.",
);
assert.match(
  wrangler,
  /crons\s*=\s*\["0 15 \* \* \*", "0 2 \* \* \*"\]/,
  "Only the approved morning and evening schedules may remain configured.",
);
assert.ok(!wrangler.includes('"* * * * *"'), "Minute-level website reconciliation must remain disabled.");
for (const binding of [
  'binding = "ASSETS"',
  'binding = "AI"',
  'binding = "IMAGES"',
  'name = "KAIROS_PROJECTS"',
]) {
  assert.ok(wrangler.includes(binding), `Required Cloudflare binding is missing: ${binding}`);
}

const entry = readFileSync(entryPath, "utf8");
for (const marker of [
  './kairos-production-entry-publishing-readiness-v1.js',
  './kairos-manuscript-operation-boundary-v1.js',
  'inspectManuscriptOperation',
  '/api/kairos/manuscripts/status',
  'mode: "manuscript-only"',
  'shopifyAccess: "none"',
  'websiteMutationAuthorized: false',
  'navigationMutationAuthorized: false',
  'homepageMutationAuthorized: false',
  'themeMutationAuthorized: false',
  'productMutationAuthorized: false',
  'minuteWebsiteCronEnabled: false',
]) {
  assert.ok(entry.includes(marker), `Manuscript production entry is missing: ${marker}`);
}

const boundary = readFileSync(boundaryPath, "utf8");
for (const marker of [
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
  'shopify',
  'navigation',
  'page-shell',
  'theme',
  'main-menu',
  'website-builder',
  'product-launch',
  'product-publication',
  'product-media',
]) {
  assert.ok(boundary.includes(prohibitedCapability), `Website mutation denial is missing: ${prohibitedCapability}`);
}

const runtimeModule = await import(`${pathToFileURL(entryPath).href}?validation=${Date.now()}`);
assert.equal(typeof runtimeModule.default?.fetch, "function", "Manuscript production runtime must export fetch().");
assert.equal(typeof runtimeModule.default?.scheduled, "function", "Manuscript production runtime must export scheduled().");
assert.equal(typeof runtimeModule.KairosProject, "function", "Manuscript production runtime must export KairosProject.");

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  mode: "manuscript-only",
  shopifyAccess: "none",
  websiteMutationAuthorized: false,
  minuteWebsiteCronEnabled: false,
  productionEntry: "kairos-production-entry-manuscript-online-v1.js",
}, null, 2));
