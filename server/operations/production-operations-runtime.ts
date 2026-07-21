import type { MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import { MMGCompositeCommerceMetricsAdapter } from "./commerce-metrics-collector.js";
import { bootstrapMMGCommerceOperations } from "./commerce-operations-bootstrap.js";
import {
  handleMMGCommerceOperationsDashboardRequest,
  type MMGCommerceOperationsDashboardAuthenticator,
} from "./commerce-operations-dashboard-http.js";
import {
  handleMMGCommerceOperationsRequest,
  type MMGCommerceOperationsAuthenticator,
} from "./commerce-operations-http.js";
import { MMGPostgresCommerceOperationsRepository } from "./postgres-commerce-operations-repository.js";
import { MMGPostgresRolloutEvidenceAdapter } from "./commerce-rollout-evidence.js";
import { MMGHTTPCommerceRouteProbe } from "./http-commerce-route-probe.js";
import { MMGHTTPCommerceControlAdapter } from "./http-commerce-control-adapter.js";
import { MMGPostgresCommerceProductionTelemetry } from "./postgres-commerce-production-telemetry.js";
import {
  MMGPostgresCommerceAlertDeliveryStore,
  MMGWebhookCommerceAlertAdapter,
  type MMGCommerceAlertHasher,
} from "./webhook-commerce-alert-adapter.js";
import {
  redactMMGCommerceProductionAdapterConfig,
  type MMGCommerceProductionAdapterConfig,
} from "./production-adapter-config.js";

export interface MMGProductionOperationsRuntimeDependencies {
  config: MMGCommerceProductionAdapterConfig;
  database: MMGTransactionalDatabase;
  dashboardAuthenticator: MMGCommerceOperationsDashboardAuthenticator;
  alertHasher: MMGCommerceAlertHasher;
  hashPayloadSync(value: unknown): string;
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

class MMGInternalOperationsAuthenticator implements MMGCommerceOperationsAuthenticator {
  readonly #token: string;
  readonly #environment: "staging" | "production";

  constructor(token: string, environment: "staging" | "production") {
    this.#token = token;
    this.#environment = environment;
  }

  async authenticate(request: Request) {
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!tokenEquals(supplied, this.#token)) return null;
    return {
      actorId: `commerce-runtime:${this.#environment}`,
      sessionId: `internal:${this.#environment}`,
      roles: [
        "mmg-commerce-operator",
        "mmg-commerce-monitor",
        "mmg-incident-commander",
        "mmg-production-release-manager",
      ],
    };
  }
}

export const buildMMGProductionOperationsRuntime = (
  dependencies: MMGProductionOperationsRuntimeDependencies,
) => {
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher ?? fetch;
  const repository = new MMGPostgresCommerceOperationsRepository(dependencies.database);
  const routeProbe = new MMGHTTPCommerceRouteProbe({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    internalToken: dependencies.config.internalToken,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    targets: dependencies.config.routeProbePaths.map((path) => ({ path })),
    fetcher,
  });
  const telemetry = new MMGPostgresCommerceProductionTelemetry({
    database: dependencies.database,
    routeProbe,
    now,
  });
  const metrics = new MMGCompositeCommerceMetricsAdapter({
    infrastructure: telemetry,
    webhooks: telemetry,
    delivery: telemetry,
    access: telemetry,
    consistency: telemetry,
    verification: telemetry,
  });
  const controls = new MMGHTTPCommerceControlAdapter({
    runtimeOrigin: dependencies.config.runtimeOrigin,
    internalToken: dependencies.config.internalToken,
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    fetcher,
  });
  const alerts = new MMGWebhookCommerceAlertAdapter({
    destinations: dependencies.config.alertDestinations,
    hasher: dependencies.alertHasher,
    store: new MMGPostgresCommerceAlertDeliveryStore(dependencies.database),
    requestTimeoutMs: dependencies.config.requestTimeoutMs,
    fetcher,
    now,
  });
  const authenticator = new MMGInternalOperationsAuthenticator(
    dependencies.config.internalToken,
    dependencies.config.environment,
  );
  const allowedOrigins = new Set([
    dependencies.config.runtimeOrigin,
    ...(dependencies.allowedOrigins ?? []),
  ]);
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

  return {
    configuration: redactMMGCommerceProductionAdapterConfig(dependencies.config),
    handleOperations(request: Request): Promise<Response> {
      return handleMMGCommerceOperationsRequest(request, {
        ...common,
        authenticator,
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
    async bootstrapSafeState(): Promise<void> {
      const principal = await authenticator.authenticate(
        new Request(`${dependencies.config.runtimeOrigin}/api/internal/commerce/operations`, {
          headers: { Authorization: `Bearer ${dependencies.config.internalToken}` },
        }),
      );
      if (!principal) throw new Error("MMG_PRODUCTION_BOOTSTRAP_AUTH_FAILED");
      await bootstrapMMGCommerceOperations({
        environment: dependencies.config.environment,
        releaseId: dependencies.config.releaseId,
        principal,
        repository,
        controls,
        occurredAt: now(),
      });
    },
    async runScheduledEvaluation(requestId: string): Promise<Response> {
      return handleMMGCommerceOperationsRequest(
        new Request(`${dependencies.config.runtimeOrigin}/api/internal/commerce/operations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${dependencies.config.internalToken}`,
            Origin: dependencies.config.runtimeOrigin,
            "Content-Type": "application/json",
            "X-MMG-Internal-Request": "production-scheduled-monitor",
          },
          body: JSON.stringify({
            requestId,
            action: "evaluate",
            environment: dependencies.config.environment,
            releaseId: dependencies.config.releaseId,
            allowAutomaticContainment: true,
          }),
        }),
        {
          ...common,
          authenticator,
          allowedOrigins,
        },
      );
    },
  };
};
