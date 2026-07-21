import { describe, expect, it, vi } from "vitest";
import { MMGCompositeCommerceMetricsAdapter } from "../server/operations/commerce-metrics-collector.js";

const now = new Date("2026-07-20T23:00:00.000Z");

describe("MMG composite commerce metrics collector", () => {
  it("normalizes authoritative telemetry into every governed signal", async () => {
    const adapter = new MMGCompositeCommerceMetricsAdapter({
      infrastructure: {
        databaseConnectivity: vi.fn().mockResolvedValue({ successes: 10, total: 10 }),
        runtimeRouteAvailability: vi.fn().mockResolvedValue({ successes: 10, total: 10 }),
      },
      webhooks: {
        failureRate: vi.fn().mockResolvedValue({ failures: 1, total: 100, windowSeconds: 900 }),
        oldestProcessingAgeSeconds: vi.fn().mockResolvedValue(30),
        reconciliationLagSeconds: vi.fn().mockResolvedValue(45),
      },
      delivery: {
        schedulerLastSuccessAgeSeconds: vi.fn().mockResolvedValue(60),
        dispatcherBacklogCount: vi.fn().mockResolvedValue(2),
        dispatcherFailureRate: vi.fn().mockResolvedValue({ failures: 0, total: 100, windowSeconds: 900 }),
        recoveryRequiredRate: vi.fn().mockResolvedValue({ failures: 1, total: 100, windowSeconds: 86400 }),
      },
      access: {
        signedAccessFailureRate: vi.fn().mockResolvedValue({ failures: 0, total: 100, windowSeconds: 900 }),
      },
      consistency: {
        entitlementConsistencyFailureCount: vi.fn().mockResolvedValue(0),
        ownershipDuplicateConflictCount: vi.fn().mockResolvedValue(0),
      },
      verification: {
        e2eEvidenceAgeSeconds: vi.fn().mockResolvedValue(3600),
      },
    });

    const metrics = await adapter.collect({
      environment: "staging",
      releaseId: "release-staging-12345678",
      occurredAt: now,
    });
    expect(metrics).toHaveLength(13);
    expect(metrics.find((entry) => entry.code === "database_connectivity_ratio")?.value).toBe(1);
    expect(metrics.find((entry) => entry.code === "webhook_delivery_failure_rate")?.value).toBe(0.01);
    expect(metrics.every((entry) => entry.observedAt === now.toISOString())).toBe(true);
  });

  it("returns an invalid numeric signal when a rate has no sample", async () => {
    const adapter = new MMGCompositeCommerceMetricsAdapter({
      infrastructure: {
        databaseConnectivity: vi.fn().mockResolvedValue({ successes: 0, total: 0 }),
        runtimeRouteAvailability: vi.fn().mockResolvedValue({ successes: 0, total: 0 }),
      },
      webhooks: {
        failureRate: vi.fn().mockResolvedValue({ failures: 0, total: 0, windowSeconds: 900 }),
        oldestProcessingAgeSeconds: vi.fn().mockResolvedValue(0),
        reconciliationLagSeconds: vi.fn().mockResolvedValue(0),
      },
      delivery: {
        schedulerLastSuccessAgeSeconds: vi.fn().mockResolvedValue(0),
        dispatcherBacklogCount: vi.fn().mockResolvedValue(0),
        dispatcherFailureRate: vi.fn().mockResolvedValue({ failures: 0, total: 0, windowSeconds: 900 }),
        recoveryRequiredRate: vi.fn().mockResolvedValue({ failures: 0, total: 0, windowSeconds: 86400 }),
      },
      access: {
        signedAccessFailureRate: vi.fn().mockResolvedValue({ failures: 0, total: 0, windowSeconds: 900 }),
      },
      consistency: {
        entitlementConsistencyFailureCount: vi.fn().mockResolvedValue(0),
        ownershipDuplicateConflictCount: vi.fn().mockResolvedValue(0),
      },
      verification: { e2eEvidenceAgeSeconds: vi.fn().mockResolvedValue(0) },
    });
    const metrics = await adapter.collect({
      environment: "staging",
      releaseId: null,
      occurredAt: now,
    });
    expect(Number.isNaN(metrics[0].value)).toBe(true);
    expect(metrics[0].sampleSize).toBe(0);
  });
});
