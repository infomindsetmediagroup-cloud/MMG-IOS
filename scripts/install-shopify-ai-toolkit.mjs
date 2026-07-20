#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const minimum = [22, 12, 0];
const match = process.version.match(/v(\d+)\.(\d+)\.(\d+)/);
const actual = match ? match.slice(1).map(Number) : [0, 0, 0];
const acceptable = actual.some((value, index) => value > minimum[index] && actual.slice(0, index).every((prior, priorIndex) => prior === minimum[priorIndex])) || actual.every((value, index) => value === minimum[index]);

if (!acceptable) {
  console.error(`Node.js ${minimum.join(".")} or newer is required; found ${process.version}.`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    env: process.env,
    shell: process.platform === "win32",
  });
  return result;
}

const codexVersion = run("codex", ["--version"], { capture: true });
if (codexVersion.status !== 0) {
  console.error("Codex CLI is required before installing the Shopify plugin.");
  process.exit(1);
}
console.log(codexVersion.stdout?.trim() || codexVersion.stderr?.trim());

const cliInstall = run("npm", ["install", "-g", "@shopify/cli@latest"]);
if (cliInstall.status !== 0) process.exit(cliInstall.status ?? 1);

const pluginInstall = run("codex", ["plugin", "add", "shopify@openai-curated"], { capture: true });
const pluginOutput = `${pluginInstall.stdout ?? ""}${pluginInstall.stderr ?? ""}`.trim();
if (pluginInstall.status !== 0 && !/(already|exists|installed)/i.test(pluginOutput)) {
  console.error(pluginOutput || "Shopify Codex plugin installation failed.");
  process.exit(pluginInstall.status ?? 1);
}
if (pluginOutput) console.log(pluginOutput);

const shopifyVersion = run("shopify", ["version"], { capture: true });
if (shopifyVersion.status !== 0) {
  console.error(shopifyVersion.stderr || "Shopify CLI verification failed.");
  process.exit(shopifyVersion.status ?? 1);
}
console.log(shopifyVersion.stdout?.trim() || shopifyVersion.stderr?.trim());

console.log("\nShopify AI Toolkit installation completed.");
console.log("Persist these MMG privacy controls in the shell or secure environment manager:");
console.log("  export OPT_OUT_INSTRUMENTATION=true");
console.log("  export SHOPIFY_CLI_NO_ANALYTICS=1");
console.log("Then configure MMG_SHOPIFY_STAGING_STORE and run npm run shopify:toolkit:preflight.");
