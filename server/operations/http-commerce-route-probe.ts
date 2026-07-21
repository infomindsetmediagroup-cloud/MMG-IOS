import type { MMGRatioSample } from "./commerce-metrics-collector.js";
import type { MMGCommerceOperationsEnvironment } from "./commerce-operations-control.js";

export interface MMGCommerceRouteProbeTarget {
  path: string;
  method?: "GET" | "HEAD" | "OPTIONS";
}

export interface MMGCommerceRouteProbeConfig {
  runtimeOrigin: string;
  internalToken: string;
  requestTimeoutMs: number;
  targets: MMGCommerceRouteProbeTarget[];
  fetcher?: typeof fetch;
}

const reachable = (status: number): boolean =>
  (status >= 200 && status < 400) || [401, 403, 405].includes(status);

export class MMGHTTPCommerceRouteProbe {
  readonly #config: MMGCommerceRouteProbeConfig;

  constructor(config: MMGCommerceRouteProbeConfig) {
    if (config.targets.length < 1) throw new Error("MMG_ROUTE_PROBE_TARGETS_REQUIRED");
    this.#config = config;
  }

  async availability(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<MMGRatioSample> {
    const fetcher = this.#config.fetcher ?? fetch;
    const checks = await Promise.all(
      this.#config.targets.map(async (target) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
        try {
          const response = await fetcher(
            new URL(target.path, this.#config.runtimeOrigin),
            {
              method: target.method ?? "HEAD",
              redirect: "manual",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${this.#config.internalToken}`,
                "X-MMG-Internal-Request": `route-probe:${input.environment}`,
                "Cache-Control": "no-store",
              },
            },
          );
          return reachable(response.status);
        } catch {
          return false;
        } finally {
          clearTimeout(timeout);
        }
      }),
    );
    return {
      successes: checks.filter(Boolean).length,
      total: checks.length,
    };
  }
}
