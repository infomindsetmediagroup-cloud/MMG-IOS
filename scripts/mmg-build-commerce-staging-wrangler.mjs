#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const required = (name) => {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`MMG_STAGING_WRANGLER_REQUIRED:${name}`);
  return value;
};

const optional = (name, fallback = "") =>
  String(process.env[name] ?? fallback).trim();

const releaseId = required("MMG_COMMERCE_RELEASE_ID");
if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(releaseId)) {
  throw new Error("MMG_STAGING_WRANGLER_RELEASE_ID_INVALID");
}

const releaseCommitSha = required("MMG_COMMERCE_RELEASE_COMMIT_SHA");
if (!/^[a-f0-9]{40}$/.test(releaseCommitSha)) {
  throw new Error("MMG_STAGING_WRANGLER_COMMIT_SHA_INVALID");
}

const runtimeOrigin = required("MMG_COMMERCE_STAGING_RUNTIME_ORIGIN");
const parsedOrigin = new URL(runtimeOrigin);
if (parsedOrigin.protocol !== "https:") {
  throw new Error("MMG_STAGING_WRANGLER_RUNTIME_HTTPS_REQUIRED");
}
parsedOrigin.pathname = "/";
parsedOrigin.search = "";
parsedOrigin.hash = "";

const hyperdriveId = required("MMG_CLOUDFLARE_STAGING_HYPERDRIVE_ID");
if (!/^[a-f0-9-]{32,64}$/i.test(hyperdriveId)) {
  throw new Error("MMG_STAGING_WRANGLER_HYPERDRIVE_ID_INVALID");
}

const timeout = Number(optional("MMG_COMMERCE_REQUEST_TIMEOUT_MS", "8000"));
if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) {
  throw new Error("MMG_STAGING_WRANGLER_TIMEOUT_INVALID");
}

const boolean = (name, fallback) => {
  const value = optional(name, fallback ? "true" : "false");
  if (value !== "true" && value !== "false") {
    throw new Error(`MMG_STAGING_WRANGLER_BOOLEAN_INVALID:${name}`);
  }
  return value;
};

const providerEndpoints = {
  MMG_COMMERCE_ALERT_HEALTH_ENDPOINT: optional(
    "MMG_COMMERCE_ALERT_HEALTH_ENDPOINT",
  ),
  MMG_COMMERCE_SCHEDULER_HEALTH_ENDPOINT: optional(
    "MMG_COMMERCE_SCHEDULER_HEALTH_ENDPOINT",
  ),
  MMG_COMMERCE_DISPATCHER_HEALTH_ENDPOINT: optional(
    "MMG_COMMERCE_DISPATCHER_HEALTH_ENDPOINT",
  ),
  MMG_COMMERCE_STORAGE_SIGNER_HEALTH_ENDPOINT: optional(
    "MMG_COMMERCE_STORAGE_SIGNER_HEALTH_ENDPOINT",
  ),
};

for (const [name, value] of Object.entries(providerEndpoints)) {
  if (!value) continue;
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error(`MMG_STAGING_WRANGLER_PROVIDER_HTTPS_REQUIRED:${name}`);
  }
}

const secretNames = [
  "MMG_COMMERCE_STAGING_OPERATIONS_TOKEN",
  "MMG_COMMERCE_STAGING_REHEARSAL_TOKEN",
  "MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN",
  "MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN",
  "MMG_COMMERCE_STAGING_INTEGRATION_TOKEN",
  "MMG_COMMERCE_STAGING_ADMIN_DASHBOARD_TOKEN",
  "MMG_COMMERCE_STAGING_PROVIDER_HEALTH_TOKEN",
  "MMG_COMMERCE_ALERT_DESTINATIONS",
];

const config = {
  $schema: "../../node_modules/wrangler/config-schema.json",
  name: "mmg-commerce-staging",
  main: "../../cloudflare/mmg-commerce-staging-worker.ts",
  compatibility_date: "2026-07-21",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  preview_urls: true,
  observability: {
    enabled: true,
    head_sampling_rate: 1,
  },
  hyperdrive: [
    {
      binding: "HYPERDRIVE",
      id: hyperdriveId,
    },
  ],
  vars: {
    MMG_COMMERCE_ENVIRONMENT: "staging",
    MMG_COMMERCE_RELEASE_ID: releaseId,
    MMG_COMMERCE_RELEASE_COMMIT_SHA: releaseCommitSha,
    MMG_COMMERCE_RUNTIME_ORIGIN: parsedOrigin.toString().replace(/\/$/, ""),
    MMG_COMMERCE_REQUEST_TIMEOUT_MS: String(timeout),
    MMG_COMMERCE_ROUTE_PROBE_PATHS: optional(
      "MMG_COMMERCE_ROUTE_PROBE_PATHS",
    ),
    MMG_COMMERCE_MONITOR_ENABLED: boolean(
      "MMG_COMMERCE_MONITOR_ENABLED",
      false,
    ),
    ...providerEndpoints,
  },
  secrets: {
    required: secretNames,
  },
  triggers: {
    crons: ["*/15 * * * *"],
  },
};

const output = path.resolve(
  optional(
    "MMG_STAGING_WRANGLER_OUTPUT",
    "dist/mmg-commerce-staging/wrangler.jsonc",
  ),
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

const summaryPath = path.join(path.dirname(output), "deployment-summary.json");
await writeFile(
  summaryPath,
  `${JSON.stringify(
    {
      schemaVersion: "1.0.0",
      environment: "staging",
      workerName: config.name,
      releaseId,
      releaseCommitSha,
      runtimeOrigin: config.vars.MMG_COMMERCE_RUNTIME_ORIGIN,
      hyperdriveConfigured: true,
      secretNames,
      providerHealthEndpointsConfigured: Object.fromEntries(
        Object.entries(providerEndpoints).map(([name, value]) => [
          name,
          Boolean(value),
        ]),
      ),
      monitorEnabled: config.vars.MMG_COMMERCE_MONITOR_ENABLED === "true",
      publicationAllowed: false,
      liveCustomerDataAllowed: false,
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", mode: 0o600 },
);

console.log(
  JSON.stringify({
    ok: true,
    output,
    summaryPath,
    workerName: config.name,
    releaseId,
    releaseCommitSha,
    secretCount: secretNames.length,
    publicationAllowed: false,
    liveCustomerDataAllowed: false,
  }),
);
