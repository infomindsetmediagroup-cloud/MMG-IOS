import type { MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import { MMGCompositeCommerceMetricsAdapter } from "./commerce-metrics-collector.js";
import { bootstrapMMGCommerceOperations } from "./commerce-operations-bootstrap.js";
import {
  handleMMGCommerceOperationsDashboardRequest,
  type MMGCommerceOperationsDashboardAuthenticator,
} from "./commerce-operations-dashboard-http.js";
import { handleMMGCommerceOperationsRequest } from "./commerce-operations-http.js";
import type {
  MMGCommerceOperationsPrincipal,
} from "./commerce-operations-service.js";
import {
  MMGHTTPCommerceControlAdapter,
  MMGPostgresCommerceRuntimeControlReceiptStore,
} from "./http-commerce-control-adapter.js";
import { MMGHTTPCommerceRouteProbe } from "./http-commerce-route-probe.js";
import { MMGHTTPCommerceStagingRehearsalGateway } from "./http-commerce-staging-rehearsal-gateway.js";
import { MMGPostgresCommerceOperationsRepository } from "./postgres-commerce-operations-repository.js";
import { MMGPostgresCommerceProductionTelemetry } from "./postgres-commerce-production-telemetry.js";
import { MMGPostgresCommerceRehearsalRepository } from "./postgres-commerce-rehearsal-repository.js";
import { MMGPostgresCommerceStagingFixtureExecutor } from "./postgres-commerce-staging-fixture-executor.js";
import { MMGPostgresRolloutEvidenceAdapter } from "./commerce-rollout-evidence.js";
import {
  routeMMGProductionOperationsRequest,
  type MMGProductionOperationsRuntimeHandlers,
} from "./production-operations-router.js";
import type { MMGCommerceProductionAdapterConfig } from "./production-adapter-config.js";
import { MMGPostgresStagingRuntimeControlBoundary } from "./postgres-staging-runtime-control-boundary.js";
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
}

export interface MMGStagingIntegrationRuntimeDependencies {
  config: MMGCommerceProductionAdapterConfig;
  tokens: MMGStagingIntegrationTokens;
  database: MMGTransactionalDatabase;
  dashboardAuthenticator: MMGCommerceOperationsDashboardAuthenticator;
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
  validateTokens(dependencies.tokens);
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher ?? fetch;
  const allowedOrigins = new Set([
    dependencies.config.runtimeOrigin,
    ...(dependencies.allowedOrigins ?? []),
  ]);
  const repository = new MMGPostgresCommerceOperationsRepository(dependencies.database);
  const routeProbe = new MMGHTTPCommerceRouteProbe({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    internalToken: dependencies.tokens.operations,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    targets: dependencies.config.routeProbePaths.map((path) => ({ path })),
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
  const fixtureExecutor = new MMGPostgresCommerceStagingFixtureExecutor({
    database: dependencies.database,
    operations: common,
  });
  const rehearsalRepository = new MMGPostgresCommerceRehearsalRepository(
    dependencies.database,
  );
  const rehearsalGateway = new MMGHTTPCommerceStagingRehearsalGateway({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    internalToken: dependencies.tokens.rehearsalAdapter,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    fetcher,
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
          boundary: new MMGPostgresStagingRuntimeControlBoundary(dependencies.database),
          allowedOrigins,
        },
      });
    },
    async bootstrapSafeState(): Promise<void> {
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
    },
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
  };
};
