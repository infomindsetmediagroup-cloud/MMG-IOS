import type { MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import { MMGCompositeCommerceMetricsAdapter } from "./commerce-metrics-collector.js";
import { bootstrapMMGCommerceOperations } from "./commerce-operations-bootstrap.js";
import {
  handleMMGCommerceOperationsDashboardRequest,
  type MMGCommerceOperationsDashboardAuthenticator,
} from "./commerce-operations-dashboard-http.js";
import { handleMMGCommerceOperationsRequest } from "./commerce-operations-http.js";
import type { MMGCommerceOperationsPrincipal } from "./commerce-operations-service.js";
import { MMGPostgresRolloutEvidenceAdapter } from "./commerce-rollout-evidence.js";
import {
  MMGHTTPCommerceControlAdapter,
  MMGPostgresCommerceRuntimeControlReceiptStore,
} from "./http-commerce-control-adapter.js";
import { MMGHTTPCommerceRouteProbe } from "./http-commerce-route-probe.js";
import { MMGHTTPCommerceStagingRehearsalGateway } from "./http-commerce-staging-rehearsal-gateway.js";
import {
  MMGHTTPStagingReadinessRouteProbe,
  type MMGStagingReadinessRouteTarget,
} from "./http-staging-readiness-route-probe.js";
import { MMGPostgresCommerceOperationsRepository } from "./postgres-commerce-operations-repository.js";
import { MMGPostgresCommerceProductionTelemetry } from "./postgres-commerce-production-telemetry.js";
import { MMGPostgresCommerceRehearsalEvidenceAdapter } from "./postgres-commerce-rehearsal-evidence.js";
import { MMGPostgresCommerceRehearsalRepository } from "./postgres-commerce-rehearsal-repository.js";
import { MMGPostgresCommerceStagingFixtureExecutor } from "./postgres-commerce-staging-fixture-executor.js";
import { MMGPostgresStagingIntegrationGateway } from "./postgres-staging-integration-gateway.js";
import {
  MMGPostgresStagingIntegrationRepository,
  recordMMGStagingAdapterHeartbeat,
} from "./postgres-staging-integration-repository.js";
import { MMGPostgresStagingReadinessGateway } from "./postgres-staging-readiness-gateway.js";
import { MMGPostgresStagingRuntimeControlBoundary } from "./postgres-staging-runtime-control-boundary.js";
import {
  routeMMGProductionOperationsRequest,
  type MMGProductionOperationsRuntimeHandlers,
} from "./production-operations-router.js";
import type { MMGCommerceProductionAdapterConfig } from "./production-adapter-config.js";
import {
  MMGPostgresCommerceAlertDeliveryStore,
  MMGWebhookCommerceAlertAdapter,
  type MMGCommerceAlertHasher,
} from "./webhook-commerce-alert-adapter.js";

export interface MMGStagingIntegrationTokens {
  operations: string;
  rehearsal: string;
  rehearsalAdapter: string;
  runtimeControl: string;
  integration: string;
}

export interface MMGStagingIntegrationRuntimeDependencies {
  config: MMGCommerceProductionAdapterConfig;
  releaseCommitSha: string;
  tokens: MMGStagingIntegrationTokens;
  database: MMGTransactionalDatabase;
  dashboardAuthenticator: MMGCommerceOperationsDashboardAuthenticator;
  adminAuthenticationConfigured: boolean;
  alertEnvironmentLabel: string;
  alertHasher: MMGCommerceAlertHasher;
  hashPayloadSync(value: unknown): string;
  createControlReceiptId?(): string;
  allowedOrigins?: ReadonlySet<string>;
  fetcher?: typeof fetch;
  now?: () => Date;
}

const tokenEquals = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
};

const validateTokens = (tokens: MMGStagingIntegrationTokens): void => {
  const values = Object.values(tokens);
  if (values.some((value) => value.trim().length < 32)) {
    throw new Error("MMG_STAGING_INTEGRATION_TOKEN_INVALID");
  }
  if (new Set(values).size !== values.length) {
    throw new Error("MMG_STAGING_INTEGRATION_TOKENS_MUST_BE_DISTINCT");
  }
};

const readinessCredential = (
  path: string,
): MMGStagingReadinessRouteTarget["credential"] => {
  if (
    path === "/api/internal/commerce/staging-integration" ||
    path === "/api/internal/commerce/staging-readiness"
  ) {
    return "integration";
  }
  if (path === "/api/internal/commerce/rehearsal/adapter") {
    return "rehearsalAdapter";
  }
  if (path === "/api/internal/commerce/rehearsal") {
    return "rehearsal";
  }
  if (path.startsWith("/api/internal/runtime-controls/")) {
    return "runtimeControl";
  }
  return "operations";
};

class TokenAuthenticator {
  readonly #token: string;
  readonly #actorId: string;
  readonly #roles: string[];

  constructor(input: { token: string; actorId: string; roles: string[] }) {
    this.#token = input.token;
    this.#actorId = input.actorId;
    this.#roles = input.roles;
  }

  async authenticate(request: Request) {
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!tokenEquals(supplied, this.#token)) return null;
    return {
      actorId: this.#actorId,
      sessionId: `internal:${this.#actorId}`.slice(0, 128),
      roles: [...this.#roles],
    };
  }
}

export const buildMMGStagingIntegrationRuntime = (
  dependencies: MMGStagingIntegrationRuntimeDependencies,
) => {
  if (dependencies.config.environment !== "staging") {
    throw new Error("MMG_STAGING_INTEGRATION_RUNTIME_STAGING_ONLY");
  }
  if (!/^[a-f0-9]{40}$/.test(dependencies.releaseCommitSha)) {
    throw new Error("MMG_STAGING_INTEGRATION_COMMIT_SHA_INVALID");
  }
  if (!dependencies.adminAuthenticationConfigured) {
    throw new Error("MMG_STAGING_ADMIN_AUTHENTICATION_REQUIRED");
  }
  if (dependencies.alertEnvironmentLabel.trim().toLowerCase() !== "staging") {
    throw new Error("MMG_STAGING_ALERT_ENVIRONMENT_INVALID");
  }
  validateTokens(dependencies.tokens);
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher ?? fetch;
  const allowedOrigins = new Set([
    dependencies.config.runtimeOrigin,
    ...(dependencies.allowedOrigins ?? []),
  ]);
  const repository = new MMGPostgresCommerceOperationsRepository(
    dependencies.database,
  );
  const routeProbe = new MMGHTTPCommerceRouteProbe({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    internalToken: dependencies.tokens.operations,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    targets: dependencies.config.routeProbePaths.map((path) => ({ path })),
    fetcher,
  });
  const detailedRouteProbe = new MMGHTTPStagingReadinessRouteProbe({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    tokens: dependencies.tokens,
    targets: dependencies.config.routeProbePaths.map((path) => ({
      path,
      method: "HEAD",
      credential: readinessCredential(path),
    })),
    fetcher,
  });
  const telemetry = new MMGPostgresCommerceProductionTelemetry({
    database: dependencies.database,
    routeProbe,
    now,
  });
  const infrastructure = {
    async databaseConnectivity(input: { environment: "staging" | "production" }) {
      const samples = await Promise.all(
        Array.from({ length: 5 }, () => telemetry.databaseConnectivity(input)),
      );
      return samples.reduce(
        (aggregate, sample) => ({
          successes: aggregate.successes + sample.successes,
          total: aggregate.total + sample.total,
        }),
        { successes: 0, total: 0 },
      );
    },
    runtimeRouteAvailability(input: { environment: "staging" | "production" }) {
      return telemetry.runtimeRouteAvailability(input);
    },
  };
  const metrics = new MMGCompositeCommerceMetricsAdapter({
    infrastructure,
    webhooks: telemetry,
    delivery: telemetry,
    access: telemetry,
    consistency: telemetry,
    verification: telemetry,
  });
  const controls = new MMGHTTPCommerceControlAdapter({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    internalToken: dependencies.tokens.runtimeControl,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    receiptStore: new MMGPostgresCommerceRuntimeControlReceiptStore(
      dependencies.database,
    ),
    sha256: (value) => dependencies.alertHasher.sha256(value),
    createReceiptId:
      dependencies.createControlReceiptId ??
      (() => `control:${globalThis.crypto.randomUUID()}`),
    fetcher,
    now,
  });
  const alerts = new MMGWebhookCommerceAlertAdapter({
    destinations: dependencies.config.alertDestinations,
    hasher: dependencies.alertHasher,
    store: new MMGPostgresCommerceAlertDeliveryStore(dependencies.database),
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    fetcher,
    now,
  });
  const common = {
    repository,
    metrics,
    consistency: telemetry,
    controls,
    alerts,
    rolloutEvidence: new MMGPostgresRolloutEvidenceAdapter(dependencies.database),
    now,
    hashPayload: (command: unknown) => {
      const hash = dependencies.hashPayloadSync(command);
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new Error("MMG_OPERATIONS_PAYLOAD_HASH_INVALID");
      }
      return hash;
    },
  };
  const operationsAuthenticator = new TokenAuthenticator({
    token: dependencies.tokens.operations,
    actorId: "staging-commerce-operations",
    roles: ["mmg-commerce-operator", "mmg-commerce-monitor"],
  });
  const rehearsalAuthenticator = new TokenAuthenticator({
    token: dependencies.tokens.rehearsal,
    actorId: "staging-rehearsal-operator",
    roles: ["mmg-commerce-rehearsal-operator"],
  });
  const rehearsalAdapterAuthenticator = new TokenAuthenticator({
    token: dependencies.tokens.rehearsalAdapter,
    actorId: "staging-rehearsal-adapter",
    roles: ["mmg-commerce-rehearsal-adapter"],
  });
  const runtimeControlAuthenticator = new TokenAuthenticator({
    token: dependencies.tokens.runtimeControl,
    actorId: "staging-runtime-control",
    roles: ["mmg-runtime-control"],
  });
  const integrationAuthenticator = new TokenAuthenticator({
    token: dependencies.tokens.integration,
    actorId: "staging-commerce-integrator",
    roles: ["mmg-commerce-staging-integrator"],
  });
  const runtime: MMGProductionOperationsRuntimeHandlers = {
    handleOperations(request: Request): Promise<Response> {
      return handleMMGCommerceOperationsRequest(request, {
        ...common,
        authenticator: operationsAuthenticator,
        allowedOrigins,
      });
    },
    handleDashboard(request: Request): Promise<Response> {
      return handleMMGCommerceOperationsDashboardRequest(request, {
        authenticator: dependencies.dashboardAuthenticator,
        repository,
        now,
      });
    },
  };
  const bootstrapSafeState = async (): Promise<void> => {
    const principal: MMGCommerceOperationsPrincipal = {
      actorId: "staging-commerce-bootstrap",
      sessionId: "internal:staging-commerce-bootstrap",
      roles: ["mmg-commerce-operator", "mmg-commerce-monitor"],
    };
    await bootstrapMMGCommerceOperations({
      environment: "staging",
      releaseId: dependencies.config.releaseId,
      principal,
      repository,
      controls,
      occurredAt: now(),
    });
  };
  const fixtureExecutor = new MMGPostgresCommerceStagingFixtureExecutor({
    database: dependencies.database,
    operations: common,
  });
  const rehearsalRepository = new MMGPostgresCommerceRehearsalRepository(
    dependencies.database,
  );
  const rehearsalEvidence = new MMGPostgresCommerceRehearsalEvidenceAdapter(
    dependencies.database,
  );
  const rehearsalGateway = new MMGHTTPCommerceStagingRehearsalGateway({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    internalToken: dependencies.tokens.rehearsalAdapter,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    fetcher,
  });
  const stagingIntegrationRepository =
    new MMGPostgresStagingIntegrationRepository(dependencies.database);
  const stagingIntegrationGateway = new MMGPostgresStagingIntegrationGateway({
    database: dependencies.database,
    routeProbe,
    runtime: { bootstrapSafeState },
    rehearsal: rehearsalEvidence,
  });
  const alertDestinations = Object.values(
    dependencies.config.alertDestinations,
  ).filter((value): value is string => typeof value === "string");
  const stagingReadinessGateway = new MMGPostgresStagingReadinessGateway({
    database: dependencies.database,
    routes: detailedRouteProbe,
    config: {
      releaseId: dependencies.config.releaseId,
      releaseCommitSha: dependencies.releaseCommitSha,
      runtimeOrigin: dependencies.config.runtimeOrigin,
      credentials: {
        operationsConfigured: dependencies.tokens.operations.length >= 32,
        integrationConfigured: dependencies.tokens.integration.length >= 32,
        rehearsalConfigured: dependencies.tokens.rehearsal.length >= 32,
        rehearsalAdapterConfigured:
          dependencies.tokens.rehearsalAdapter.length >= 32,
        runtimeControlConfigured:
          dependencies.tokens.runtimeControl.length >= 32,
        adminAuthenticationConfigured:
          dependencies.adminAuthenticationConfigured,
        distinctServerCredentials:
          new Set(Object.values(dependencies.tokens)).size === 5,
      },
      alertChannels: Object.keys(dependencies.config.alertDestinations),
      requiredAlertChannels: [
        "on_call_pager",
        "operations_email",
        "operations_chat",
      ],
      alertDestinationsUseHttps:
        alertDestinations.length >= 3 &&
        alertDestinations.every((value) => new URL(value).protocol === "https:"),
      alertEnvironmentLabel: dependencies.alertEnvironmentLabel,
    },
  });

  return {
    async route(request: Request): Promise<Response | null> {
      return routeMMGProductionOperationsRequest(request, {
        runtime,
        rehearsal: {
          authenticator: rehearsalAuthenticator,
          gateway: rehearsalGateway,
          repository: rehearsalRepository,
          allowedOrigins,
          now,
        },
        rehearsalAdapter: {
          authenticator: rehearsalAdapterAuthenticator,
          executor: fixtureExecutor,
          allowedOrigins,
        },
        runtimeControl: {
          authenticator: runtimeControlAuthenticator,
          boundary: new MMGPostgresStagingRuntimeControlBoundary(
            dependencies.database,
          ),
          allowedOrigins,
        },
        stagingIntegration: {
          authenticator: integrationAuthenticator,
          repository: stagingIntegrationRepository,
          gateway: stagingIntegrationGateway,
          allowedOrigins,
          now,
        },
        stagingReadiness: {
          authenticator: integrationAuthenticator,
          gateway: stagingReadinessGateway,
          allowedOrigins,
          now,
        },
      });
    },
    bootstrapSafeState,
    async runScheduledEvaluation(requestId: string): Promise<Response> {
      return runtime.handleOperations(
        new Request(
          `${dependencies.config.runtimeOrigin}/api/internal/commerce/operations`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${dependencies.tokens.operations}`,
              Origin: dependencies.config.runtimeOrigin,
              "Content-Type": "application/json",
              "X-MMG-Internal-Request": "staging-scheduled-monitor",
            },
            body: JSON.stringify({
              requestId,
              action: "evaluate",
              environment: "staging",
              releaseId: dependencies.config.releaseId,
              allowAutomaticContainment: true,
            }),
          },
        ),
      );
    },
    async recordAdapterHeartbeat(input: {
      adapterCode: string;
      status: "healthy" | "degraded" | "unavailable" | "unknown";
      details?: Record<string, unknown>;
    }): Promise<void> {
      await recordMMGStagingAdapterHeartbeat(dependencies.database, {
        adapterCode: input.adapterCode,
        releaseId: dependencies.config.releaseId,
        status: input.status,
        details: input.details,
        observedAt: now(),
      });
    },
  };
};
