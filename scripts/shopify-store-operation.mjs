#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [mode, ...rawArgs] = process.argv.slice(2);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) fail(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    if (["production", "dry-run"].includes(key)) {
      parsed[key] = true;
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith("--")) fail(`Missing value for --${key}`);
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

if (!["read", "mutate"].includes(mode)) {
  fail("Usage: node scripts/shopify-store-operation.mjs <read|mutate> --query-file <path> [--variable-file <path>] [--store <domain>] [--version <YYYY-MM>] [--approval-id <id>] [--production] [--dry-run]");
}

const args = parseArgs(rawArgs);
const queryFile = args["query-file"] ? resolve(args["query-file"]) : null;
if (!queryFile) fail("--query-file is required.");

let query;
try {
  query = readFileSync(queryFile, "utf8");
} catch (error) {
  fail(`Unable to read query file ${queryFile}: ${error.message}`);
}

const containsMutation = /\bmutation\b/i.test(query);
if (mode === "read" && containsMutation) {
  fail("Read mode rejected a GraphQL mutation.");
}
if (mode === "mutate" && !containsMutation) {
  fail("Mutate mode requires a GraphQL mutation.");
}

const productionStore = process.env.MMG_SHOPIFY_PRODUCTION_STORE?.trim();
const stagingStore = process.env.MMG_SHOPIFY_STAGING_STORE?.trim();
const store = args.store?.trim() || (args.production ? productionStore : stagingStore);
if (!store) fail("No Shopify store was supplied. Set MMG_SHOPIFY_STAGING_STORE or pass --store.");

const isProduction = Boolean(productionStore && store === productionStore);
if (args.production && !isProduction) {
  fail("--production was supplied, but the selected store does not match MMG_SHOPIFY_PRODUCTION_STORE.");
}
if (!args.production && isProduction) {
  fail("Production store access requires the explicit --production flag.");
}

const approvalId = args["approval-id"]?.trim();
if (mode === "mutate") {
  if (process.env.MMG_SHOPIFY_ALLOW_MUTATIONS !== "true") {
    fail("Mutations are disabled. Set MMG_SHOPIFY_ALLOW_MUTATIONS=true only for an approved operation.");
  }
  if (!approvalId) fail("Mutations require --approval-id <change-or-approval-reference>.");
  if (isProduction && process.env.MMG_SHOPIFY_PRODUCTION_APPROVED !== "true") {
    fail("Production mutation requires MMG_SHOPIFY_PRODUCTION_APPROVED=true for this approved execution window.");
  }
}

if (process.env.OPT_OUT_INSTRUMENTATION !== "true") {
  fail("OPT_OUT_INSTRUMENTATION=true is required.");
}
if (process.env.SHOPIFY_CLI_NO_ANALYTICS !== "1") {
  fail("SHOPIFY_CLI_NO_ANALYTICS=1 is required.");
}

const commandArgs = ["store", "execute", "--store", store, "--query-file", queryFile, "--json"];
if (args["variable-file"]) {
  commandArgs.push("--variable-file", resolve(args["variable-file"]));
}
if (args.version || process.env.SHOPIFY_API_VERSION) {
  commandArgs.push("--version", args.version || process.env.SHOPIFY_API_VERSION);
}
if (mode === "mutate") commandArgs.push("--allow-mutations");

const receiptDirectory = resolve(process.env.MMG_SHOPIFY_RECEIPT_DIR || "reports/shopify-operations");
const startedAt = new Date().toISOString();
const receiptBase = `${startedAt.replace(/[:.]/g, "-")}-${mode}-${basename(queryFile).replace(/[^a-zA-Z0-9._-]/g, "-")}`;
const receiptPath = resolve(receiptDirectory, `${receiptBase}.json`);

const receipt = {
  schema_version: "1.0",
  started_at: startedAt,
  mode,
  store,
  environment: isProduction ? "production" : "staging",
  query_file: queryFile,
  variable_file: args["variable-file"] ? resolve(args["variable-file"]) : null,
  api_version: args.version || process.env.SHOPIFY_API_VERSION || "latest-stable",
  approval_id: approvalId || null,
  dry_run: Boolean(args["dry-run"]),
  status: "prepared",
};

mkdirSync(dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

if (args["dry-run"]) {
  console.log(JSON.stringify({ command: "shopify", args: commandArgs, receipt: receiptPath }, null, 2));
  process.exit(0);
}

const result = spawnSync("shopify", commandArgs, {
  encoding: "utf8",
  env: process.env,
  shell: process.platform === "win32",
});

receipt.completed_at = new Date().toISOString();
receipt.exit_code = result.status;
receipt.status = result.status === 0 ? "succeeded" : "failed";
receipt.stdout = result.stdout?.trim() || null;
receipt.stderr = result.stderr?.trim() || null;
receipt.error = result.error?.message || null;
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
console.error(`\nOperation receipt: ${receiptPath}`);

process.exit(result.status ?? 1);
