import { describe, expect, it } from "vitest";
import {
  evaluateMMGStagingReadiness,
  type MMGStagingReadinessSnapshot,
} from "../server/operations/staging-readiness-inspector.js";
import {
  executeMMGStagingReadinessInspection,
  type MMGStagingReadinessCommand,
} from "../server/operations/staging-readiness-service.js";
import { handleMMGStagingReadinessRequest } from "../server/operations/staging-readiness-http.js";
import { MMGHTTPStagingReadinessRouteProbe } from "../server/operations/http-staging-readiness-route-probe.js";
import {
  MMG_REQUIRED_STAGING_ADAPTERS,
  MMG_REQUIRED_STAGING_MIGRATIONS,
} from "../server/operations/staging-integration-service.js";

const releaseId = "release-staging-20260721-002";
const releaseCommitSha = "a".repeat(40);
const inspectedAt = "2026-07-21T20:00:00.000Z";

const snapshot = (): MMGStagingReadinessSnapshot => ({
  schemaVersion: "1.0.0",
  environment: "staging",
  releaseId,
  releaseCommitSha,
  configuredReleaseId: releaseId,
  configuredReleaseCommitSha: releaseCommitSha,
  runtimeOrigin: "https://staging-runtime.example.com",
  database: {
    reachable: true,
    serverVersion: "17.5",
    pgcryptoAvailable: true,
    migrationLedgerAvailable: false,
    appliedMigrationIds: [],
  },
  credentials: {
    operationsConfigured: true,
    integrationConfigured: true,
    rehearsalConfigured: true,
    rehearsalAdapterConfigured: true,
    runtimeControlConfigured: true,
    adminAuthenticationConfigured: true,
    distinctServerCredentials: true,
  },
  alerts: {
    configuredChannels: [
      "on_call_pager",
      "operations_email",
      "operations_chat",
    ],
    requiredChannels: [
      "on_call_pager",
      "operations_email",
      "operations_chat",
    ],
    destinationsUseHttps: true,
    destinationsAppearNonProduction: true,
  },
  routes: [
    {
      path: "/api/internal/commerce/staging-readiness",
      method: "HEAD",
      statusCode: 405,
      reachable: true,
      latencyMs: 12,
      errorCode: null,
    },
  ],
  heartbeats: MMG_REQUIRED_STAGING_ADAPTERS.map((adapterCode) => ({
    adapterCode,
    status: "healthy",
    releaseId,
    observedAt: "2026-07-21T19:55:00.000Z",
  })),
  controls: {
    product_publication: "disabled",
    subscription_checkout: "disabled",
    webhook_ingestion: "enabled",
    delivery_scheduler: "disabled",
    delivery_dispatcher: "disabled",
    recommendation_automation: "observe_only",
    signed_library_access: "disabled",
    thank_you_handoff: "observe_only",
  },
  rollout: {
    releaseId,
    stage: "paused",
    cohortPercentage: 0,
  },
  tooling: {
    nodeMajor: 22,
    psqlAvailable: true,
    sha256ToolAvailable: true,
    migrationRunnerPresent: true,
    releaseRegistrationPresent: true,
    workflowPresent: true,
  },
  githubEnvironment: {
    configured: true,
    requiredSecretNamesPresent: true,
  },
  publicationAllowed: false,
  liveCustomerDataAllowed: false,
  inspectedAt,
});

const command = (): MMGStagingReadinessCommand => ({
  requestId: "readiness-request-20260721-002",
  environment: "staging",
  releaseId,
  releaseCommitSha,
  tooling: snapshot().tooling,
  githubEnvironment: snapshot().githubEnvironment,
  publicationAllowed: false,
  liveCustomerDataAllowed: false,
});

describe("MMG staging readiness inspector", () => {
  it("allows a pre-execution report when the database is ready but migrations are not yet applied", () => {
    const report = evaluateMMGStagingReadiness(snapshot());
    expect(report.ready).toBe(true);
    expect(report.blockerCount).toBe(0);
    expect(report.warningCount).toBe(2);
    expect(report.checks.find((entry) => entry.code === "MIGRATIONS_RECONCILED")?.status).toBe(
      "warning",
    );
    expect(report.publicationAllowed).toBe(false);
    expect(report.liveCustomerDataAllowed).toBe(false);
  });

  it("blocks an unavailable route, stale provider heartbeat, and unsafe checkout control", () => {
    const value = snapshot();
    value.routes[0] = {
      ...value.routes[0],
      statusCode: 404,
      reachable: false,
      errorCode: "ROUTE_NOT_FOUND",
    };
    value.heartbeats[0] = {
      ...value.heartbeats[0],
      observedAt: "2026-07-21T19:00:00.000Z",
    };
    value.controls.subscription_checkout = "enabled";
    const report = evaluateMMGStagingReadiness(value);
    expect(report.ready).toBe(false);
    expect(report.checks.find((entry) => entry.code.startsWith("RUNTIME_ROUTE:"))?.status).toBe(
      "failed",
    );
    expect(report.checks.find((entry) => entry.code === "ADAPTER_READY:database")?.status).toBe(
      "failed",
    );
    expect(
      report.checks.find(
        (entry) => entry.code === "SAFE_CONTROL:subscription_checkout",
      )?.status,
    ).toBe("failed");
  });

  it("requires the staging integrator role and preserves the read-only safety contract", async () => {
    await expect(
      executeMMGStagingReadinessInspection({
        command: command(),
        principal: { actorId: "unauthorized", roles: [] },
        dependencies: {
          gateway: { async inspect() { return snapshot(); } },
          now: () => new Date(inspectedAt),
        },
      }),
    ).rejects.toThrow("MMG_STAGING_READINESS_ROLE_REQUIRED");

    await expect(
      executeMMGStagingReadinessInspection({
        command: command(),
        principal: {
          actorId: "staging-integrator",
          roles: ["mmg-commerce-staging-integrator"],
        },
        dependencies: {
          gateway: {
            async inspect() {
              return { ...snapshot(), publicationAllowed: true as false };
            },
          },
          now: () => new Date(inspectedAt),
        },
      }),
    ).rejects.toThrow("MMG_STAGING_READINESS_GATEWAY_SAFETY_VIOLATION");
  });

  it("accepts mounted private routes and rejects missing routes", async () => {
    const statuses = [200, 302, 401, 403, 405, 404, 500];
    let index = 0;
    const probe = new MMGHTTPStagingReadinessRouteProbe({
      runtimeOrigin: "https://staging-runtime.example.com",
      requestTimeoutMs: 1000,
      tokens: {
        operations: "o".repeat(32),
        integration: "i".repeat(32),
        rehearsal: "r".repeat(32),
        rehearsalAdapter: "a".repeat(32),
        runtimeControl: "c".repeat(32),
      },
      targets: statuses.map((status) => ({ path: `/api/test/${status}` })),
      fetcher: async () => new Response(null, { status: statuses[index++] }),
      now: (() => {
        let clock = 0;
        return () => ++clock;
      })(),
    });
    const results = await probe.inspect({ environment: "staging" });
    expect(results.slice(0, 5).every((entry) => entry.reachable)).toBe(true);
    expect(results.slice(5).every((entry) => !entry.reachable)).toBe(true);
  });

  it("returns a private sanitized HTTP report", async () => {
    const request = new Request(
      "https://staging-runtime.example.com/api/internal/commerce/staging-readiness",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test",
          Origin: "https://staging-runtime.example.com",
          "Content-Type": "application/json",
          "X-MMG-Internal-Request": "test",
        },
        body: JSON.stringify(command()),
      },
    );
    const response = await handleMMGStagingReadinessRequest(request, {
      authenticator: {
        async authenticate() {
          return {
            actorId: "staging-integrator",
            roles: ["mmg-commerce-staging-integrator"],
          };
        },
      },
      allowedOrigins: new Set(["https://staging-runtime.example.com"]),
      gateway: { async inspect() { return snapshot(); } },
      now: () => new Date(inspectedAt),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as {
      ok: boolean;
      report: { ready: boolean; publicationAllowed: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.report.ready).toBe(true);
    expect(body.report.publicationAllowed).toBe(false);
  });

  it("recognizes the canonical migration set when already reconciled", () => {
    const value = snapshot();
    value.database.migrationLedgerAvailable = true;
    value.database.appliedMigrationIds = [...MMG_REQUIRED_STAGING_MIGRATIONS];
    const report = evaluateMMGStagingReadiness(value);
    expect(report.warningCount).toBe(0);
    expect(report.checks.find((entry) => entry.code === "MIGRATIONS_RECONCILED")?.status).toBe(
      "passed",
    );
  });
});
