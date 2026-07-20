#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIN_NODE = [22, 12, 0];
const LOCAL_ENV = resolve(".env.shopify.local");

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

const commandVersion = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || result.stderr || "").trim().split(/\r?\n/)[0];
};

loadLocalEnv();

const checks = [
  {
    name: "Node.js",
    required: true,
    ok: versionAtLeast(parseVersion(process.versions.node), MIN_NODE),
    detail: process.versions.node,
  },
  {
    name: "Codex CLI",
    required: true,
    detail: commandVersion("codex", ["--version"]),
  },
  {
    name: "Shopify CLI",
    required: true,
    detail: commandVersion("shopify", ["version"]),
  },
  {
    name: "Toolkit policy",
    required: true,
    ok: existsSync(resolve("shopify/ai-toolkit/policy.json")),
    detail: "shopify/ai-toolkit/policy.json",
  },
  {
    name: "Telemetry opt-out",
    required: true,
    ok:
      process.env.OPT_OUT_INSTRUMENTATION === "true" &&
      process.env.SHOPIFY_CLI_NO_ANALYTICS === "1",
    detail: "OPT_OUT_INSTRUMENTATION=true; SHOPIFY_CLI_NO_ANALYTICS=1",
  },
  {
    name: "Environment",
    required: true,
    ok: ["development", "staging", "production"].includes(
      process.env.MMG_SHOPIFY_ENVIRONMENT ?? "",
    ),
    detail: process.env.MMG_SHOPIFY_ENVIRONMENT || "not configured",
  },
  {
    name: "Store domain",
    required: false,
    ok: Boolean(process.env.SHOPIFY_STORE_DOMAIN),
    detail: process.env.SHOPIFY_STORE_DOMAIN || "not configured",
  },
];

for (const check of checks) {
  if (check.ok === undefined) check.ok = Boolean(check.detail);
}

const width = Math.max(...checks.map((check) => check.name.length));
for (const check of checks) {
  const status = check.ok ? "PASS" : check.required ? "FAIL" : "WARN";
  console.log(
    `${status.padEnd(4)}  ${check.name.padEnd(width)}  ${check.detail ?? ""}`,
  );
}

const failed = checks.filter((check) => check.required && !check.ok);
if (failed.length > 0) {
  console.error(
    "\n[shopify-toolkit] Doctor found required setup failures. Run npm run shopify:toolkit:install -- --install-cli and configure .env.shopify.local.",
  );
  process.exit(1);
}

console.log("\n[shopify-toolkit] Core tooling and governance checks passed.");
