#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

const LOCAL_ENV = resolve(".env.shopify.local");
const ALLOWED_ENVIRONMENTS = new Set(["development", "staging", "production"]);
const PRODUCTION_CONFIRMATION = "APPROVE_MMG_SHOPIFY_PRODUCTION_MUTATION";

const loadLocalEnv = () => {
  if (!existsSync(LOCAL_ENV)) return;
  for (const rawLine of readFileSync(LOCAL_ENV, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
};

const fail = (message) => {
  console.error(`[shopify-execute] ${message}`);
  process.exit(1);
};

const valueAfter = (flag, args) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

loadLocalEnv();

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(`Usage:
  npm run shopify:store:execute -- --store STORE.myshopify.com --query-file path/to/operation.graphql [Shopify CLI flags]

Rules:
  - Query files are mandatory; inline --query is rejected.
  - Mutations require MMG_SHOPIFY_MUTATION_APPROVED=1, a change ID, and a rollback plan.
  - Production mutations require an additional exact confirmation token.
  - The wrapper adds --allow-mutations only after governance checks pass.`);
  process.exit(0);
}

if (args.includes("--query")) {
  fail("Inline --query is disabled. Commit or stage an auditable --query-file.");
}
if (args.includes("--allow-mutations")) {
  fail(
    "Do not pass --allow-mutations directly. This wrapper adds it only after approval checks pass.",
  );
}

const queryFile = valueAfter("--query-file", args);
if (!queryFile) fail("--query-file is required.");
const operationPath = resolve(queryFile);
if (!existsSync(operationPath)) {
  fail(`GraphQL operation file does not exist: ${queryFile}`);
}

const store =
  valueAfter("--store", args) ||
  valueAfter("-s", args) ||
  process.env.SHOPIFY_STORE_DOMAIN;
if (!store) {
  fail("--store or SHOPIFY_STORE_DOMAIN is required.");
}
if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(store)) {
  fail("The store must use its canonical *.myshopify.com domain.");
}

const environment = process.env.MMG_SHOPIFY_ENVIRONMENT || "development";
if (!ALLOWED_ENVIRONMENTS.has(environment)) {
  fail(
    "MMG_SHOPIFY_ENVIRONMENT must be development, staging, or production.",
  );
}

const operationSource = readFileSync(operationPath, "utf8");
const operationWithoutComments = operationSource.replace(/#[^\n\r]*/g, " ");
const isMutation = /\bmutation\b/.test(operationWithoutComments);

const policyResult = spawnSync(
  process.execPath,
  ["scripts/shopify-ai-toolkit-policy.mjs", "--operation", queryFile],
  {
    stdio: "inherit",
    env: process.env,
  },
);
if (policyResult.status !== 0) {
  fail("Repository or GraphQL policy validation failed.");
}

const changeId = process.env.MMG_SHOPIFY_CHANGE_ID || "";
const rollbackPlan = process.env.MMG_SHOPIFY_ROLLBACK_PLAN || "";

if (isMutation) {
  if (process.env.MMG_SHOPIFY_MUTATION_APPROVED !== "1") {
    fail("Mutation blocked: MMG_SHOPIFY_MUTATION_APPROVED must equal 1.");
  }
  if (!changeId.trim()) {
    fail("Mutation blocked: MMG_SHOPIFY_CHANGE_ID is required.");
  }
  if (!rollbackPlan.trim()) {
    fail("Mutation blocked: MMG_SHOPIFY_ROLLBACK_PLAN is required.");
  }
  if (
    environment === "production" &&
    process.env.MMG_SHOPIFY_PRODUCTION_CONFIRMATION !== PRODUCTION_CONFIRMATION
  ) {
    fail(
      `Production mutation blocked: MMG_SHOPIFY_PRODUCTION_CONFIRMATION must equal ${PRODUCTION_CONFIRMATION}.`,
    );
  }
}

const shopifyArgs = ["store", "execute", ...args];
if (!args.includes("--store") && !args.includes("-s")) {
  shopifyArgs.push("--store", store);
}
if (isMutation) shopifyArgs.push("--allow-mutations");

const startedAt = new Date();
const operationSha256 = createHash("sha256")
  .update(operationSource)
  .digest("hex");

const execution = spawnSync("shopify", shopifyArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    OPT_OUT_INSTRUMENTATION: "true",
    SHOPIFY_CLI_NO_ANALYTICS: "1",
  },
});

const receipt = {
  schema: "mmg-shopify-operation-receipt-v1",
  environment,
  store,
  operationFile: queryFile,
  operationName: basename(queryFile),
  operationType: isMutation ? "mutation" : "query",
  operationSha256,
  changeId: changeId || null,
  rollbackPlanRecorded: Boolean(rollbackPlan),
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  exitCode: execution.status ?? 1,
  successful: execution.status === 0,
};

const receiptDirectory = resolve("artifacts/shopify-change-receipts");
mkdirSync(receiptDirectory, { recursive: true });
const safeChangeId = (changeId || "read-only")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .slice(0, 80);
const receiptPath = resolve(
  receiptDirectory,
  `${startedAt.toISOString().replace(/[:.]/g, "-")}-${safeChangeId}.json`,
);
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
  mode: 0o600,
});

console.log(`[shopify-execute] Receipt: ${receiptPath}`);
process.exit(execution.status ?? 1);
