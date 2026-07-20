#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "AGENTS.md",
  "docs/runbooks/shopify-ai-toolkit.md",
  "scripts/install-shopify-ai-toolkit.mjs",
  "scripts/shopify-toolkit-preflight.mjs",
  "scripts/shopify-toolkit-self-test.mjs",
  "scripts/shopify-store-operation.mjs",
  "shopify/graphql/read/store-identity.graphql",
];

const failures = [];
for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(root, relativePath))) failures.push(`Missing required file: ${relativePath}`);
}

const preflight = readFileSync(resolve(root, "scripts/shopify-toolkit-preflight.mjs"), "utf8");
if (!preflight.includes("const MINIMUM_NODE = [22, 12, 0]")) {
  failures.push("Shopify Toolkit preflight must enforce Node 22.12.0 or newer.");
}

const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
for (const requiredSetting of [
  "OPT_OUT_INSTRUMENTATION=true",
  "SHOPIFY_CLI_NO_ANALYTICS=1",
  "MMG_SHOPIFY_ALLOW_MUTATIONS=false",
  "MMG_SHOPIFY_PRODUCTION_APPROVED=false",
]) {
  if (!envExample.includes(requiredSetting)) failures.push(`.env.example is missing ${requiredSetting}`);
}

const wrapper = readFileSync(resolve(root, "scripts/shopify-store-operation.mjs"), "utf8");
for (const control of [
  "--allow-mutations",
  "MMG_SHOPIFY_ALLOW_MUTATIONS",
  "MMG_SHOPIFY_PRODUCTION_APPROVED",
  "approval-id",
  "OPT_OUT_INSTRUMENTATION",
  "SHOPIFY_CLI_NO_ANALYTICS",
]) {
  if (!wrapper.includes(control)) failures.push(`Shopify operation wrapper is missing control: ${control}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log("Shopify AI Toolkit policy controls are present.");
