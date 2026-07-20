#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const wrapper = resolve(root, "scripts/shopify-store-operation.mjs");
const workspace = mkdtempSync(resolve(tmpdir(), "mmg-shopify-toolkit-"));
const queryFile = resolve(workspace, "read.graphql");
const mutationFile = resolve(workspace, "mutation.graphql");
const receiptDir = resolve(workspace, "receipts");

writeFileSync(queryFile, "query Readiness { shop { id } }\n", "utf8");
writeFileSync(
  mutationFile,
  'mutation ApprovedChange { tagsAdd(id: "gid://shopify/Product/1", tags: ["test"]) { userErrors { message } } }\n',
  "utf8",
);

const baseEnv = {
  ...process.env,
  OPT_OUT_INSTRUMENTATION: "true",
  SHOPIFY_CLI_NO_ANALYTICS: "1",
  MMG_SHOPIFY_STAGING_STORE: "kairos-staging.example.myshopify.com",
  MMG_SHOPIFY_PRODUCTION_STORE: "mindsetmediagroup.myshopify.com",
  MMG_SHOPIFY_RECEIPT_DIR: receiptDir,
};

function execute(mode, args, env = {}) {
  return spawnSync(process.execPath, [wrapper, mode, ...args], {
    encoding: "utf8",
    env: { ...baseEnv, ...env },
  });
}

const read = execute("read", ["--query-file", queryFile, "--dry-run"]);
assert.equal(read.status, 0, read.stderr);
const readPlan = JSON.parse(read.stdout);
assert.equal(readPlan.command, "shopify");
assert.equal(readPlan.args.includes("--allow-mutations"), false);

const mutationInReadMode = execute("read", ["--query-file", mutationFile, "--dry-run"]);
assert.equal(mutationInReadMode.status, 1);
assert.match(mutationInReadMode.stderr, /Read mode rejected/);

const closedMutationWindow = execute("mutate", [
  "--query-file",
  mutationFile,
  "--approval-id",
  "PR-TEST",
  "--dry-run",
]);
assert.equal(closedMutationWindow.status, 1);
assert.match(closedMutationWindow.stderr, /Mutations are disabled/);

const approvedStagingMutation = execute(
  "mutate",
  ["--query-file", mutationFile, "--approval-id", "PR-TEST", "--dry-run"],
  { MMG_SHOPIFY_ALLOW_MUTATIONS: "true" },
);
assert.equal(approvedStagingMutation.status, 0, approvedStagingMutation.stderr);
const mutationPlan = JSON.parse(approvedStagingMutation.stdout);
assert.equal(mutationPlan.args.includes("--allow-mutations"), true);

const unapprovedProductionMutation = execute(
  "mutate",
  [
    "--production",
    "--query-file",
    mutationFile,
    "--approval-id",
    "PR-TEST",
    "--dry-run",
  ],
  { MMG_SHOPIFY_ALLOW_MUTATIONS: "true" },
);
assert.equal(unapprovedProductionMutation.status, 1);
assert.match(unapprovedProductionMutation.stderr, /Production mutation requires/);

const receipt = JSON.parse(readFileSync(readPlan.receipt, "utf8"));
assert.equal(receipt.mode, "read");
assert.equal(receipt.environment, "staging");
assert.equal(receipt.dry_run, true);

console.log("Shopify AI Toolkit guard self-tests passed.");
