#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import process from "node:process";

const requiredFiles = [
  "scripts/mmg-commerce-apply-migrations.sh",
  "scripts/mmg-commerce-register-staging-release.sh",
  "scripts/mmg-build-commerce-staging-wrangler.mjs",
  ".github/workflows/mmg-commerce-staging-integration.yml",
  ".github/workflows/mmg-commerce-staging-runtime-deploy.yml",
  "cloudflare/mmg-commerce-staging-worker.ts",
  "server/runtime/cloudflare-commerce-staging-host.ts",
  "server/runtime/cloudflare-hyperdrive-postgres.ts",
  "registry/deployment/mmg-commerce-staging-integration-contract-v1.json",
  "registry/deployment/mmg-commerce-staging-readiness-contract-v1.json",
  "registry/deployment/mmg-commerce-staging-host-runtime-contract-v1.json",
];

const requiredProtectedValues = [
  "MMG_COMMERCE_STAGING_DATABASE_URL",
  "MMG_COMMERCE_STAGING_RUNTIME_ORIGIN",
  "MMG_COMMERCE_STAGING_READINESS_ENDPOINT",
  "MMG_COMMERCE_STAGING_INTEGRATION_ENDPOINT",
  "MMG_COMMERCE_REHEARSAL_ENDPOINT",
  "MMG_COMMERCE_STAGING_OPERATIONS_TOKEN",
  "MMG_COMMERCE_STAGING_INTEGRATION_TOKEN",
  "MMG_COMMERCE_STAGING_REHEARSAL_TOKEN",
  "MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN",
  "MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN",
  "MMG_COMMERCE_STAGING_ADMIN_DASHBOARD_TOKEN",
  "MMG_COMMERCE_STAGING_PROVIDER_HEALTH_TOKEN",
  "MMG_COMMERCE_ALERT_DESTINATIONS",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "MMG_CLOUDFLARE_STAGING_HYPERDRIVE_ID",
  "MMG_CLOUDFLARE_STAGING_UPSTREAM_SERVICE",
  "MMG_COMMERCE_ALERT_HEALTH_ENDPOINT",
  "MMG_COMMERCE_SCHEDULER_HEALTH_ENDPOINT",
  "MMG_COMMERCE_DISPATCHER_HEALTH_ENDPOINT",
  "MMG_COMMERCE_STORAGE_SIGNER_HEALTH_ENDPOINT",
];

const checks = [];
const add = (
  code,
  critical,
  passed,
  summary,
  remediation = null,
  evidence = {},
) => {
  checks.push({
    code,
    critical,
    status: passed ? "passed" : critical ? "failed" : "warning",
    summary,
    remediation: passed ? null : remediation,
    evidence,
  });
};

const value = (name) => String(process.env[name] ?? "").trim();
const environment = value("MMG_COMMERCE_ENVIRONMENT");
const releaseId = value("MMG_COMMERCE_RELEASE_ID");
const releaseCommitSha = value("MMG_COMMERCE_RELEASE_COMMIT_SHA");
const expectedEnvironmentName = value("MMG_GITHUB_ENVIRONMENT_NAME");

add(
  "ENVIRONMENT_STAGING_ONLY",
  true,
  environment === "staging",
  environment === "staging"
    ? "The execution environment is staging."
    : "The execution environment is not staging.",
  "Set MMG_COMMERCE_ENVIRONMENT=staging.",
  { environment },
);
add(
  "GITHUB_ENVIRONMENT_NAME",
  true,
  expectedEnvironmentName === "mmg-commerce-staging",
  expectedEnvironmentName === "mmg-commerce-staging"
    ? "The protected GitHub Environment name is correct."
    : "The protected GitHub Environment name is missing or incorrect.",
  "Run this workflow through the mmg-commerce-staging GitHub Environment.",
  { environmentName: expectedEnvironmentName || null },
);
add(
  "RELEASE_ID_VALID",
  true,
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(releaseId),
  "The immutable staging release ID is syntactically valid.",
  "Provide an immutable release ID between 8 and 128 characters.",
);
add(
  "RELEASE_COMMIT_VALID",
  true,
  /^[a-f0-9]{40}$/.test(releaseCommitSha),
  "The release commit is a full 40-character SHA.",
  "Provide the exact lowercase 40-character release commit SHA.",
);

let checkedOutSha = null;
try {
  checkedOutSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  checkedOutSha = null;
}
add(
  "EXACT_COMMIT_CHECKED_OUT",
  true,
  Boolean(checkedOutSha && checkedOutSha === releaseCommitSha),
  checkedOutSha === releaseCommitSha
    ? "The exact release commit is checked out."
    : "The checked-out commit does not match the requested release.",
  "Check out the exact release commit before inspecting readiness.",
  { checkedOutSha },
);

for (const file of requiredFiles) {
  const present = existsSync(file);
  add(
    `REPOSITORY_FILE:${file}`,
    true,
    present,
    present ? `${file} is present.` : `${file} is missing.`,
    "Deploy the exact repository release containing every governed staging host file.",
  );
}

const commandAvailable = (command) => {
  try {
    execFileSync("bash", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const psqlAvailable = commandAvailable("psql");
const sha256ToolAvailable = commandAvailable("sha256sum");
add(
  "NODE_VERSION_SUPPORTED",
  true,
  Number(process.versions.node.split(".")[0]) >= 22,
  "Node.js 22 or newer is available.",
  "Use the governed Node.js 22 staging runner.",
  { nodeMajor: Number(process.versions.node.split(".")[0]) },
);
add(
  "PSQL_AVAILABLE",
  true,
  psqlAvailable,
  psqlAvailable ? "psql is available." : "psql is unavailable.",
  "Install the PostgreSQL client on the protected staging runner.",
);
add(
  "SHA256_TOOL_AVAILABLE",
  true,
  sha256ToolAvailable,
  sha256ToolAvailable ? "sha256sum is available." : "sha256sum is unavailable.",
  "Install a compatible SHA-256 command on the protected staging runner.",
);

const missingProtectedValues = requiredProtectedValues.filter(
  (name) => value(name).length === 0,
);
add(
  "REQUIRED_PROTECTED_VALUES_PRESENT",
  true,
  missingProtectedValues.length === 0,
  missingProtectedValues.length === 0
    ? "All required protected staging values are present."
    : `${missingProtectedValues.length} required protected staging value(s) are missing.`,
  "Configure every required value in the mmg-commerce-staging GitHub Environment.",
  { missingProtectedValueNames: missingProtectedValues.join(",") },
);

const authorityCredentialNames = [
  "MMG_COMMERCE_STAGING_OPERATIONS_TOKEN",
  "MMG_COMMERCE_STAGING_INTEGRATION_TOKEN",
  "MMG_COMMERCE_STAGING_REHEARSAL_TOKEN",
  "MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN",
  "MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN",
  "MMG_COMMERCE_STAGING_ADMIN_DASHBOARD_TOKEN",
  "MMG_COMMERCE_STAGING_PROVIDER_HEALTH_TOKEN",
];
const authorityCredentials = authorityCredentialNames.map(value);
add(
  "AUTHORITY_CREDENTIAL_LENGTH",
  true,
  authorityCredentials.every((credential) => credential.length >= 32),
  "Every staging authority credential is at least 32 characters.",
  "Generate strong credentials of at least 32 characters for every authority.",
);
add(
  "AUTHORITY_CREDENTIAL_SEPARATION",
  true,
  authorityCredentials.every(Boolean) &&
    new Set(authorityCredentials).size === authorityCredentials.length,
  "Operations, integration, rehearsal, adapter, runtime-control, Admin, and provider credentials are mutually distinct.",
  "Use a separate credential for every staging authority boundary.",
  { credentialCount: authorityCredentials.length },
);

const parseUrl = (raw, allowedProtocols) => {
  try {
    const parsed = new URL(String(raw ?? "").trim());
    return allowedProtocols.includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
};
const databaseUrl = parseUrl(value("MMG_COMMERCE_STAGING_DATABASE_URL"), [
  "postgres:",
  "postgresql:",
]);
const runtimeOrigin = parseUrl(value("MMG_COMMERCE_STAGING_RUNTIME_ORIGIN"), [
  "https:",
]);
add(
  "DATABASE_URL_VALID",
  true,
  Boolean(databaseUrl),
  "The staging database URL uses PostgreSQL.",
  "Configure a dedicated PostgreSQL staging database URL.",
);
add(
  "RUNTIME_ORIGIN_HTTPS",
  true,
  Boolean(runtimeOrigin),
  "The staging runtime origin uses HTTPS.",
  "Configure the isolated Cloudflare staging Worker HTTPS origin.",
);

for (const name of [
  "MMG_COMMERCE_STAGING_READINESS_ENDPOINT",
  "MMG_COMMERCE_STAGING_INTEGRATION_ENDPOINT",
  "MMG_COMMERCE_REHEARSAL_ENDPOINT",
]) {
  const parsed = parseUrl(value(name), ["https:"]);
  const sameOrigin = Boolean(
    parsed && runtimeOrigin && parsed.origin === runtimeOrigin.origin,
  );
  add(
    `ENDPOINT_SAME_ORIGIN:${name}`,
    true,
    sameOrigin,
    sameOrigin
      ? `${name} belongs to the staging runtime origin.`
      : `${name} is missing, not HTTPS, or belongs to another origin.`,
    "Configure the protected endpoint under the exact staging runtime origin.",
  );
}

const cloudflareAccountId = value("CLOUDFLARE_ACCOUNT_ID");
const hyperdriveId = value("MMG_CLOUDFLARE_STAGING_HYPERDRIVE_ID");
const upstreamService = value("MMG_CLOUDFLARE_STAGING_UPSTREAM_SERVICE");
add(
  "CLOUDFLARE_ACCOUNT_CONFIGURED",
  true,
  cloudflareAccountId.length >= 16 && value("CLOUDFLARE_API_TOKEN").length >= 20,
  "The protected Cloudflare account and API credential are configured.",
  "Configure a least-privilege Cloudflare API token and account ID.",
);
add(
  "HYPERDRIVE_BINDING_CONFIGURED",
  true,
  /^[a-f0-9-]{32,64}$/i.test(hyperdriveId),
  "The staging Hyperdrive binding ID is configured.",
  "Create a Hyperdrive configuration for the isolated PostgreSQL database and store its ID.",
);
add(
  "STAGING_UPSTREAM_SERVICE_CONFIGURED",
  true,
  /^[a-z0-9][a-z0-9-]{1,62}-staging$/i.test(upstreamService),
  "The commerce host is bound to an isolated staging upstream service.",
  "Deploy the commerce API upstream as a staging-only Worker and configure its service name ending in -staging.",
  { configured: Boolean(upstreamService) },
);

const alertEnvironment = value("MMG_COMMERCE_ALERT_ENVIRONMENT");
add(
  "ALERT_ENVIRONMENT_STAGING",
  true,
  alertEnvironment === "staging",
  "Alert delivery is explicitly labeled staging.",
  "Set MMG_COMMERCE_ALERT_ENVIRONMENT=staging and use nonproduction destinations.",
);
const alertEntries = value("MMG_COMMERCE_ALERT_DESTINATIONS")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const alertChannels = new Set();
let alertsHttps = alertEntries.length > 0;
for (const entry of alertEntries) {
  const separator = entry.indexOf("=");
  if (separator < 1) {
    alertsHttps = false;
    continue;
  }
  alertChannels.add(entry.slice(0, separator).trim());
  if (!parseUrl(entry.slice(separator + 1).trim(), ["https:"])) {
    alertsHttps = false;
  }
}
const requiredAlertChannels = [
  "on_call_pager",
  "operations_email",
  "operations_chat",
];
add(
  "ALERT_CHANNELS_PRESENT",
  true,
  requiredAlertChannels.every((channel) => alertChannels.has(channel)),
  "Required staging alert channels are configured.",
  "Configure on_call_pager, operations_email, and operations_chat HTTPS destinations.",
);
add(
  "ALERT_DESTINATIONS_HTTPS",
  true,
  alertsHttps,
  "Every configured alert destination uses HTTPS.",
  "Replace non-HTTPS alert destinations.",
);

const providerEndpointNames = [
  "MMG_COMMERCE_ALERT_HEALTH_ENDPOINT",
  "MMG_COMMERCE_SCHEDULER_HEALTH_ENDPOINT",
  "MMG_COMMERCE_DISPATCHER_HEALTH_ENDPOINT",
  "MMG_COMMERCE_STORAGE_SIGNER_HEALTH_ENDPOINT",
];
for (const name of providerEndpointNames) {
  const parsed = parseUrl(value(name), ["https:"]);
  add(
    `PROVIDER_HEALTH_ENDPOINT:${name}`,
    true,
    Boolean(parsed),
    parsed
      ? `${name} is configured through HTTPS.`
      : `${name} is missing or not HTTPS.`,
    "Deploy the staging provider health endpoint and configure its HTTPS URL.",
  );
}

for (const [code, name] of [
  ["ADMIN_AUTH_DECLARED", "MMG_COMMERCE_ADMIN_AUTH_CONFIGURED"],
  ["SCHEDULER_DECLARED", "MMG_COMMERCE_SCHEDULER_CONFIGURED"],
  ["DISPATCHER_DECLARED", "MMG_COMMERCE_DISPATCHER_CONFIGURED"],
  ["STORAGE_SIGNER_DECLARED", "MMG_COMMERCE_STORAGE_SIGNER_CONFIGURED"],
]) {
  const declared = value(name).toLowerCase() === "true";
  add(
    code,
    true,
    declared,
    declared ? `${name} is explicitly confirmed.` : `${name} is not confirmed.`,
    `Set ${name}=true only after the staging adapter is actually connected.`,
  );
}

const blockers = checks.filter(
  (entry) => entry.critical && entry.status !== "passed",
);
const warnings = checks.filter((entry) => entry.status === "warning");
const report = {
  schemaVersion: "1.1.0",
  environment: "staging",
  releaseId,
  releaseCommitSha,
  status: blockers.length === 0 ? "ready" : "blocked",
  ready: blockers.length === 0,
  blockerCount: blockers.length,
  warningCount: warnings.length,
  checks,
  evidence: {
    nodeMajor: Number(process.versions.node.split(".")[0]),
    psqlAvailable,
    sha256ToolAvailable,
    migrationRunnerPresent: existsSync("scripts/mmg-commerce-apply-migrations.sh"),
    releaseRegistrationPresent: existsSync(
      "scripts/mmg-commerce-register-staging-release.sh",
    ),
    workflowPresent: existsSync(
      ".github/workflows/mmg-commerce-staging-integration.yml",
    ),
    stagingHostWorkflowPresent: existsSync(
      ".github/workflows/mmg-commerce-staging-runtime-deploy.yml",
    ),
    stagingHostSourcePresent: existsSync(
      "server/runtime/cloudflare-commerce-staging-host.ts",
    ),
    githubEnvironmentConfigured:
      expectedEnvironmentName === "mmg-commerce-staging",
    requiredSecretNamesPresent: missingProtectedValues.length === 0,
    cloudflareConfigured:
      cloudflareAccountId.length >= 16 &&
      value("CLOUDFLARE_API_TOKEN").length >= 20,
    hyperdriveConfigured: /^[a-f0-9-]{32,64}$/i.test(hyperdriveId),
    upstreamServiceConfigured:
      /^[a-z0-9][a-z0-9-]{1,62}-staging$/i.test(upstreamService),
    providerHealthEndpointsConfigured: providerEndpointNames.every((name) =>
      Boolean(parseUrl(value(name), ["https:"])),
    ),
  },
  publicationAllowed: false,
  liveCustomerDataAllowed: false,
  inspectedAt: new Date().toISOString(),
};

const outputPath = value("MMG_STAGING_READINESS_OUTPUT") ||
  "mmg-commerce-staging-readiness-local.json";
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(
  JSON.stringify({
    status: report.status,
    blockerCount: report.blockerCount,
    warningCount: report.warningCount,
    outputPath,
  }),
);
if (!report.ready) process.exitCode = 1;
