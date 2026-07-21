import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";

export type MMGStagingProviderCode =
  | "database"
  | "runtime_routes"
  | "runtime_controls"
  | "alerts"
  | "scheduler"
  | "dispatcher"
  | "storage_signer"
  | "admin_auth";

export interface MMGStagingProviderProbeTarget {
  adapterCode: Exclude<
    MMGStagingProviderCode,
    "database" | "runtime_routes" | "runtime_controls" | "admin_auth"
  >;
  endpoint: string;
  token: string;
}

export interface MMGStagingProviderHeartbeatRuntime {
  recordAdapterHeartbeat(input: {
    adapterCode: string;
    status: "healthy" | "degraded" | "unavailable" | "unknown";
    details?: Record<string, unknown>;
  }): Promise<void>;
}

export interface MMGStagingProviderHeartbeatSummary {
  releaseId: string;
  observedAt: string;
  results: Array<{
    adapterCode: MMGStagingProviderCode;
    status: "healthy" | "degraded" | "unavailable" | "unknown";
    reasonCode: string;
  }>;
}

const httpsEndpoint = (value: string, code: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(code);
  }
  if (parsed.protocol !== "https:") throw new Error(code);
  return parsed.toString();
};

const token = (value: string, code: string): string => {
  const normalized = value.trim();
  if (normalized.length < 32) throw new Error(code);
  return normalized;
};

const responseRelease = async (response: Response): Promise<string | null> => {
  const header = response.headers.get("x-mmg-release-id");
  if (header?.trim()) return header.trim();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const releaseId = String(body.releaseId ?? body.release_id ?? "").trim();
    return releaseId || null;
  } catch {
    return null;
  }
};

const safeDetails = (
  reasonCode: string,
  observedAt: Date,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  reasonCode,
  observedAt: observedAt.toISOString(),
  ...extra,
});

export class MMGCloudflareStagingProviderHeartbeatCoordinator {
  readonly #database: MMGSQLExecutor;
  readonly #runtime: MMGStagingProviderHeartbeatRuntime;
  readonly #releaseId: string;
  readonly #runtimeOrigin: string;
  readonly #runtimeProbeToken: string;
  readonly #adminTokenConfigured: boolean;
  readonly #targets: MMGStagingProviderProbeTarget[];
  readonly #fetcher: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => Date;

  constructor(input: {
    database: MMGSQLExecutor;
    runtime: MMGStagingProviderHeartbeatRuntime;
    releaseId: string;
    runtimeOrigin: string;
    runtimeProbeToken: string;
    adminTokenConfigured: boolean;
    targets: MMGStagingProviderProbeTarget[];
    fetcher?: typeof fetch;
    timeoutMs?: number;
    now?: () => Date;
  }) {
    this.#database = input.database;
    this.#runtime = input.runtime;
    this.#releaseId = input.releaseId.trim();
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(this.#releaseId)) {
      throw new Error("MMG_STAGING_PROVIDER_RELEASE_ID_INVALID");
    }
    this.#runtimeOrigin = httpsEndpoint(
      input.runtimeOrigin,
      "MMG_STAGING_PROVIDER_RUNTIME_ORIGIN_INVALID",
    ).replace(/\/$/, "");
    this.#runtimeProbeToken = token(
      input.runtimeProbeToken,
      "MMG_STAGING_PROVIDER_RUNTIME_TOKEN_INVALID",
    );
    this.#adminTokenConfigured = input.adminTokenConfigured;
    this.#targets = input.targets.map((target) => ({
      adapterCode: target.adapterCode,
      endpoint: httpsEndpoint(
        target.endpoint,
        `MMG_STAGING_PROVIDER_ENDPOINT_INVALID:${target.adapterCode}`,
      ),
      token: token(
        target.token,
        `MMG_STAGING_PROVIDER_TOKEN_INVALID:${target.adapterCode}`,
      ),
    }));
    this.#fetcher = input.fetcher ?? fetch;
    this.#timeoutMs = input.timeoutMs ?? 8_000;
    if (
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1_000 ||
      this.#timeoutMs > 30_000
    ) {
      throw new Error("MMG_STAGING_PROVIDER_TIMEOUT_INVALID");
    }
    this.#now = input.now ?? (() => new Date());
  }

  async refresh(): Promise<MMGStagingProviderHeartbeatSummary> {
    const observedAt = this.#now();
    const results = await Promise.all([
      this.#probeDatabase(observedAt),
      this.#probeRuntimeRoutes(observedAt),
      this.#probeRuntimeControls(observedAt),
      this.#probeAdminAuth(observedAt),
      ...this.#targets.map((target) => this.#probeRemote(target, observedAt)),
    ]);
    return {
      releaseId: this.#releaseId,
      observedAt: observedAt.toISOString(),
      results,
    };
  }

  async #record(input: {
    adapterCode: MMGStagingProviderCode;
    status: "healthy" | "degraded" | "unavailable" | "unknown";
    reasonCode: string;
    observedAt: Date;
    details?: Record<string, unknown>;
  }) {
    await this.#runtime.recordAdapterHeartbeat({
      adapterCode: input.adapterCode,
      status: input.status,
      details: safeDetails(input.reasonCode, input.observedAt, input.details),
    });
    return {
      adapterCode: input.adapterCode,
      status: input.status,
      reasonCode: input.reasonCode,
    };
  }

  async #probeDatabase(observedAt: Date) {
    try {
      const result = await this.#database.query<{ ok: number }>(
        "SELECT 1::integer AS ok",
      );
      const healthy = result.rows[0]?.ok === 1;
      return this.#record({
        adapterCode: "database",
        status: healthy ? "healthy" : "degraded",
        reasonCode: healthy
          ? "MMG_STAGING_DATABASE_REACHABLE"
          : "MMG_STAGING_DATABASE_QUERY_UNEXPECTED",
        observedAt,
      });
    } catch {
      return this.#record({
        adapterCode: "database",
        status: "unavailable",
        reasonCode: "MMG_STAGING_DATABASE_UNAVAILABLE",
        observedAt,
      });
    }
  }

  async #probeRuntimeRoutes(observedAt: Date) {
    const response = await this.#request(
      `${this.#runtimeOrigin}/api/internal/commerce/staging-readiness`,
      this.#runtimeProbeToken,
      "HEAD",
    );
    const reachable = response !== null && [200, 204, 401, 403, 405].includes(response.status);
    return this.#record({
      adapterCode: "runtime_routes",
      status: reachable ? "healthy" : "unavailable",
      reasonCode: reachable
        ? "MMG_STAGING_RUNTIME_ROUTES_REACHABLE"
        : "MMG_STAGING_RUNTIME_ROUTES_UNAVAILABLE",
      observedAt,
      details: { statusCode: response?.status ?? null },
    });
  }

  async #probeRuntimeControls(observedAt: Date) {
    try {
      const result = await this.#database.query<{ control_count: string | number }>(
        `SELECT COUNT(*) AS control_count
         FROM mmg_staging_runtime_controls
         WHERE environment = 'staging'`,
      );
      const count = Number(result.rows[0]?.control_count ?? 0);
      const healthy = Number.isInteger(count) && count >= 8;
      return this.#record({
        adapterCode: "runtime_controls",
        status: healthy ? "healthy" : "degraded",
        reasonCode: healthy
          ? "MMG_STAGING_RUNTIME_CONTROLS_READY"
          : "MMG_STAGING_RUNTIME_CONTROLS_INCOMPLETE",
        observedAt,
        details: { controlCount: Number.isFinite(count) ? count : null },
      });
    } catch {
      return this.#record({
        adapterCode: "runtime_controls",
        status: "unavailable",
        reasonCode: "MMG_STAGING_RUNTIME_CONTROLS_UNAVAILABLE",
        observedAt,
      });
    }
  }

  async #probeAdminAuth(observedAt: Date) {
    return this.#record({
      adapterCode: "admin_auth",
      status: this.#adminTokenConfigured ? "healthy" : "unavailable",
      reasonCode: this.#adminTokenConfigured
        ? "MMG_STAGING_ADMIN_AUTH_CONFIGURED"
        : "MMG_STAGING_ADMIN_AUTH_UNAVAILABLE",
      observedAt,
    });
  }

  async #probeRemote(
    target: MMGStagingProviderProbeTarget,
    observedAt: Date,
  ) {
    const response = await this.#request(target.endpoint, target.token, "GET");
    if (!response) {
      return this.#record({
        adapterCode: target.adapterCode,
        status: "unavailable",
        reasonCode: `MMG_STAGING_${target.adapterCode.toUpperCase()}_UNAVAILABLE`,
        observedAt,
      });
    }
    const releaseId = await responseRelease(response.clone());
    const exactRelease = releaseId === this.#releaseId;
    const healthy = response.ok && exactRelease;
    return this.#record({
      adapterCode: target.adapterCode,
      status: healthy ? "healthy" : response.ok ? "degraded" : "unavailable",
      reasonCode: healthy
        ? `MMG_STAGING_${target.adapterCode.toUpperCase()}_HEALTHY`
        : response.ok
          ? `MMG_STAGING_${target.adapterCode.toUpperCase()}_RELEASE_MISMATCH`
          : `MMG_STAGING_${target.adapterCode.toUpperCase()}_HEALTH_CHECK_FAILED`,
      observedAt,
      details: {
        statusCode: response.status,
        exactRelease,
      },
    });
  }

  async #request(
    endpoint: string,
    bearerToken: string,
    method: "GET" | "HEAD",
  ): Promise<Response | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      return await this.#fetcher(endpoint, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "X-MMG-Internal-Request": "staging-provider-heartbeat",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const parseMMGStagingProviderTargets = (input: {
  alertEndpoint?: string;
  schedulerEndpoint?: string;
  dispatcherEndpoint?: string;
  storageSignerEndpoint?: string;
  providerToken?: string;
}): MMGStagingProviderProbeTarget[] => {
  const providerToken = String(input.providerToken ?? "").trim();
  const definitions: Array<[
    MMGStagingProviderProbeTarget["adapterCode"],
    string | undefined,
  ]> = [
    ["alerts", input.alertEndpoint],
    ["scheduler", input.schedulerEndpoint],
    ["dispatcher", input.dispatcherEndpoint],
    ["storage_signer", input.storageSignerEndpoint],
  ];
  return definitions.flatMap(([adapterCode, endpoint]) => {
    const normalized = String(endpoint ?? "").trim();
    if (!normalized) return [];
    return [
      {
        adapterCode,
        endpoint: normalized,
        token: providerToken,
      },
    ];
  });
};
