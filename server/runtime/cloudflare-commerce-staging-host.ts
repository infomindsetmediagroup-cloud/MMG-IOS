import { createHash } from "node:crypto";
import { parseMMGCommerceProductionAdapterConfig } from "../operations/production-adapter-config.js";
import { parseMMGStagingIntegrationTokens } from "../operations/staging-integration-config.js";
import { buildMMGStagingIntegrationRuntime } from "../operations/staging-integration-runtime.js";
import { MMGCloudflareHyperdriveDatabase } from "./cloudflare-hyperdrive-postgres.js";
import { MMGCloudflareStagingAdminAuthenticator } from "./cloudflare-staging-admin-auth.js";
import {
  MMGCloudflareStagingProviderHeartbeatCoordinator,
  parseMMGStagingProviderTargets,
} from "./cloudflare-staging-provider-heartbeats.js";

export interface MMGCloudflareHyperdriveEnvBinding {
  connectionString: string;
}

export interface MMGCloudflareWorkerServiceBinding {
  fetch(request: Request): Promise<Response>;
}

export interface MMGCloudflareCommerceStagingEnvironment {
  HYPERDRIVE: MMGCloudflareHyperdriveEnvBinding;
  MMG_COMMERCE_UPSTREAM?: MMGCloudflareWorkerServiceBinding;
  MMG_COMMERCE_ENVIRONMENT: string;
  MMG_COMMERCE_RELEASE_ID: string;
  MMG_COMMERCE_RELEASE_COMMIT_SHA: string;
  MMG_COMMERCE_RUNTIME_ORIGIN: string;
  MMG_COMMERCE_REQUEST_TIMEOUT_MS?: string;
  MMG_COMMERCE_ROUTE_PROBE_PATHS?: string;
  MMG_COMMERCE_ALERT_DESTINATIONS: string;
  MMG_COMMERCE_MONITOR_ENABLED?: string;
  MMG_COMMERCE_STAGING_OPERATIONS_TOKEN: string;
  MMG_COMMERCE_STAGING_REHEARSAL_TOKEN: string;
  MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN: string;
  MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN: string;
  MMG_COMMERCE_STAGING_INTEGRATION_TOKEN: string;
  MMG_COMMERCE_STAGING_ADMIN_DASHBOARD_TOKEN: string;
  MMG_COMMERCE_STAGING_PROVIDER_HEALTH_TOKEN?: string;
  MMG_COMMERCE_ALERT_HEALTH_ENDPOINT?: string;
  MMG_COMMERCE_SCHEDULER_HEALTH_ENDPOINT?: string;
  MMG_COMMERCE_DISPATCHER_HEALTH_ENDPOINT?: string;
  MMG_COMMERCE_STORAGE_SIGNER_HEALTH_ENDPOINT?: string;
}

export interface MMGCloudflareCommerceStagingHost {
  releaseId: string;
  releaseCommitSha: string;
  fetch(request: Request): Promise<Response>;
  scheduled(cron: string): Promise<void>;
}

const HEARTBEAT_REFRESH_PATH =
  "/api/internal/commerce/provider-heartbeats/refresh";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const releaseCommit = (value: string): string => {
  const normalized = value.trim();
  if (!/^[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("MMG_STAGING_HOST_COMMIT_SHA_INVALID");
  }
  return normalized;
};

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

const bearer = (request: Request): string => {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
};

const safeHealth = (input: {
  releaseId: string;
  releaseCommitSha: string;
  runtimeOrigin: string;
  upstreamConfigured: boolean;
}): Response =>
  Response.json(
    {
      ok: true,
      service: "mmg-commerce-staging",
      environment: "staging",
      releaseId: input.releaseId,
      releaseCommitSha: input.releaseCommitSha,
      runtimeOrigin: input.runtimeOrigin,
      upstreamConfigured: input.upstreamConfigured,
      publicationAllowed: false,
      liveCustomerDataAllowed: false,
    },
    {
      headers: {
        "Cache-Control": "no-store, private, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-MMG-Release-Id": input.releaseId,
        "X-MMG-Release-Commit": input.releaseCommitSha,
      },
    },
  );

const stampResponse = (
  response: Response,
  input: {
    releaseId: string;
    releaseCommitSha: string;
    upstream: boolean;
  },
): Response => {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Release-Id", input.releaseId);
  headers.set("X-MMG-Release-Commit", input.releaseCommitSha);
  headers.set("X-MMG-Publication-Allowed", "false");
  headers.set("X-MMG-Upstream-Routed", input.upstream ? "true" : "false");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const buildMMGCloudflareCommerceStagingHost = (
  environment: MMGCloudflareCommerceStagingEnvironment,
  options: { fetcher?: typeof fetch; now?: () => Date } = {},
): MMGCloudflareCommerceStagingHost => {
  if (environment.MMG_COMMERCE_ENVIRONMENT !== "staging") {
    throw new Error("MMG_STAGING_HOST_STAGING_ONLY");
  }
  const releaseCommitSha = releaseCommit(
    environment.MMG_COMMERCE_RELEASE_COMMIT_SHA,
  );
  const tokens = parseMMGStagingIntegrationTokens(environment);
  const config = parseMMGCommerceProductionAdapterConfig({
    MMG_COMMERCE_ENVIRONMENT: "staging",
    MMG_COMMERCE_RELEASE_ID: environment.MMG_COMMERCE_RELEASE_ID,
    MMG_COMMERCE_RUNTIME_ORIGIN: environment.MMG_COMMERCE_RUNTIME_ORIGIN,
    MMG_COMMERCE_INTERNAL_TOKEN: tokens.operations,
    MMG_COMMERCE_REQUEST_TIMEOUT_MS:
      environment.MMG_COMMERCE_REQUEST_TIMEOUT_MS,
    MMG_COMMERCE_ROUTE_PROBE_PATHS:
      environment.MMG_COMMERCE_ROUTE_PROBE_PATHS,
    MMG_COMMERCE_ALERT_DESTINATIONS:
      environment.MMG_COMMERCE_ALERT_DESTINATIONS,
  });
  const database = new MMGCloudflareHyperdriveDatabase(environment.HYPERDRIVE, {
    applicationName: `mmg-commerce-staging-${config.releaseId}`.slice(0, 63),
    statementTimeoutMs: 15_000,
    connectionTimeoutMs: config.requestTimeoutMs,
  });
  const adminTokenConfigured =
    environment.MMG_COMMERCE_STAGING_ADMIN_DASHBOARD_TOKEN.trim().length >= 32;
  const adminAuthenticator = new MMGCloudflareStagingAdminAuthenticator(
    environment.MMG_COMMERCE_STAGING_ADMIN_DASHBOARD_TOKEN,
  );
  const runtime = buildMMGStagingIntegrationRuntime({
    config,
    releaseCommitSha,
    tokens,
    database,
    dashboardAuthenticator: adminAuthenticator,
    adminAuthenticationConfigured: adminTokenConfigured,
    alertEnvironmentLabel: "staging",
    alertHasher: {
      async sha256(value: string) {
        return sha256(value);
      },
    },
    hashPayloadSync(value: unknown) {
      return sha256(JSON.stringify(value));
    },
    fetcher: options.fetcher,
    now: options.now,
  });
  const providerTargets = parseMMGStagingProviderTargets({
    alertEndpoint: environment.MMG_COMMERCE_ALERT_HEALTH_ENDPOINT,
    schedulerEndpoint: environment.MMG_COMMERCE_SCHEDULER_HEALTH_ENDPOINT,
    dispatcherEndpoint: environment.MMG_COMMERCE_DISPATCHER_HEALTH_ENDPOINT,
    storageSignerEndpoint:
      environment.MMG_COMMERCE_STORAGE_SIGNER_HEALTH_ENDPOINT,
    providerToken: environment.MMG_COMMERCE_STAGING_PROVIDER_HEALTH_TOKEN,
  });
  const heartbeatCoordinator =
    new MMGCloudflareStagingProviderHeartbeatCoordinator({
      database,
      runtime,
      releaseId: config.releaseId,
      runtimeOrigin: config.runtimeOrigin,
      runtimeProbeToken: tokens.integration,
      adminTokenConfigured,
      targets: providerTargets,
      fetcher: options.fetcher,
      timeoutMs: config.requestTimeoutMs,
      now: options.now,
    });

  return {
    releaseId: config.releaseId,
    releaseCommitSha,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const pathname = url.pathname;
      if (pathname === "/healthz" || pathname === "/api/internal/healthz") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response(null, {
            status: 405,
            headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
          });
        }
        const response = safeHealth({
          releaseId: config.releaseId,
          releaseCommitSha,
          runtimeOrigin: config.runtimeOrigin,
          upstreamConfigured: Boolean(environment.MMG_COMMERCE_UPSTREAM),
        });
        return request.method === "HEAD"
          ? new Response(null, {
              status: response.status,
              headers: response.headers,
            })
          : response;
      }
      if (pathname === HEARTBEAT_REFRESH_PATH) {
        if (request.method !== "POST") {
          return new Response(null, {
            status: 405,
            headers: { Allow: "POST", "Cache-Control": "no-store" },
          });
        }
        if (!request.headers.get("x-mmg-internal-request")) {
          return Response.json(
            { ok: false, error: { code: "MMG_INTERNAL_MARKER_REQUIRED" } },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          );
        }
        const origin = request.headers.get("origin");
        if (origin && origin !== config.runtimeOrigin) {
          return Response.json(
            { ok: false, error: { code: "MMG_HEARTBEAT_ORIGIN_FORBIDDEN" } },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          );
        }
        if (!tokenEquals(bearer(request), tokens.integration)) {
          return Response.json(
            { ok: false, error: { code: "MMG_HEARTBEAT_AUTH_REQUIRED" } },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          );
        }
        const summary = await heartbeatCoordinator.refresh();
        const healthy = summary.results.every(
          (entry) => entry.status === "healthy",
        );
        return Response.json(
          {
            ok: healthy,
            status: healthy ? "healthy" : "blocked",
            summary,
            publicationAllowed: false,
            liveCustomerDataAllowed: false,
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store, private, max-age=0",
              "X-Content-Type-Options": "nosniff",
              "X-MMG-Release-Id": config.releaseId,
            },
          },
        );
      }
      const routed = await runtime.route(request);
      if (routed) {
        return stampResponse(routed, {
          releaseId: config.releaseId,
          releaseCommitSha,
          upstream: false,
        });
      }
      if (environment.MMG_COMMERCE_UPSTREAM) {
        const upstreamResponse = await environment.MMG_COMMERCE_UPSTREAM.fetch(
          request.clone(),
        );
        return stampResponse(upstreamResponse, {
          releaseId: config.releaseId,
          releaseCommitSha,
          upstream: true,
        });
      }
      return Response.json(
        {
          ok: false,
          error: { code: "MMG_STAGING_ROUTE_NOT_FOUND" },
          publicationAllowed: false,
          liveCustomerDataAllowed: false,
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, private, max-age=0",
            "X-Content-Type-Options": "nosniff",
            "X-MMG-Release-Id": config.releaseId,
          },
        },
      );
    },
    async scheduled(cron: string): Promise<void> {
      if (environment.MMG_COMMERCE_MONITOR_ENABLED !== "true") return;
      await heartbeatCoordinator.refresh();
      const requestId = `cloudflare-scheduled:${cron}:${Date.now()}`.slice(
        0,
        128,
      );
      const response = await runtime.runScheduledEvaluation(requestId);
      if (!response.ok) {
        throw new Error(
          `MMG_STAGING_SCHEDULED_EVALUATION_FAILED:${response.status}`,
        );
      }
    },
  };
};
