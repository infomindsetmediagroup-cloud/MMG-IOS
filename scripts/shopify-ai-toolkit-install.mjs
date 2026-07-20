#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MIN_NODE = [22, 12, 0];

const parseVersion = (value) =>
  String(value)
    .replace(/^v/, "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);

const versionAtLeast = (actual, minimum) => {
  for (let index = 0; index < minimum.length; index += 1) {
    if ((actual[index] ?? 0) > minimum[index]) return true;
    if ((actual[index] ?? 0) < minimum[index]) return false;
  }
  return true;
};

const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      OPT_OUT_INSTRUMENTATION: "true",
      SHOPIFY_CLI_NO_ANALYTICS: "1",
    },
    ...options,
  });

const commandAvailable = (command, args = ["--version"]) => {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    env: process.env,
  });
  return !result.error && result.status === 0;
};

const fail = (message) => {
  console.error(`\n[shopify-toolkit] ${message}`);
  process.exit(1);
};

if (!versionAtLeast(parseVersion(process.versions.node), MIN_NODE)) {
  fail(
    `Node.js ${MIN_NODE.join(".")} or newer is required; found ${process.versions.node}.`,
  );
}

if (!commandAvailable("codex")) {
  fail(
    "Codex CLI is not installed or not available on PATH. Install/update Codex, then rerun this command.",
  );
}

const installCli = process.argv.includes("--install-cli");
if (!commandAvailable("shopify", ["version"])) {
  if (!installCli) {
    fail(
      "Shopify CLI is missing. Rerun with --install-cli or install @shopify/cli@latest globally.",
    );
  }

  console.log("[shopify-toolkit] Installing the latest Shopify CLI...");
  const installResult = run("npm", ["install", "-g", "@shopify/cli@latest"]);
  if (installResult.status !== 0) {
    fail("Shopify CLI installation failed.");
  }
}

console.log("[shopify-toolkit] Installing/updating the official Shopify Codex plugin...");
const pluginResult = spawnSync(
  "codex",
  ["plugin", "add", "shopify@openai-curated"],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      OPT_OUT_INSTRUMENTATION: "true",
      SHOPIFY_CLI_NO_ANALYTICS: "1",
    },
  },
);

const pluginOutput = `${pluginResult.stdout ?? ""}\n${pluginResult.stderr ?? ""}`;
if (
  pluginResult.status !== 0 &&
  !/already (installed|added|exists)|is already installed/i.test(pluginOutput)
) {
  process.stdout.write(pluginResult.stdout ?? "");
  process.stderr.write(pluginResult.stderr ?? "");
  fail("The Shopify Codex plugin could not be installed.");
}
process.stdout.write(pluginResult.stdout ?? "");
process.stderr.write(pluginResult.stderr ?? "");

const localEnvPath = resolve(".env.shopify.local");
if (!existsSync(localEnvPath)) {
  writeFileSync(
    localEnvPath,
    [
      "# Local MMG Shopify AI Toolkit settings. Never commit this file.",
      "OPT_OUT_INSTRUMENTATION=true",
      "SHOPIFY_CLI_NO_ANALYTICS=1",
      "MMG_SHOPIFY_ENVIRONMENT=development",
      "SHOPIFY_STORE_DOMAIN=",
      "MMG_SHOPIFY_MUTATION_APPROVED=0",
      "MMG_SHOPIFY_CHANGE_ID=",
      "MMG_SHOPIFY_ROLLBACK_PLAN=",
      "MMG_SHOPIFY_PRODUCTION_CONFIRMATION=",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log(`[shopify-toolkit] Created ${localEnvPath}.`);
} else {
  console.log(`[shopify-toolkit] Preserved existing ${localEnvPath}.`);
}

console.log("\n[shopify-toolkit] Installation complete.");
console.log(
  "[shopify-toolkit] Next: configure .env.shopify.local, authenticate a development store, and run npm run shopify:toolkit:doctor.",
);
