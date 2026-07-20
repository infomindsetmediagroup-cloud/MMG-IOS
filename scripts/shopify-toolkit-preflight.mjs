#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const MINIMUM_NODE = [22, 12, 0];

function parseVersion(raw) {
  const match = String(raw).match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });

  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    error: result.error,
  };
}

const failures = [];
const warnings = [];

const nodeVersion = parseVersion(process.version);
if (!nodeVersion || !versionAtLeast(nodeVersion, MINIMUM_NODE)) {
  failures.push(`Node.js ${MINIMUM_NODE.join(".")} or newer is required; found ${process.version}.`);
}

if (process.env.OPT_OUT_INSTRUMENTATION !== "true") {
  failures.push("OPT_OUT_INSTRUMENTATION must be set to true for MMG Shopify Toolkit sessions.");
}

if (process.env.SHOPIFY_CLI_NO_ANALYTICS !== "1") {
  failures.push("SHOPIFY_CLI_NO_ANALYTICS must be set to 1 for MMG Shopify CLI sessions.");
}

const codex = run("codex", ["--version"]);
if (!codex.ok) {
  failures.push("Codex CLI is unavailable. Install or authenticate Codex before continuing.");
}

const shopify = run("shopify", ["version"]);
if (!shopify.ok) {
  failures.push("Shopify CLI is unavailable. Install @shopify/cli@latest globally before continuing.");
}

const stagingStore = process.env.MMG_SHOPIFY_STAGING_STORE?.trim();
const productionStore = process.env.MMG_SHOPIFY_PRODUCTION_STORE?.trim();
if (!stagingStore) {
  warnings.push("MMG_SHOPIFY_STAGING_STORE is not set; store operations will require --store explicitly.");
}
if (stagingStore && productionStore && stagingStore === productionStore) {
  failures.push("MMG_SHOPIFY_STAGING_STORE and MMG_SHOPIFY_PRODUCTION_STORE must not be the same store.");
}

console.log("MMG Shopify AI Toolkit preflight");
console.log(`- Node: ${process.version}`);
console.log(`- Codex: ${codex.ok ? codex.output : "missing"}`);
console.log(`- Shopify CLI: ${shopify.ok ? shopify.output : "missing"}`);
console.log(`- Instrumentation opt-out: ${process.env.OPT_OUT_INSTRUMENTATION === "true" ? "enabled" : "missing"}`);
console.log(`- Shopify CLI analytics opt-out: ${process.env.SHOPIFY_CLI_NO_ANALYTICS === "1" ? "enabled" : "missing"}`);
console.log(`- Staging store: ${stagingStore || "not configured"}`);
console.log(`- Production store: ${productionStore || "not configured"}`);

for (const warning of warnings) console.warn(`WARNING: ${warning}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  console.error("\nRequired setup commands:");
  console.error("  codex plugin add shopify@openai-curated");
  console.error("  npm install -g @shopify/cli@latest");
  console.error("  export OPT_OUT_INSTRUMENTATION=true");
  console.error("  export SHOPIFY_CLI_NO_ANALYTICS=1");
  process.exit(1);
}

console.log("\nPreflight passed.");
console.log("Confirm the Shopify plugin is installed by running: codex plugin add shopify@openai-curated");
console.log("Authenticate the staging store with the minimum scopes required for the next operation.");
