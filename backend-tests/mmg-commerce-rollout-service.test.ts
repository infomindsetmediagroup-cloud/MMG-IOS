import { describe, expect, it, vi } from "vitest";
import type { MMGCommerceRolloutStage } from "../server/operations/commerce-operations-control.js";
import {
  executeMMGCommerceRolloutCommand,
  type MMGCommerceRolloutDependencies,
} from "../server/operations/commerce-rollout-service.js";
import type { MMGCommerceOperationsState } from "../server/operations/commerce-operations-service.js";

const now = new Date("2026-07-20T23:00:00.000Z");
const releaseId = "release-staging-12345678";

const state = (stage: MMGCommerceRolloutStage): MMGCommerceOperationsState => ({
  environment: "staging",
  latestHealth: {
    schemaVersion: "1.0.0",
    environment: "staging",
    runId: "monitor:staging:12345678",
    releaseId,
    overallStatus: "healthy",
    evaluatedAt: now.toISOString(),
    signals: [],
  },
  latestConsistencyAudit: {
    schemaVersion: "1.0.0",
    auditId: "audit:staging:12345678",
    environment: "staging",
    releaseId,
    status: "passed",
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    checks: [],
    destructiveRepairAllowed: false,
    deliveredOwnershipRevocationAllowed: false,
  },
  rollout: {
    environment: "staging",
    releaseId,
    stage,
    cohortPercentage: stage === "paused" ? 0 : 5,
    enteredAt: "2026-07-19T00:00:00.000Z",
    observationUntil: null,
    version: 1,
    status: stage === "paused" ? "paused" : "active",
  },
  controls: [],
  openIncidents: [],
  freshE2EPassed: true,
});

const dependencies = (
  operationsState: MMGCommerceOperationsState,
  approval: boolean,
  freshReleaseEvidence = true,
): MMGCommerceRolloutDependencies => ({
  repository: {
    claimRequest: vi.fn().mockResolvedValue("claimed"),
    completeRequest: vi.fn().mockResolvedValue(undefined),
    failRequest: vi.fn().mockResolvedValue(undefined),
    loadState: vi.fn().mockResolvedValue(operationsState),
    saveHealthSnapshot: vi.fn(),
    upsertSignalIncident: vi.fn(),
    markSignalRecovered: vi.fn(),
    loadIncident: vi.fn(),
    transitionIncident: vi.fn(),
    setControl: vi.fn(),
    setRollout: vi
      .fn()
      .mockImplementation(async ({ stage, cohortPercentage, status }) => ({
        ...operationsState.rollout,
        stage,
        cohortPercentage,
        status,
        enteredAt: now.toISOString(),
        version: 2,
      })),
    loadRolloutApproval: vi.fn().mockResolvedValue(
      approval
        ? {
            approvalId: "approval-rollout-12345678",
            releaseId,
            environment: operationsState.environment,
            fromStage: operationsState.rollout?.stage ?? "paused",
            toStage: "pilot",
            approvedBy: "executive-1",
            approvedAt: "2026-07-20T22:00:00.000Z",
            expiresAt: "2026-07-21T00:00:00.000Z",
            status: "active",
          }
        : null,
    ),
    saveConsistencyAudit: vi.fn(),
    recordOperationsEvent: vi.fn(),
  },
  metrics: { collect: vi.fn() },
  consistency: { collectFacts: vi.fn() },
  controls: {
    applyControl: vi.fn(),
    applyRollout: vi.fn().mockResolvedValue(undefined),
  },
  alerts: { notify: vi.fn() },
  rolloutEvidence: {
    hasFreshReleaseEvidence: vi.fn().mockResolvedValue(freshReleaseEvidence),
  },
  now: () => now,
  hashPayload: () => "a".repeat(64),
});

describe("MMG commerce rollout service", () => {
  it("resumes a paused rollout only to an explicit healthy internal stage", async () => {
    const deps = dependencies(state("paused"), false);
    const response = await executeMMGCommerceRolloutCommand({
      command: {
        requestId: "request-resume-internal-12345678",
        action: "advance_rollout",
        environment: "staging",
        releaseId,
        targetStage: "internal",
      },
      principal: {
        actorId: "operator-1",
        sessionId: "session-operator-12345678",
        roles: ["mmg-commerce-operator"],
      },
      dependencies: deps,
    });
    expect(response.body.status).toBe("rollout_updated");
    expect(deps.controls.applyRollout).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "internal", cohortPercentage: 0 }),
    );
    expect(deps.rolloutEvidence.hasFreshReleaseEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ releaseId, environment: "staging" }),
    );
  });

  it("requires explicit approval to resume a paused rollout directly to pilot", async () => {
    const deps = dependencies(state("paused"), false);
    await expect(
      executeMMGCommerceRolloutCommand({
        command: {
          requestId: "request-resume-pilot-12345678",
          action: "advance_rollout",
          environment: "staging",
          releaseId,
          targetStage: "pilot",
        },
        principal: {
          actorId: "operator-1",
          sessionId: "session-operator-12345678",
          roles: ["mmg-commerce-operator"],
        },
        dependencies: deps,
      }),
    ).rejects.toThrow("PAUSED_RESUME_APPROVAL_REQUIRED");
  });

  it("rejects evidence from another or stale release", async () => {
    const mismatched = state("limited");
    if (mismatched.latestHealth) {
      mismatched.latestHealth.releaseId = "release-other-12345678";
    }
    const deps = dependencies(mismatched, true, false);
    await expect(
      executeMMGCommerceRolloutCommand({
        command: {
          requestId: "request-release-evidence-12345678",
          action: "advance_rollout",
          environment: "staging",
          releaseId,
          targetStage: "expanded",
        },
        principal: {
          actorId: "operator-1",
          sessionId: "session-operator-12345678",
          roles: ["mmg-commerce-operator"],
        },
        dependencies: deps,
      }),
    ).rejects.toThrow("HEALTH_RELEASE_MISMATCH");
  });

  it("requires production incident and release authority", async () => {
    const production = state("limited");
    production.environment = "production";
    if (production.latestHealth) production.latestHealth.environment = "production";
    if (production.latestConsistencyAudit) {
      production.latestConsistencyAudit.environment = "production";
    }
    if (production.rollout) production.rollout.environment = "production";
    const deps = dependencies(production, true);
    await expect(
      executeMMGCommerceRolloutCommand({
        command: {
          requestId: "request-production-rollout-12345678",
          action: "advance_rollout",
          environment: "production",
          releaseId,
          targetStage: "expanded",
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
});
