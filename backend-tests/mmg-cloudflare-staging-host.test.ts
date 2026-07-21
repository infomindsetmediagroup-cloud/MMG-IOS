import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { MMGSQLExecutor } from "../server/knowledge-library/persistence.js";
import { buildMMGCloudflareCommerceStagingHost } from "../server/runtime/cloudflare-commerce-staging-host.js";
import { MMGCloudflareStagingAdminAuthenticator } from "../server/runtime/cloudflare-staging-admin-auth.js";
import { MMGCloudflareHyperdriveDatabase } from "../server/runtime/cloudflare-hyperdrive-postgres.js";
import {
  MMGCloudflareStagingProviderHeartbeatCoordinator,
  parseMMGStagingProviderTargets,
} from "../server/runtime/cloudflare-staging-provider-heartbeats.js";

const execFileAsync = promisify(execFile);
const token = (character: string) => character.repeat(40);

const environment = () => ({
  HYPERDRIVE: {
    connectionString: "postgres://user:password@database.internal:5432/mmg_staging",
  },
  MMG_COMMERCE_ENVIRONMENT: "staging",
  MMG_COMMERCE_RELEASE_ID: "release-staging-20260721-002",
  MMG_COMMERCE_RELEASE_COMMIT_SHA: "a".repeat(40),
  MMG_COMMERCE_RUNTIME_ORIGIN:
    "https://mmg-commerce-staging.example.workers.dev",
  MMG_COMMERCE_REQUEST_TIMEOUT_MS: "8000",
  MMG_COMMERCE_ROUTE_PROBE_PATHS:
    "/api/internal/commerce/staging-readiness,/api/internal/commerce/staging-integration",
  MMG_COMMERCE_ALERT_DESTINATIONS:
    "on_call_pager=https://alerts.example.test/pager,operations_email=https://alerts.example.test/email,operations_chat=https://alerts.example.test/chat",
  MMG_COMMERCE_MONITOR_ENABLED: "false",
  MMG_COMMERCE_STAGING_OPERATIONS_TOKEN: token("o"),
  MMG_COMMERCE_STAGING_REHEARSAL_TOKEN: token("r"),
  MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN: token("a"),
  MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN: token("c"),
  MMG_COMMERCE_STAGING_INTEGRATION_TOKEN: token("i"),
  MMG_COMMERCE_STAGING_ADMIN_DASHBOARD_TOKEN: token("d"),
  MMG_COMMERCE_STAGING_PROVIDER_HEALTH_TOKEN: token("p"),
});

describe("MMG Cloudflare commerce staging host", () => {
  it("serves a safe exact-release health response without database access", async () => {
    const host = buildMMGCloudflareCommerceStagingHost(environment());
    const response = await host.fetch(
      new Request("https://mmg-commerce-staging.example.workers.dev/healthz"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-mmg-release-id")).toBe(
      "release-staging-20260721-002",
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      environment: "staging",
      releaseId: "release-staging-20260721-002",
      releaseCommitSha: "a".repeat(40),
      upstreamConfigured: false,
      publicationAllowed: false,
      liveCustomerDataAllowed: false,
    });
  });

  it("rejects a production environment and invalid Hyperdrive bindings", () => {
    expect(() =>
      buildMMGCloudflareCommerceStagingHost({
        ...environment(),
        MMG_COMMERCE_ENVIRONMENT: "production",
      }),
    ).toThrow("MMG_STAGING_HOST_STAGING_ONLY");
    expect(
      () =>
        new MMGCloudflareHyperdriveDatabase({
          connectionString: "https://not-postgres.example.test",
        }),
    ).toThrow("MMG_HYPERDRIVE_POSTGRES_REQUIRED");
  });

  it("keeps Admin dashboard authentication separate and constant-time comparable", async () => {
    const authenticator = new MMGCloudflareStagingAdminAuthenticator(token("d"));
    await expect(
      authenticator.authenticate(
        new Request("https://runtime.example.test/api/admin/commerce/operations", {
          headers: { Authorization: `Bearer ${token("d")}` },
        }),
      ),
    ).resolves.toMatchObject({
      actorId: "staging-commerce-admin",
      roles: ["mmg-commerce-operator"],
    });
    await expect(
      authenticator.authenticate(
        new Request("https://runtime.example.test/api/admin/commerce/operations", {
          headers: { Authorization: `Bearer ${token("x")}` },
        }),
      ),
    ).resolves.toBeNull();
  });

  it("forwards application routes only through the configured staging upstream", async () => {
    const host = buildMMGCloudflareCommerceStagingHost({
      ...environment(),
      MMG_COMMERCE_UPSTREAM: {
        async fetch(request: Request) {
          return Response.json(
            {
              ok: true,
              upstreamPath: new URL(request.url).pathname,
              environment: "staging",
            },
            { status: 401 },
          );
        },
      },
    });
    const response = await host.fetch(
      new Request(
        "https://mmg-commerce-staging.example.workers.dev/api/knowledge-library/picker",
      ),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("x-mmg-upstream-routed")).toBe("true");
    expect(response.headers.get("x-mmg-publication-allowed")).toBe("false");
    await expect(response.json()).resolves.toMatchObject({
      upstreamPath: "/api/knowledge-library/picker",
      environment: "staging",
    });
  });

  it("rejects unauthenticated provider-heartbeat refresh before database access", async () => {
    const host = buildMMGCloudflareCommerceStagingHost(environment());
    const response = await host.fetch(
      new Request(
        "https://mmg-commerce-staging.example.workers.dev/api/internal/commerce/provider-heartbeats/refresh",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token("x")}`,
            "X-MMG-Internal-Request": "test",
          },
        },
      ),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "MMG_HEARTBEAT_AUTH_REQUIRED" },
    });
  });

  it("records only exact-release remote provider health as healthy", async () => {
    const recorded: Array<{ adapterCode: string; status: string }> = [];
    const database: MMGSQLExecutor = {
      async query<Row extends Record<string, unknown>>(text: string) {
        if (text.includes("SELECT 1::integer")) {
          return { rows: [{ ok: 1 }] as unknown as Row[], rowCount: 1 };
        }
        return {
          rows: [{ control_count: "8" }] as unknown as Row[],
          rowCount: 1,
        };
      },
    };
    const coordinator = new MMGCloudflareStagingProviderHeartbeatCoordinator({
      database,
      runtime: {
        async recordAdapterHeartbeat(input) {
          recorded.push({
            adapterCode: input.adapterCode,
            status: input.status,
          });
        },
      },
      releaseId: "release-staging-20260721-002",
      runtimeOrigin: "https://runtime.example.test",
      runtimeProbeToken: token("i"),
      adminTokenConfigured: true,
      targets: parseMMGStagingProviderTargets({
        alertEndpoint: "https://provider.example.test/alerts",
        schedulerEndpoint: "https://provider.example.test/scheduler",
        dispatcherEndpoint: "https://provider.example.test/dispatcher",
        storageSignerEndpoint: "https://provider.example.test/storage",
        providerToken: token("p"),
      }),
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("staging-readiness")) {
          return new Response(null, { status: 405 });
        }
        const mismatch = url.includes("dispatcher");
        return Response.json(
          {
            ok: true,
            releaseId: mismatch
              ? "another-release-20260721-002"
              : "release-staging-20260721-002",
          },
          { status: 200 },
        );
      },
      now: () => new Date("2026-07-21T21:00:00.000Z"),
    });
    const summary = await coordinator.refresh();
    expect(summary.results).toHaveLength(8);
    expect(
      summary.results.find((entry) => entry.adapterCode === "dispatcher"),
    ).toMatchObject({ status: "degraded" });
    expect(
      summary.results.find((entry) => entry.adapterCode === "storage_signer"),
    ).toMatchObject({ status: "healthy" });
    expect(recorded).toHaveLength(8);
  });

  it("generates a staging-only Wrangler config with Hyperdrive, service binding, and required secrets", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "mmg-staging-host-"));
    const output = path.join(directory, "wrangler.jsonc");
    try {
      await execFileAsync(
        process.execPath,
        ["scripts/mmg-build-commerce-staging-wrangler.mjs"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MMG_COMMERCE_RELEASE_ID: "release-staging-20260721-002",
            MMG_COMMERCE_RELEASE_COMMIT_SHA: "a".repeat(40),
            MMG_CLOUDFLARE_STAGING_HYPERDRIVE_ID:
              "12345678-1234-1234-1234-123456789abc",
            MMG_CLOUDFLARE_STAGING_UPSTREAM_SERVICE:
              "mmg-commerce-api-staging",
            MMG_COMMERCE_STAGING_RUNTIME_ORIGIN:
              "https://mmg-commerce-staging.example.workers.dev",
            MMG_STAGING_WRANGLER_OUTPUT: output,
          },
        },
      );
      const config = JSON.parse(await readFile(output, "utf8"));
      expect(config.name).toBe("mmg-commerce-staging");
      expect(config.compatibility_flags).toContain("nodejs_compat");
      expect(config.hyperdrive).toEqual([
        {
          binding: "HYPERDRIVE",
          id: "12345678-1234-1234-1234-123456789abc",
        },
      ]);
      expect(config.services).toEqual([
        {
          binding: "MMG_COMMERCE_UPSTREAM",
          service: "mmg-commerce-api-staging",
        },
      ]);
      expect(config.secrets.required).toHaveLength(8);
      expect(config.vars).toMatchObject({
        MMG_COMMERCE_ENVIRONMENT: "staging",
        MMG_COMMERCE_MONITOR_ENABLED: "false",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
