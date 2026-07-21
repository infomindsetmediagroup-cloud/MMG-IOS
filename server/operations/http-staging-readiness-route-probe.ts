import type { MMGCommerceOperationsEnvironment } from "./commerce-operations-control.js";
import type { MMGStagingReadinessRouteResult } from "./staging-readiness-inspector.js";

export interface MMGStagingReadinessRouteTarget {
  path: string;
  method?: "GET" | "HEAD" | "OPTIONS";
  credential?: "operations" | "integration" | "rehearsal" | "rehearsalAdapter" | "runtimeControl";
}

export interface MMGStagingReadinessRouteProbeConfig {
  runtimeOrigin: string;
  requestTimeoutMs: number;
  tokens: Record<
    "operations" | "integration" | "rehearsal" | "rehearsalAdapter" | "runtimeControl",
    string
  >;
  targets: MMGStagingReadinessRouteTarget[];
  fetcher?: typeof fetch;
  now?: () => number;
}

const reachable = (status: number): boolean =>
  (status >= 200 && status < 400) || [401, 403, 405].includes(status);

export class MMGHTTPStagingReadinessRouteProbe {
  readonly #config: MMGStagingReadinessRouteProbeConfig;

  constructor(config: MMGStagingReadinessRouteProbeConfig) {
    if (config.targets.length < 1) {
      throw new Error("MMG_STAGING_READINESS_ROUTE_TARGETS_REQUIRED");
    }
    this.#config = config;
  }

  async inspect(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<MMGStagingReadinessRouteResult[]> {
    if (input.environment !== "staging") {
      throw new Error("MMG_STAGING_READINESS_STAGING_ONLY");
    }
    const fetcher = this.#config.fetcher ?? fetch;
    const clock = this.#config.now ?? Date.now;
    return Promise.all(
      this.#config.targets.map(async (target) => {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.#config.requestTimeoutMs,
        );
        const startedAt = clock();
        try {
          const credential = target.credential ?? "operations";
          const response = await fetcher(
            new URL(target.path, this.#config.runtimeOrigin),
            {
              method: target.method ?? "HEAD",
              redirect: "manual",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${this.#config.tokens[credential]}`,
                "X-MMG-Internal-Request": "staging-readiness-route-probe",
                "Cache-Control": "no-store",
              },
            },
          );
          return {
            path: target.path,
            method: target.method ?? "HEAD",
            statusCode: response.status,
            reachable: reachable(response.status),
            latencyMs: Math.max(0, clock() - startedAt),
            errorCode: null,
          };
        } catch (error) {
          const code =
            error instanceof DOMException && error.name === "AbortError"
              ? "ROUTE_PROBE_TIMEOUT"
              : "ROUTE_PROBE_NETWORK_FAILURE";
          return {
            path: target.path,
            method: target.method ?? "HEAD",
            statusCode: null,
            reachable: false,
            latencyMs: Math.max(0, clock() - startedAt),
            errorCode: code,
          };
        } finally {
          clearTimeout(timeout);
        }
      }),
    );
  }
}
