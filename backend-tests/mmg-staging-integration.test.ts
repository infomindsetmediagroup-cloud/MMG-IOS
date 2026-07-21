import { describe, expect, it } from "vitest";
import {
  executeMMGStagingIntegrationCommand,
  MMG_REQUIRED_STAGING_ADAPTERS,
  MMG_REQUIRED_STAGING_MIGRATIONS,
  stagingIntegrationBlockers,
  type MMGStagingIntegrationCommand,
  type MMGStagingIntegrationRepository,
  type MMGStagingIntegrationSnapshot,
} from "../server/operations/staging-integration-service.js";
import {
  parseMMGStagingIntegrationTokens,
  redactMMGStagingIntegrationTokens,
} from "../server/operations/staging-integration-config.js";
import { MMGPostgresStagingRuntimePolicy } from "../server/operations/staging-runtime-policy.js";
import type { MMGSQLExecutor } from "../server/knowledge-library/persistence.js";

const snapshot = (): MMGStagingIntegrationSnapshot => ({
  schemaVersion: "1.0.0",
  environment: "staging",
  releaseId: "release-staging-20260721-001",
  releaseCommitSha: "a".repeat(40),
  migrationIds: [...MMG_REQUIRED_STAGING_MIGRATIONS],
  routeProbe: { successes: 17, total: 17 },
  heartbeats: MMG_REQUIRED_STAGING_ADAPTERS.map((adapterCode) => ({
    adapterCode,
    status: "healthy",
    releaseId: "release-staging-20260721-001",
    observedAt: "2026-07-21T20:00:00.000Z",
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
    releaseId: "release-staging-20260721-001",
    stage: "paused",
    cohortPercentage: 0,
  },
  rehearsalEvidencePassed: true,
  publicationAllowed: false,
  liveCustomerDataAllowed: false,
  inspectedAt: "2026-07-21T20:00:00.000Z",
});

class MemoryIntegrationRepository implements MMGStagingIntegrationRepository {
  claims = 0;
  completed: string[] = [];
  failures: string[] = [];

  async claim() {
    this.claims += 1;
    return "claimed" as const;
  }

  async complete(input: { status: "planned" | "verified" }) {
    this.completed.push(input.status);
  }

  async fail(input: { errorCode: string }) {
    this.failures.push(input.errorCode);
  }
}

const command = (
  action: MMGStagingIntegrationCommand["action"],
): MMGStagingIntegrationCommand => ({
  requestId: `request-staging-${action}`,
  integrationRunId: "integration-run-20260721-001",
  releaseId: "release-staging-20260721-001",
  releaseCommitSha: "a".repeat(40),
  action,
});

describe("MMG staging integration", () => {
  it("accepts a complete safe paused staging snapshot", () => {
    expect(stagingIntegrationBlockers(snapshot())).toEqual([]);
  });

  it("fails closed for a missing migration, unsafe control, release-mismatched heartbeat, and missing rehearsal evidence", () => {
    const value = snapshot();
    value.migrationIds = value.migrationIds.slice(0, -1);
    value.controls.subscription_checkout = "enabled";
    value.heartbeats[0] = {
      ...value.heartbeats[0],
      releaseId: "another-release-20260721-001",
    };
    value.rehearsalEvidencePassed = false;
    expect(stagingIntegrationBlockers(value)).toContain(
      "MISSING_MIGRATION:20260721_011_mmg_staging_integration_execution",
    );
    expect(stagingIntegrationBlockers(value)).toContain(
      "UNSAFE_CONTROL:subscription_checkout",
    );
    expect(stagingIntegrationBlockers(value)).toContain(
      "ADAPTER_RELEASE_MISMATCH:database",
    );
    expect(stagingIntegrationBlockers(value)).toContain(
      "STAGING_REHEARSAL_EVIDENCE_REQUIRED",
    );
  });

  it("bootstraps then inspects without publishing or exposing live customer data", async () => {
    const repository = new MemoryIntegrationRepository();
    let bootstrapped = false;
    const result = await executeMMGStagingIntegrationCommand({
      command: command("bootstrap"),
      principal: {
        actorId: "staging-integrator-1",
        roles: ["mmg-commerce-staging-integrator"],
      },
      dependencies: {
        repository,
        gateway: {
          async bootstrapSafeState() {
            bootstrapped = true;
          },
          async inspect() {
            return snapshot();
          },
        },
        now: () => new Date("2026-07-21T20:00:00.000Z"),
      },
    });
    expect(bootstrapped).toBe(true);
    expect(result.status).toBe(200);
    expect(repository.completed).toEqual(["planned"]);
    expect(
      (result.body.snapshot as MMGStagingIntegrationSnapshot).publicationAllowed,
    ).toBe(false);
  });

  it("blocks verification when required staging evidence is absent", async () => {
    const repository = new MemoryIntegrationRepository();
    await expect(
      executeMMGStagingIntegrationCommand({
        command: command("verify"),
        principal: {
          actorId: "staging-integrator-1",
          roles: ["mmg-commerce-staging-integrator"],
        },
        dependencies: {
          repository,
          gateway: {
            async bootstrapSafeState() {},
            async inspect() {
              const value = snapshot();
              value.rehearsalEvidencePassed = false;
              return value;
            },
          },
          now: () => new Date("2026-07-21T20:00:00.000Z"),
        },
      }),
    ).rejects.toThrow("MMG_STAGING_INTEGRATION_BLOCKED");
    expect(repository.failures).toEqual(["MMG_STAGING_INTEGRATION_BLOCKED"]);
  });

  it("requires five distinct staging credentials and redacts their values", () => {
    const tokens = parseMMGStagingIntegrationTokens({
      MMG_COMMERCE_STAGING_OPERATIONS_TOKEN: "o".repeat(32),
      MMG_COMMERCE_STAGING_REHEARSAL_TOKEN: "r".repeat(32),
      MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN: "a".repeat(32),
      MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN: "c".repeat(32),
      MMG_COMMERCE_STAGING_INTEGRATION_TOKEN: "i".repeat(32),
    });
    expect(redactMMGStagingIntegrationTokens(tokens)).toEqual({
      operationsConfigured: true,
      rehearsalConfigured: true,
      rehearsalAdapterConfigured: true,
      runtimeControlConfigured: true,
      integrationConfigured: true,
      distinctCredentials: true,
    });
    expect(() =>
      parseMMGStagingIntegrationTokens({
        MMG_COMMERCE_STAGING_OPERATIONS_TOKEN: "x".repeat(32),
        MMG_COMMERCE_STAGING_REHEARSAL_TOKEN: "x".repeat(32),
        MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN: "a".repeat(32),
        MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN: "c".repeat(32),
        MMG_COMMERCE_STAGING_INTEGRATION_TOKEN: "i".repeat(32),
      }),
    ).toThrow("MMG_STAGING_INTEGRATION_TOKENS_MUST_BE_DISTINCT");
  });

  it("uses hashed references and deterministic release-bound rollout buckets", async () => {
    const database: MMGSQLExecutor = {
      async query<Row extends Record<string, unknown>>(text: string) {
        if (text.includes("mmg_staging_runtime_controls")) {
          return {
            rows: [
              {
                control_code: "subscription_checkout",
                mode: "enabled",
                version: 1,
              },
            ] as unknown as Row[],
            rowCount: 1,
          };
        }
        return {
          rows: [
            {
              release_id: "release-staging-20260721-001",
              stage: "pilot",
              cohort_percentage: 5,
              version: 1,
            },
          ] as unknown as Row[],
          rowCount: 1,
        };
      },
    };
    const policy = new MMGPostgresStagingRuntimePolicy({
      database,
      hasher: {
        async sha256() {
          return "0".repeat(64);
        },
      },
    });
    await expect(
      policy.allows({
        control: "subscription_checkout",
        customerReferenceHash: "f".repeat(64),
      }),
    ).resolves.toBe(true);
    await expect(
      policy.allows({
        control: "subscription_checkout",
        customerReferenceHash: "raw-customer-id",
      }),
    ).resolves.toBe(false);
  });
});
