#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const ROOT = resolve(".");
const requiredFiles = [
  ".env.example",
  "docs/decisions/shopify-ai-toolkit-adoption.md",
  "docs/workflows/shopify-ai-toolkit-operations.md",
  "scripts/shopify-ai-toolkit-doctor.mjs",
  "scripts/shopify-ai-toolkit-install.mjs",
  "scripts/shopify-store-execute.mjs",
  "shopify/ai-toolkit/README.md",
  "shopify/ai-toolkit/policy.json",
  "shopify/ai-toolkit/operations/shop-info.graphql",
];

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const path of requiredFiles) {
  assert(existsSync(resolve(path)), `Missing required file: ${path}`);
}

if (existsSync(resolve("package.json"))) {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert(
    packageJson.engines?.node === ">=22.12.0",
    "package.json must require Node.js >=22.12.0.",
  );
  for (const script of [
    "shopify:toolkit:install",
    "shopify:toolkit:doctor",
    "shopify:toolkit:policy",
    "shopify:store:execute",
  ]) {
    assert(
      typeof packageJson.scripts?.[script] === "string",
      `package.json is missing script: ${script}`,
    );
  }
}

if (existsSync(resolve(".env.example"))) {
  const envExample = readFileSync(resolve(".env.example"), "utf8");
  assert(
    /OPT_OUT_INSTRUMENTATION=true/.test(envExample),
    ".env.example must opt out of Shopify Toolkit instrumentation.",
  );
  assert(
    /SHOPIFY_CLI_NO_ANALYTICS=1/.test(envExample),
    ".env.example must opt out of Shopify CLI analytics.",
  );
  assert(
    /MMG_SHOPIFY_ENVIRONMENT=development/.test(envExample),
    ".env.example must default Shopify operations to development.",
  );
}

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "coverage",
  "dist",
  "artifacts",
  "reports",
  "tmp",
  "temp",
]);

const secretPatterns = [
  /\bshpat_[A-Za-z0-9_-]{12,}\b/g,
  /\bshpca_[A-Za-z0-9_-]{12,}\b/g,
  /\bshppa_[A-Za-z0-9_-]{12,}\b/g,
  /\bshpss_[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-proj-[A-Za-z0-9_-]{12,}\b/g,
];

const executableExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".sh",
  ".yml",
  ".yaml",
]);

const walk = (directory) => {
  const results = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) results.push(...walk(absolute));
    else results.push(absolute);
  }
  return results;
};

for (const absolute of walk(ROOT)) {
  const path = relative(ROOT, absolute);
  let content;
  try {
    content = readFileSync(absolute, "utf8");
  } catch {
    continue;
  }

  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    assert(!pattern.test(content), `Possible committed secret in ${path}.`);
  }

  if (
    executableExtensions.has(extname(path)) &&
    !new Set([
      "scripts/shopify-store-execute.mjs",
      "scripts/shopify-ai-toolkit-policy.mjs",
    ]).has(path)
  ) {
    assert(
      !content.includes("--allow-mutations"),
      `Direct mutation bypass found in executable file: ${path}`,
    );
  }
}

const operationIndex = process.argv.indexOf("--operation");
if (operationIndex >= 0) {
  const operationPath = process.argv[operationIndex + 1];
  assert(Boolean(operationPath), "--operation requires a GraphQL file path.");
  if (operationPath && existsSync(resolve(operationPath))) {
    const operation = readFileSync(resolve(operationPath), "utf8")
      .replace(/#[^\n\r]*/g, " ")
      .trim();
    assert(operation.length > 0, `GraphQL operation is empty: ${operationPath}`);
    assert(
      /\b(query|mutation)\b/.test(operation),
      `GraphQL operation must declare query or mutation: ${operationPath}`,
    );
  } else if (operationPath) {
    assert(false, `GraphQL operation does not exist: ${operationPath}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR  ${failure}`);
  process.exit(1);
}

console.log("[shopify-toolkit] Repository policy checks passed.");
