import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const sourceRoot = join(workerRoot, "src");
const entryPath = join(sourceRoot, "kairos-production-entry.js");
const wranglerPath = join(workerRoot, "wrangler.toml");

const requiredFiles = [
  entryPath,
  join(sourceRoot, "kairos-production-entry-v1.js"),
  join(sourceRoot, "kairos-production-entry-v2.js"),
  join(sourceRoot, "kairos-executive-briefing-v1.js"),
  join(repoRoot, "web/kairos-dashboard/index.html"),
  join(repoRoot, "web/kairos-dashboard/web-003.html"),
  join(repoRoot, "web/kairos-dashboard/scripts/creation-engine.js"),
];

for (const filename of requiredFiles) {
  assert.ok(existsSync(filename), `Required production file is missing: ${filename}`);
}

const staleRuntimeFiles = readdirSync(sourceRoot)
  .filter(name => /^kairos-production-entry-v(?:[3-9]|1[0-5])\.js$/.test(name));
assert.deepEqual(staleRuntimeFiles, [], `Obsolete production wrappers remain: ${staleRuntimeFiles.join(", ")}`);

assert.ok(
  !existsSync(join(sourceRoot, "kairos-deterministic-homepage-v2.js")),
  "Unused duplicate homepage planner remains in the production source tree.",
);

const wrangler = readFileSync(wranglerPath, "utf8");
assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry\.js"/m, "Wrangler must point to the canonical production entry.");
assert.match(wrangler, /crons\s*=\s*\["0 15 \* \* \*", "0 2 \* \* \*"\]/, "Morning and evening website-intelligence schedules must remain configured.");

const source = readFileSync(entryPath, "utf8");
for (const route of [
  "/api/shopify/staging/plan/jobs",
  "/api/shopify/staging/execute/jobs",
  "/api/shopify/website-retool/schema-inspection",
  "/api/shopify/website-retool/exceptions/prepare",
  "/api/shopify/website-retool/exceptions/execute",
  "/api/shopify/website-retool/exceptions/rollback",
  "/api/shopify/website-intelligence/run",
  "/api/shopify/website-intelligence/latest",
  "/api/shopify/link-intelligence/audit",
  "/api/shopify/link-intelligence/repair/prepare",
  "/api/shopify/link-intelligence/repair/execute",
  "/api/shopify/link-intelligence/review/prepare",
  "/api/shopify/link-intelligence/review/decide",
  "/api/shopify/link-intelligence/review/execute",
  "/api/executive-briefing/build",
  "/api/executive-briefing/latest",
  "/api/executive-briefing/decide",
]) {
  assert.ok(source.includes(route), `Canonical runtime is missing route: ${route}`);
}
assert.ok(source.includes("visual_replacement_forbidden"), "Patch-only homepage replacement guard is missing.");
assert.ok(source.includes("scheduled(controller, env, ctx)"), "Scheduled website intelligence handler is missing.");
assert.ok(source.includes("buildExecutiveBriefing"), "Scheduled executive briefing build is missing.");

const briefingSource = readFileSync(join(sourceRoot, "kairos-executive-briefing-v1.js"), "utf8");
for (const decision of ["approve", "deny", "fix"]) {
  assert.ok(briefingSource.includes(`\"${decision}\"`), `Executive briefing decision is missing: ${decision}`);
}
assert.ok(briefingSource.includes("America/Los_Angeles"), "Executive briefing must resolve morning/evening in Pacific time.");
assert.ok(briefingSource.includes("externalSocialPublishingAvailable: false"), "Briefing must not claim social publishing before connectors exist.");

const websiteProduction = readFileSync(join(repoRoot, "web/kairos-dashboard/web-003.html"), "utf8");
assert.ok(!websiteProduction.includes("PRESERVE_PROMPT"), "Website Production still contains a prefilled homepage prompt.");
assert.ok(!websiteProduction.includes("placeholder:j.placeholder"), "Website Production still assigns predetermined prompt placeholders.");

const runtimeModule = await import(`${pathToFileURL(entryPath).href}?validation=${Date.now()}`);
assert.equal(typeof runtimeModule.default?.fetch, "function", "Canonical runtime must export fetch().");
assert.equal(typeof runtimeModule.default?.scheduled, "function", "Canonical runtime must export scheduled().");
assert.equal(typeof runtimeModule.KairosProject, "function", "Canonical runtime must export KairosProject.");

console.log(JSON.stringify({
  status: "ready",
  baseline: "kairos-production-baseline-20260713-2",
  entry: "src/kairos-production-entry.js",
  staleRuntimeFilesRemoved: true,
  websiteProductionPromptEmpty: true,
  scheduledWebsiteIntelligence: true,
  scheduledExecutiveBriefing: true,
  executiveDecisionControls: ["approve", "deny", "fix", "view-evidence"],
}, null, 2));
