import type {
  MMGCommerceControlCode,
  MMGCommerceControlMode,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";
import {
  MMG_REQUIRED_STAGING_ADAPTERS,
  MMG_REQUIRED_STAGING_MIGRATIONS,
} from "./staging-integration-service.js";

export const MMG_STAGING_READINESS_VERSION = "1.0.0" as const;

export type MMGStagingReadinessStatus =
  | "passed"
  | "failed"
  | "warning"
  | "unknown"
  | "not_applicable";

export type MMGStagingReadinessCategory =
  | "release"
  | "configuration"
  | "database"
  | "runtime"
  | "providers"
  | "safety"
  | "workflow";

export interface MMGStagingReadinessCheck {
  code: string;
  category: MMGStagingReadinessCategory;
  critical: boolean;
  status: MMGStagingReadinessStatus;
  summary: string;
  remediation: string | null;
  evidence: Record<string, string | number | boolean | null>;
}

export interface MMGStagingReadinessRouteResult {
  path: string;
  method: "GET" | "HEAD" | "OPTIONS";
  statusCode: number | null;
  reachable: boolean;
  latencyMs: number | null;
  errorCode: string | null;
}

export interface MMGStagingReadinessHeartbeat {
  adapterCode: string;
  status: "healthy" | "degraded" | "unavailable" | "unknown";
  releaseId: string | null;
  observedAt: string;
}

export interface MMGStagingReadinessSnapshot {
  schemaVersion: typeof MMG_STAGING_READINESS_VERSION;
  environment: "staging";
  releaseId: string;
  releaseCommitSha: string;
  configuredReleaseId: string | null;
  configuredReleaseCommitSha: string | null;
  runtimeOrigin: string | null;
  database: {
    reachable: boolean;
    serverVersion: string | null;
    pgcryptoAvailable: boolean | null;
    migrationLedgerAvailable: boolean;
    appliedMigrationIds: string[];
  };
  credentials: {
    operationsConfigured: boolean;
    integrationConfigured: boolean;
    rehearsalConfigured: boolean;
    rehearsalAdapterConfigured: boolean;
    runtimeControlConfigured: boolean;
    adminAuthenticationConfigured: boolean;
    distinctServerCredentials: boolean;
  };
  alerts: {
    configuredChannels: string[];
    requiredChannels: string[];
    destinationsUseHttps: boolean;
    destinationsAppearNonProduction: boolean;
  };
  routes: MMGStagingReadinessRouteResult[];
  heartbeats: MMGStagingReadinessHeartbeat[];
  controls: Partial<Record<MMGCommerceControlCode, MMGCommerceControlMode>>;
  rollout: {
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
  } | null;
  tooling: {
    nodeMajor: number | null;
    psqlAvailable: boolean | null;
    sha256ToolAvailable: boolean | null;
    migrationRunnerPresent: boolean;
    releaseRegistrationPresent: boolean;
    workflowPresent: boolean;
  };
  githubEnvironment: {
    configured: boolean | null;
    requiredSecretNamesPresent: boolean | null;
  };
  publicationAllowed: false;
  liveCustomerDataAllowed: false;
  inspectedAt: string;
}

export interface MMGStagingReadinessReport {
  schemaVersion: typeof MMG_STAGING_READINESS_VERSION;
  environment: "staging";
  releaseId: string;
  releaseCommitSha: string;
  status: "ready" | "blocked";
  ready: boolean;
  blockerCount: number;
  warningCount: number;
  checks: MMGStagingReadinessCheck[];
  inspectedAt: string;
  publicationAllowed: false;
  liveCustomerDataAllowed: false;
}

const SAFE_CONTROLS: Record<MMGCommerceControlCode, MMGCommerceControlMode> = {
  product_publication: "disabled",
  subscription_checkout: "disabled",
  webhook_ingestion: "enabled",
  delivery_scheduler: "disabled",
  delivery_dispatcher: "disabled",
  recommendation_automation: "observe_only",
  signed_library_access: "disabled",
  thank_you_handoff: "observe_only",
};

const REQUIRED_ALERT_CHANNELS = Object.freeze([
  "on_call_pager",
  "operations_email",
  "operations_chat",
]);

const freshnessMs = 15 * 60 * 1000;

const check = (
  value: Omit<MMGStagingReadinessCheck, "evidence"> & {
    evidence?: MMGStagingReadinessCheck["evidence"];
  },
): MMGStagingReadinessCheck => ({ ...value, evidence: value.evidence ?? {} });

const validDate = (value: string): number | null => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const routeCheck = (
  route: MMGStagingReadinessRouteResult,
): MMGStagingReadinessCheck =>
  check({
    code: `RUNTIME_ROUTE:${route.path}`,
    category: "runtime",
    critical: true,
    status: route.reachable ? "passed" : "failed",
    summary: route.reachable
      ? `The ${route.path} route is reachable.`
      : `The ${route.path} route is unavailable.`,
    remediation: route.reachable
      ? null
      : "Deploy and mount the route, then repeat the readiness inspection.",
    evidence: {
      method: route.method,
      statusCode: route.statusCode,
      latencyMs: route.latencyMs,
      errorCode: route.errorCode,
    },
  });

export const evaluateMMGStagingReadiness = (
  snapshot: MMGStagingReadinessSnapshot,
): MMGStagingReadinessReport => {
  const checks: MMGStagingReadinessCheck[] = [];
  const inspectedAtMs = validDate(snapshot.inspectedAt);

  checks.push(
    check({
      code: "ENVIRONMENT_STAGING_ONLY",
      category: "configuration",
      critical: true,
      status: snapshot.environment === "staging" ? "passed" : "failed",
      summary: "The readiness inspector is restricted to staging.",
      remediation:
        snapshot.environment === "staging"
          ? null
          : "Use a dedicated staging environment. Production is not accepted by this inspector.",
      evidence: { environment: snapshot.environment },
    }),
    check({
      code: "RELEASE_ID_MATCH",
      category: "release",
      critical: true,
      status:
        snapshot.configuredReleaseId === snapshot.releaseId ? "passed" : "failed",
      summary:
        snapshot.configuredReleaseId === snapshot.releaseId
          ? "The runtime release ID matches the requested release."
          : "The runtime release ID does not match the requested release.",
      remediation:
        snapshot.configuredReleaseId === snapshot.releaseId
          ? null
          : "Deploy or configure the exact requested release before execution.",
      evidence: {
        requestedReleaseId: snapshot.releaseId,
        configuredReleaseId: snapshot.configuredReleaseId,
      },
    }),
    check({
      code: "RELEASE_COMMIT_MATCH",
      category: "release",
      critical: true,
      status:
        snapshot.configuredReleaseCommitSha === snapshot.releaseCommitSha
          ? "passed"
          : "failed",
      summary:
        snapshot.configuredReleaseCommitSha === snapshot.releaseCommitSha
          ? "The runtime commit matches the immutable requested commit."
          : "The runtime commit does not match the immutable requested commit.",
      remediation:
        snapshot.configuredReleaseCommitSha === snapshot.releaseCommitSha
          ? null
          : "Deploy the exact 40-character release commit and repeat inspection.",
      evidence: {
        requestedCommitSha: snapshot.releaseCommitSha,
        configuredCommitSha: snapshot.configuredReleaseCommitSha,
      },
    }),
    check({
      code: "RUNTIME_ORIGIN_HTTPS",
      category: "configuration",
      critical: true,
      status:
        snapshot.runtimeOrigin?.startsWith("https://") === true ? "passed" : "failed",
      summary:
        snapshot.runtimeOrigin?.startsWith("https://") === true
          ? "The staging runtime origin uses HTTPS."
          : "The staging runtime origin is missing or not HTTPS.",
      remediation:
        snapshot.runtimeOrigin?.startsWith("https://") === true
          ? null
          : "Configure a dedicated HTTPS staging runtime origin.",
      evidence: { runtimeOriginConfigured: Boolean(snapshot.runtimeOrigin) },
    }),
  );

  const credentialEntries = Object.entries(snapshot.credentials).filter(
    ([key]) => key !== "distinctServerCredentials" && key !== "adminAuthenticationConfigured",
  );
  checks.push(
    check({
      code: "SERVER_CREDENTIALS_CONFIGURED",
      category: "configuration",
      critical: true,
      status: credentialEntries.every(([, value]) => value) ? "passed" : "failed",
      summary: credentialEntries.every(([, value]) => value)
        ? "All five staging server credentials are configured."
        : "One or more staging server credentials are missing.",
      remediation: credentialEntries.every(([, value]) => value)
        ? null
        : "Configure operations, integration, rehearsal, rehearsal-adapter, and runtime-control credentials in the protected environment.",
      evidence: Object.fromEntries(credentialEntries),
    }),
    check({
      code: "SERVER_CREDENTIALS_DISTINCT",
      category: "configuration",
      critical: true,
      status: snapshot.credentials.distinctServerCredentials ? "passed" : "failed",
      summary: snapshot.credentials.distinctServerCredentials
        ? "The five server credentials are mutually distinct."
        : "The staging server credentials are not mutually distinct.",
      remediation: snapshot.credentials.distinctServerCredentials
        ? null
        : "Generate separate credentials for every authority boundary.",
    }),
    check({
      code: "ADMIN_AUTH_CONFIGURED",
      category: "configuration",
      critical: true,
      status: snapshot.credentials.adminAuthenticationConfigured
        ? "passed"
        : "failed",
      summary: snapshot.credentials.adminAuthenticationConfigured
        ? "Separate Admin Portal operator authentication is configured."
        : "Admin Portal operator authentication is not configured.",
      remediation: snapshot.credentials.adminAuthenticationConfigured
        ? null
        : "Connect the Admin Portal to a separate authenticated operator-session provider.",
    }),
  );

  checks.push(
    check({
      code: "DATABASE_REACHABLE",
      category: "database",
      critical: true,
      status: snapshot.database.reachable ? "passed" : "failed",
      summary: snapshot.database.reachable
        ? "The staging PostgreSQL database is reachable."
        : "The staging PostgreSQL database is unreachable.",
      remediation: snapshot.database.reachable
        ? null
        : "Provision or reconnect the isolated staging PostgreSQL database.",
      evidence: { serverVersion: snapshot.database.serverVersion },
    }),
    check({
      code: "PGCRYPTO_AVAILABLE",
      category: "database",
      critical: true,
      status:
        snapshot.database.pgcryptoAvailable === true
          ? "passed"
          : snapshot.database.pgcryptoAvailable === false
            ? "failed"
            : "unknown",
      summary:
        snapshot.database.pgcryptoAvailable === true
          ? "PostgreSQL pgcrypto is available."
          : "PostgreSQL pgcrypto availability has not been confirmed.",
      remediation:
        snapshot.database.pgcryptoAvailable === true
          ? null
          : "Enable pgcrypto before applying the commerce migrations or running rights-digest verification.",
    }),
    check({
      code: "MIGRATION_LEDGER_AVAILABLE",
      category: "database",
      critical: false,
      status: snapshot.database.migrationLedgerAvailable ? "passed" : "warning",
      summary: snapshot.database.migrationLedgerAvailable
        ? "The staging migration ledger is available."
        : "The staging migration ledger has not been created yet.",
      remediation: snapshot.database.migrationLedgerAvailable
        ? null
        : "Run the controlled execute action to initialize and reconcile migrations 001–011.",
    }),
  );

  const applied = new Set(snapshot.database.appliedMigrationIds);
  const missingMigrations = MMG_REQUIRED_STAGING_MIGRATIONS.filter(
    (migration) => !applied.has(migration),
  );
  checks.push(
    check({
      code: "MIGRATIONS_RECONCILED",
      category: "database",
      critical: false,
      status: missingMigrations.length === 0 ? "passed" : "warning",
      summary:
        missingMigrations.length === 0
          ? "All staging commerce migrations are reconciled."
          : `${missingMigrations.length} staging migration(s) remain unapplied.`,
      remediation:
        missingMigrations.length === 0
          ? null
          : "Run the execute action with the exact release commit before rehearsal.",
      evidence: {
        appliedCount: snapshot.database.appliedMigrationIds.length,
        requiredCount: MMG_REQUIRED_STAGING_MIGRATIONS.length,
        missing: missingMigrations.join(","),
      },
    }),
  );

  checks.push(...snapshot.routes.map(routeCheck));

  const heartbeatMap = new Map(
    snapshot.heartbeats.map((heartbeat) => [heartbeat.adapterCode, heartbeat]),
  );
  for (const adapterCode of MMG_REQUIRED_STAGING_ADAPTERS) {
    const heartbeat = heartbeatMap.get(adapterCode);
    const observedAt = heartbeat ? validDate(heartbeat.observedAt) : null;
    const fresh =
      observedAt !== null &&
      inspectedAtMs !== null &&
      observedAt <= inspectedAtMs &&
      inspectedAtMs - observedAt <= freshnessMs;
    const passed =
      heartbeat?.status === "healthy" &&
      heartbeat.releaseId === snapshot.releaseId &&
      fresh;
    checks.push(
      check({
        code: `ADAPTER_READY:${adapterCode}`,
        category: "providers",
        critical: true,
        status: passed ? "passed" : heartbeat ? "failed" : "unknown",
        summary: passed
          ? `The ${adapterCode} adapter is healthy, fresh, and release-bound.`
          : `The ${adapterCode} adapter is missing, stale, unhealthy, or bound to another release.`,
        remediation: passed
          ? null
          : `Connect the ${adapterCode} adapter and record a fresh healthy heartbeat for this release.`,
        evidence: {
          status: heartbeat?.status ?? null,
          releaseId: heartbeat?.releaseId ?? null,
          observedAt: heartbeat?.observedAt ?? null,
          fresh,
        },
      }),
    );
  }

  const configuredAlerts = new Set(snapshot.alerts.configuredChannels);
  const requiredAlerts =
    snapshot.alerts.requiredChannels.length > 0
      ? snapshot.alerts.requiredChannels
      : [...REQUIRED_ALERT_CHANNELS];
  const missingAlerts = requiredAlerts.filter((channel) => !configuredAlerts.has(channel));
  checks.push(
    check({
      code: "ALERT_CHANNELS_CONFIGURED",
      category: "providers",
      critical: true,
      status: missingAlerts.length === 0 ? "passed" : "failed",
      summary:
        missingAlerts.length === 0
          ? "The required nonproduction alert channels are configured."
          : "One or more required alert channels are missing.",
      remediation:
        missingAlerts.length === 0
          ? null
          : "Configure staging pager, email, and operations-chat destinations.",
      evidence: { missingChannels: missingAlerts.join(",") },
    }),
    check({
      code: "ALERT_DESTINATIONS_HTTPS",
      category: "providers",
      critical: true,
      status: snapshot.alerts.destinationsUseHttps ? "passed" : "failed",
      summary: snapshot.alerts.destinationsUseHttps
        ? "All configured alert destinations use HTTPS."
        : "At least one alert destination is missing HTTPS.",
      remediation: snapshot.alerts.destinationsUseHttps
        ? null
        : "Replace every alert destination with an HTTPS endpoint.",
    }),
    check({
      code: "ALERT_DESTINATIONS_NONPRODUCTION",
      category: "providers",
      critical: true,
      status: snapshot.alerts.destinationsAppearNonProduction
        ? "passed"
        : "failed",
      summary: snapshot.alerts.destinationsAppearNonProduction
        ? "Alert destinations are explicitly nonproduction."
        : "Alert destinations are not proven to be nonproduction.",
      remediation: snapshot.alerts.destinationsAppearNonProduction
        ? null
        : "Use staging-specific alert destinations and labels before incident drills.",
    }),
  );

  for (const [controlCode, expectedMode] of Object.entries(SAFE_CONTROLS)) {
    const actual = snapshot.controls[controlCode as MMGCommerceControlCode];
    checks.push(
      check({
        code: `SAFE_CONTROL:${controlCode}`,
        category: "safety",
        critical: true,
        status: actual === expectedMode ? "passed" : "failed",
        summary:
          actual === expectedMode
            ? `${controlCode} is in its canonical safe mode.`
            : `${controlCode} is not in its canonical safe mode.`,
        remediation:
          actual === expectedMode
            ? null
            : "Run the staging bootstrap action and keep customer-affecting controls disabled or observe-only.",
        evidence: { expectedMode, actualMode: actual ?? null },
      }),
    );
  }

  const rolloutSafe =
    snapshot.rollout?.releaseId === snapshot.releaseId &&
    snapshot.rollout.stage === "paused" &&
    snapshot.rollout.cohortPercentage === 0;
  checks.push(
    check({
      code: "ROLLOUT_PAUSED_ZERO_PERCENT",
      category: "safety",
      critical: true,
      status: rolloutSafe ? "passed" : "failed",
      summary: rolloutSafe
        ? "The staging customer rollout is paused at 0%."
        : "The staging customer rollout is not safely paused at 0%.",
      remediation: rolloutSafe
        ? null
        : "Pause the rollout at 0% for the exact release before execution.",
      evidence: {
        stage: snapshot.rollout?.stage ?? null,
        cohortPercentage: snapshot.rollout?.cohortPercentage ?? null,
        releaseId: snapshot.rollout?.releaseId ?? null,
      },
    }),
    check({
      code: "NO_PUBLICATION_CAPABILITY",
      category: "safety",
      critical: true,
      status: snapshot.publicationAllowed === false ? "passed" : "failed",
      summary: "The readiness inspector cannot authorize Shopify publication.",
      remediation: null,
    }),
    check({
      code: "NO_LIVE_CUSTOMER_DATA",
      category: "safety",
      critical: true,
      status: snapshot.liveCustomerDataAllowed === false ? "passed" : "failed",
      summary: "The readiness inspector cannot authorize live customer data.",
      remediation: null,
    }),
  );

  const tooling = snapshot.tooling;
  checks.push(
    check({
      code: "NODE_VERSION_SUPPORTED",
      category: "workflow",
      critical: true,
      status:
        tooling.nodeMajor !== null && tooling.nodeMajor >= 22 ? "passed" : "failed",
      summary:
        tooling.nodeMajor !== null && tooling.nodeMajor >= 22
          ? "Node.js 22 or newer is available."
          : "Node.js 22 or newer is not available.",
      remediation:
        tooling.nodeMajor !== null && tooling.nodeMajor >= 22
          ? null
          : "Use the governed Node.js 22 staging runner.",
      evidence: { nodeMajor: tooling.nodeMajor },
    }),
    check({
      code: "MIGRATION_TOOLING_AVAILABLE",
      category: "workflow",
      critical: true,
      status:
        tooling.psqlAvailable === true && tooling.sha256ToolAvailable === true
          ? "passed"
          : "failed",
      summary:
        tooling.psqlAvailable === true && tooling.sha256ToolAvailable === true
          ? "PostgreSQL and SHA-256 migration tools are available."
          : "Required migration tooling is unavailable.",
      remediation:
        tooling.psqlAvailable === true && tooling.sha256ToolAvailable === true
          ? null
          : "Install psql and sha256sum on the protected staging runner.",
    }),
    check({
      code: "REPOSITORY_EXECUTION_FILES_PRESENT",
      category: "workflow",
      critical: true,
      status:
        tooling.migrationRunnerPresent &&
        tooling.releaseRegistrationPresent &&
        tooling.workflowPresent
          ? "passed"
          : "failed",
      summary:
        tooling.migrationRunnerPresent &&
        tooling.releaseRegistrationPresent &&
        tooling.workflowPresent
          ? "The governed execution scripts and workflow are present."
          : "One or more governed execution files are missing.",
      remediation:
        tooling.migrationRunnerPresent &&
        tooling.releaseRegistrationPresent &&
        tooling.workflowPresent
          ? null
          : "Deploy the exact repository commit containing the migration runner, release registration, and staging integration workflow.",
    }),
    check({
      code: "GITHUB_ENVIRONMENT_CONFIGURED",
      category: "workflow",
      critical: true,
      status:
        snapshot.githubEnvironment.configured === true &&
        snapshot.githubEnvironment.requiredSecretNamesPresent === true
          ? "passed"
          : snapshot.githubEnvironment.configured === null ||
              snapshot.githubEnvironment.requiredSecretNamesPresent === null
            ? "unknown"
            : "failed",
      summary:
        snapshot.githubEnvironment.configured === true &&
        snapshot.githubEnvironment.requiredSecretNamesPresent === true
          ? "The protected mmg-commerce-staging environment and required secrets are configured."
          : "The protected GitHub Environment is missing or has not been verified.",
      remediation:
        snapshot.githubEnvironment.configured === true &&
        snapshot.githubEnvironment.requiredSecretNamesPresent === true
          ? null
          : "Configure the mmg-commerce-staging GitHub Environment and all required secret names before execute or rehearse.",
    }),
  );

  const blockers = checks.filter(
    (entry) =>
      entry.critical &&
      (entry.status === "failed" || entry.status === "unknown"),
  );
  const warnings = checks.filter(
    (entry) => entry.status === "warning" || (!entry.critical && entry.status === "unknown"),
  );
  return {
    schemaVersion: MMG_STAGING_READINESS_VERSION,
    environment: "staging",
    releaseId: snapshot.releaseId,
    releaseCommitSha: snapshot.releaseCommitSha,
    status: blockers.length === 0 ? "ready" : "blocked",
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    checks,
    inspectedAt: snapshot.inspectedAt,
    publicationAllowed: false,
    liveCustomerDataAllowed: false,
  };
};
