import { describe, expect, it, vi } from "vitest";
import {
  executeMMGCommerceOperationsCommand,
  type MMGCommerceIncidentRecord,
  type MMGCommerceOperationsDependencies,
  type MMGCommerceOperationsState,
} from "../server/operations/commerce-operations-service.js";

const now = new Date("2026-07-20T23:00:00.000Z");

const baseState = (): MMGCommerceOperationsState => ({
  environment: "staging",
  latestHealth: null,
  latestConsistencyAudit: null,
  rollout: {
    environment: "staging",
    releaseId: "release-staging-12345678",
    stage: "pilot",
    cohortPercentage: 5,
    enteredAt: "2026-07-19T00:00:00.000Z",
    observationUntil: null,
    version: 1,
    status: "active",
  },
  controls: [],
  openIncidents: [],
  freshE2EPassed: true,
});

const incident: MMGCommerceIncidentRecord = {
  incidentId: "incident:staging:database_connectivity_ratio",
  environment: "staging",
  signalCode: "database_connectivity_ratio",
  severity: "SEV1",
  state: "detected",
  title: "Commerce database connectivity",
  summary: "Database health breached policy.",
  firstSeenAt: now.toISOString(),
  lastSeenAt: now.toISOString(),
  version: 1,
};

const dependencies = (): MMGCommerceOperationsDependencies => {
  const state = baseState();
  return {
    repository: {
      claimRequest: vi.fn().mockResolvedValue("claimed"),
      completeRequest: vi.fn().mockResolvedValue(undefined),
      failRequest: vi.fn().mockResolvedValue(undefined),
      loadState: vi.fn().mockResolvedValue(state),
      saveHealthSnapshot: vi.fn().mockResolvedValue(undefined),
      upsertSignalIncident: vi.fn().mockResolvedValue(incident),
      markSignalRecovered: vi.fn().mockResolvedValue(undefined),
      loadIncident: vi.fn().mockResolvedValue(incident),
      transitionIncident: vi.fn().mockResolvedValue({
        ...incident,
        state: "acknowledged",
        version: 2,
      }),
      setControl: vi.fn().mockImplementation(async ({ change }) => ({
        control: change.control,
        mode: change.mode,
        version: 1,
        reason: change.reasonCode,
        changedAt: now.toISOString(),
      })),
      setRollout: vi.fn().mockImplementation(async ({ stage, cohortPercentage, status }) => ({
        ...state.rollout,
        stage,
        cohortPercentage,
        status,
        enteredAt: now.toISOString(),
        version: 2,
      })),
      loadRolloutApproval: vi.fn().mockResolvedValue(null),
      saveConsistencyAudit: vi.fn().mockResolvedValue(undefined),
      recordOperationsEvent: vi.fn().mockResolvedValue(undefined),
    },
    metrics: {
      collect: vi.fn().mockResolvedValue([
        {
          code: "database_connectivity_ratio",
          value: 0.8,
          unit: "ratio",
          sampleSize: 10,
          windowSeconds: 900,
          observedAt: now.toISOString(),
        },
      ]),
    },
    consistency: {
      collectFacts: vi.fn().mockResolvedValue({
        billingCycleOverdrawCount: 0,
        windowOverdrawCount: 0,
        duplicateActiveOwnershipCount: 0,
        orphanDeliveryGrantCount: 0,
        deliveredWindowWithoutOwnershipCount: 0,
        ownershipWithoutAssetCount: 0,
        stuckWindowCount: 0,
        unresolvedWebhookFailureCount: 0,
      }),
    },
    controls: {
      applyControl: vi.fn().mockResolvedValue(undefined),
      applyRollout: vi.fn().mockResolvedValue(undefined),
    },
    alerts: {
      notify: vi.fn().mockResolvedValue(undefined),
    },
    now: () => now,
    hashPayload: () => "a".repeat(64),
  };
};

describe("MMG commerce operations service", () => {
  it("opens a critical incident and applies reversible automatic containment", async () => {
    const deps = dependencies();
    const response = await executeMMGCommerceOperationsCommand({
      command: {
        requestId: "request-evaluate-12345678",
        action: "evaluate",
        environment: "staging",
        releaseId: "release-staging-12345678",
        allowAutomaticContainment: true,
      },
      principal: {
        actorId: "monitor-1",
        sessionId: "session-monitor-12345678",
        roles: ["mmg-commerce-operator", "mmg-commerce-monitor"],
      },
      dependencies: deps,
    });
    expect(response.body.status).toBe("evaluated");
    expect(response.body.rolloutPaused).toBe(true);
    expect(deps.controls.applyControl).toHaveBeenCalledWith(
      expect.objectContaining({
        change: expect.objectContaining({
          control: "subscription_checkout",
          mode: "disabled",
        }),
      }),
    );
    expect(deps.controls.applyRollout).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "paused", cohortPercentage: 0 }),
    );
    expect(deps.alerts.notify).toHaveBeenCalled();
  });

  it("requires incident commander authority for production control changes", async () => {
    const deps = dependencies();
    await expect(
      executeMMGCommerceOperationsCommand({
        command: {
          requestId: "request-control-12345678",
          action: "set_control",
          environment: "production",
          control: "subscription_checkout",
          mode: "disabled",
        },
        principal: {
          actorId: "operator-1",
          sessionId: "session-operator-12345678",
          roles: ["mmg-commerce-operator"],
        },
        dependencies: deps,
      }),
    ).rejects.toThrow("MMG_INCIDENT_COMMANDER_ROLE_REQUIRED");
  });

  it("forbids disabling durable webhook ingestion", async () => {
    const deps = dependencies();
    await expect(
      executeMMGCommerceOperationsCommand({
        command: {
          requestId: "request-webhook-12345678",
          action: "set_control",
          environment: "staging",
          control: "webhook_ingestion",
          mode: "disabled",
        },
        principal: {
          actorId: "operator-1",
          sessionId: "session-operator-12345678",
          roles: ["mmg-commerce-operator"],
        },
        dependencies: deps,
      }),
    ).rejects.toThrow("MMG_WEBHOOK_INGESTION_DISABLE_FORBIDDEN");
  });
});
