#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import process from "node:process";

const requiredFiles = [
  "scripts/mmg-commerce-apply-migrations.sh",
  "scripts/mmg-commerce-register-staging-release.sh",
  ".github/workflows/mmg-commerce-staging-integration.yml",
  "registry/deployment/mmg-commerce-staging-integration-contract-v1.json",
  "registry/deployment/mmg-commerce-staging-readiness-contract-v1.json",
];

const requiredSecrets = [
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
  "MMG_COMMERCE_ALERT_DESTINATIONS",
];

const checks = [];
const add = (code, critical, passed, summary, remediation = null, evidence = {}) => {
  checks.push({
    code,
    critical,
    status: passed ? "passed" : critical ? "failed" : "warning",
    summary,
    remediation: passed ? null : remediation,
    evidence,
  });
};

const environment = String(process.env.MMG_COMMERCE_ENVIRONMENT ?? "").trim();
const releaseId = String(process.env.MMG_COMMERCE_RELEASE_ID ?? "").trim();
const releaseCommitSha = String(
  process.env.MMG_COMMERCE_RELEASE_COMMIT_SHA ?? "",
).trim();
const expectedEnvironmentName = String(
  process.env.MMG_GITHUB_ENVIRONMENT_NAME ?? "",
).trim();

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
  add(
    `REPOSITORY_FILE:${file}`,
    true,
    existsSync(file),
    existsSync(file) ? `${file} is present.` : `${file} is missing.`,
    "Deploy the exact repository release containing every governed execution file.",
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

const missingSecrets = requiredSecrets.filter(
  (name) => String(process.env[name] ?? "").trim().length === 0,
);
add(
  "REQUIRED_SECRET_VALUES_PRESENT",
  true,
  missingSecrets.length === 0,
  missingSecrets.length === 0
    ? "All required protected staging values are present."
    : `${missingSecrets.length} required protected staging value(s) are missing.`,
  "Configure every required value in the mmg-commerce-staging GitHub Environment.",
  { missingSecretNames: missingSecrets.join(",") },
);

const tokens = [
  process.env.MMG_COMMERCE_STAGING_OPERATIONS_TOKEN,
  process.env.MMG_COMMERCE_STAGING_INTEGRATION_TOKEN,
  process.env.MMG_COMMERCE_STAGING_REHEARSAL_TOKEN,
  process.env.MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN,
  process.env.MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN,
].map((value) => String(value ?? "").trim());
add(
  "SERVER_CREDENTIAL_LENGTH",
  true,
  tokens.every((value) => value.length >= 32),
  "Every staging server credential is at least 32 characters.",
  "Generate strong credentials of at least 32 characters for every authority.",
);
add(
  "SERVER_CREDENTIAL_SEPARATION",
  true,
  tokens.every(Boolean) && new Set(tokens).size === tokens.length,
  "The five staging server credentials are mutually distinct.",
  "Use a separate credential for operations, integration, rehearsal, rehearsal adapter, and runtime control.",
);

const parseUrl = (value, allowedProtocols) => {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return allowedProtocols.includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
};
const databaseUrl = parseUrl(process.env.MMG_COMMERCE_STAGING_DATABASE_URL, [
  "postgres:",
  "postgresql:",
]);
const runtimeOrigin = parseUrl(process.env.MMG_COMMERCE_STAGING_RUNTIME_ORIGIN, [
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
  "Configure an HTTPS staging runtime origin.",
);

for (const name of [
  "MMG_COMMERCE_STAGING_READINESS_ENDPOINT",
  "MMG_COMMERCE_STAGING_INTEGRATION_ENDPOINT",
  "MMG_COMMERCE_REHEARSAL_ENDPOINT",
]) {
  const parsed = parseUrl(process.env[name], ["https:"]);
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

const alertEnvironment = String(
  process.env.MMG_COMMERCE_ALERT_ENVIRONMENT ?? "",
).trim();
add(
  "ALERT_ENVIRONMENT_STAGING",
  true,
  alertEnvironment === "staging",
  "Alert delivery is explicitly labeled staging.",
  "Set MMG_COMMERCE_ALERT_ENVIRONMENT=staging and use nonproduction destinations.",
);
const alertEntries = String(process.env.MMG_COMMERCE_ALERT_DESTINATIONS ?? "")
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
  const parsed = parseUrl(entry.slice(separator + 1).trim(), ["https:"]);
  if (!parsed) alertsHttps = false;
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

for (const [code, name] of [
  ["ADMIN_AUTH_DECLARED", "MMG_COMMERCE_ADMIN_AUTH_CONFIGURED"],
  ["SCHEDULER_DECLARED", "MMG_COMMERCE_SCHEDULER_CONFIGURED"],
  ["DISPATCHER_DECLARED", "MMG_COMMERCE_DISPATCHER_CONFIGURED"],
  ["STORAGE_SIGNER_DECLARED", "MMG_COMMERCE_STORAGE_SIGNER_CONFIGURED"],
]) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  add(
    code,
    true,
    value === "true",
    `${name} is explicitly confirmed.`,
    `Set ${name}=true only after the staging adapter is actually connected.`,
  );
}

const blockers = checks.filter(
  (entry) => entry.critical && entry.status !== "passed",
);
const warnings = checks.filter((entry) => entry.status === "warning");
const report = {
  schemaVersion: "1.0.0",
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
    githubEnvironmentConfigured:
      expectedEnvironmentName === "mmg-commerce-staging",
    requiredSecretNamesPresent: missingSecrets.length === 0,
  },
  publicationAllowed: false,
  liveCustomerDataAllowed: false,
  inspectedAt: new Date().toISOString(),
};

const outputPath = String(
  process.env.MMG_STAGING_READINESS_OUTPUT ??
    "mmg-commerce-staging-readiness-local.json",
).trim();
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
