import type {
  MMGCommerceOperationsState,
} from "./commerce-operations-service.js";
import type { MMGCommerceRolloutStage } from "./commerce-operations-control.js";

export const MMG_COMMERCE_REHEARSAL_VERSION = "1.0.0" as const;

export type MMGCommerceRehearsalScenario =
  | "database_connectivity_sev1"
  | "webhook_failure_sev2";

export interface MMGCommerceRightsDigest {
  activeOwnershipCount: number;
  activeDeliveryGrantCount: number;
  deliveredWindowCount: number;
  activeEntitlementCount: number;
  digestSha256: string;
}

export interface MMGCommerceRehearsalCheck {
  code: string;
  status: "passed" | "failed";
  occurredAt: string;
  evidence: Record<string, unknown>;
}

export interface MMGCommerceRehearsalEvidence {
  schemaVersion: typeof MMG_COMMERCE_REHEARSAL_VERSION;
  runId: string;
  releaseId: string;
  environment: "staging";
  startedAt: string;
  completedAt: string;
  status: "passed" | "failed";
  scenarios: MMGCommerceRehearsalScenario[];
  rolloutStages: MMGCommerceRolloutStage[];
  checks: MMGCommerceRehearsalCheck[];
  publicationAttempted: false;
  liveCustomerDataUsed: false;
  deliveredOwnershipRevocationAllowed: false;
}

export interface MMGCommerceStagingRehearsalGateway {
  bootstrapSafeState(input: { runId: string; releaseId: string; occurredAt: Date }): Promise<void>;
  injectScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
  }): Promise<void>;
  clearScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
  }): Promise<void>;
  evaluate(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
  }): Promise<MMGCommerceOperationsState>;
  recoverScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
  }): Promise<MMGCommerceOperationsState>;
  runConsistencyAudit(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
  }): Promise<{ passed: boolean; failedChecks: string[] }>;
  grantStageApproval(input: {
    runId: string;
    releaseId: string;
    fromStage: MMGCommerceRolloutStage;
    toStage: MMGCommerceRolloutStage;
    occurredAt: Date;
  }): Promise<void>;
  advanceObservation(input: {
    runId: string;
    releaseId: string;
    hours: number;
    occurredAt: Date;
  }): Promise<Date>;
  advanceRollout(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    targetStage: MMGCommerceRolloutStage;
    occurredAt: Date;
  }): Promise<MMGCommerceOperationsState>;
  readRightsDigest(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
  }): Promise<MMGCommerceRightsDigest>;
  teardown(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGCommerceRehearsalRepository {
  claim(input: {
    runId: string;
    releaseId: string;
    startedAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision">;
  appendCheck(input: {
    runId: string;
    check: MMGCommerceRehearsalCheck;
  }): Promise<void>;
  complete(evidence: MMGCommerceRehearsalEvidence): Promise<void>;
  fail(input: {
    runId: string;
    errorCode: string;
    checks: MMGCommerceRehearsalCheck[];
    failedAt: Date;
  }): Promise<void>;
}

const id = (value: string, code: string): string => {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) throw new Error(code);
  return normalized;
};

const controlMode = (
  state: MMGCommerceOperationsState,
  control: string,
): string | null => state.controls.find((entry) => entry.control === control)?.mode ?? null;

const sameRights = (left: MMGCommerceRightsDigest, right: MMGCommerceRightsDigest): boolean =>
  left.digestSha256 === right.digestSha256 &&
  left.activeOwnershipCount === right.activeOwnershipCount &&
  left.activeDeliveryGrantCount === right.activeDeliveryGrantCount &&
  left.deliveredWindowCount === right.deliveredWindowCount &&
  left.activeEntitlementCount === right.activeEntitlementCount;

export const runMMGCommerceStagingRehearsal = async (input: {
  runId: string;
  releaseId: string;
  gateway: MMGCommerceStagingRehearsalGateway;
  repository: MMGCommerceRehearsalRepository;
  now(): Date;
}): Promise<MMGCommerceRehearsalEvidence> => {
  const runId = id(input.runId, "MMG_REHEARSAL_RUN_ID_INVALID");
  const releaseId = id(input.releaseId, "MMG_REHEARSAL_RELEASE_ID_INVALID");
  const startedAt = input.now();
  const claim = await input.repository.claim({ runId, releaseId, startedAt });
  if (claim === "collision") throw new Error("MMG_REHEARSAL_RUN_COLLISION");
  if (claim === "duplicate_completed") throw new Error("MMG_REHEARSAL_ALREADY_COMPLETED");

  const checks: MMGCommerceRehearsalCheck[] = [];
  const record = async (
    code: string,
    passed: boolean,
    evidence: Record<string, unknown>,
    occurredAt = input.now(),
  ) => {
    const check: MMGCommerceRehearsalCheck = {
      code,
      status: passed ? "passed" : "failed",
      occurredAt: occurredAt.toISOString(),
      evidence,
    };
    checks.push(check);
    await input.repository.appendCheck({ runId, check });
    if (!passed) throw new Error(`MMG_REHEARSAL_CHECK_FAILED:${code}`);
  };

  let clock = startedAt;
  try {
    const baselineRights = await input.gateway.readRightsDigest({
      runId,
      releaseId,
      occurredAt: clock,
    });
    await record("BASELINE_RIGHTS_CAPTURED", /^[a-f0-9]{64}$/.test(baselineRights.digestSha256), {
      activeOwnershipCount: baselineRights.activeOwnershipCount,
      activeDeliveryGrantCount: baselineRights.activeDeliveryGrantCount,
      deliveredWindowCount: baselineRights.deliveredWindowCount,
      activeEntitlementCount: baselineRights.activeEntitlementCount,
    }, clock);

    await input.gateway.bootstrapSafeState({ runId, releaseId, occurredAt: clock });
    let state = await input.gateway.evaluate({
      runId,
      releaseId,
      requestId: `${runId}:safe-state`,
      occurredAt: clock,
    });
    await record("SAFE_STATE_PAUSED", state.rollout?.stage === "paused", {
      rolloutStage: state.rollout?.stage ?? null,
    }, clock);
    await record("SAFE_STATE_CONTROLS", 
      controlMode(state, "subscription_checkout") === "disabled" &&
      controlMode(state, "webhook_ingestion") === "enabled" &&
      controlMode(state, "delivery_scheduler") === "disabled" &&
      controlMode(state, "delivery_dispatcher") === "disabled",
      { controls: state.controls.map((entry) => ({ control: entry.control, mode: entry.mode })) },
      clock,
    );

    await input.gateway.injectScenario({
      runId,
      releaseId,
      scenario: "database_connectivity_sev1",
      occurredAt: clock,
    });
    state = await input.gateway.evaluate({
      runId,
      releaseId,
      requestId: `${runId}:database-sev1`,
      occurredAt: clock,
    });
    await record("SEV1_INCIDENT_OPENED", state.openIncidents.some((entry) => entry.severity === "SEV1"), {
      incidentSeverities: state.openIncidents.map((entry) => entry.severity),
    }, clock);
    await record("SEV1_CONTAINMENT_APPLIED",
      state.rollout?.stage === "paused" &&
      controlMode(state, "subscription_checkout") === "disabled" &&
      controlMode(state, "delivery_scheduler") === "disabled" &&
      controlMode(state, "delivery_dispatcher") === "drain_only",
      {
        rolloutStage: state.rollout?.stage ?? null,
        checkout: controlMode(state, "subscription_checkout"),
        scheduler: controlMode(state, "delivery_scheduler"),
        dispatcher: controlMode(state, "delivery_dispatcher"),
      },
      clock,
    );
    await input.gateway.clearScenario({
      runId,
      releaseId,
      scenario: "database_connectivity_sev1",
      occurredAt: clock,
    });
    state = await input.gateway.recoverScenario({
      runId,
      releaseId,
      scenario: "database_connectivity_sev1",
      occurredAt: clock,
    });
    await record("SEV1_RECOVERY_REVIEWED", !state.openIncidents.some((entry) => entry.severity === "SEV1"), {
      remainingIncidents: state.openIncidents.map((entry) => ({ severity: entry.severity, state: entry.state })),
    }, clock);

    await input.gateway.injectScenario({
      runId,
      releaseId,
      scenario: "webhook_failure_sev2",
      occurredAt: clock,
    });
    state = await input.gateway.evaluate({
      runId,
      releaseId,
      requestId: `${runId}:webhook-sev2`,
      occurredAt: clock,
    });
    await record("SEV2_INCIDENT_OPENED", state.openIncidents.some((entry) => entry.severity === "SEV2"), {
      incidentSeverities: state.openIncidents.map((entry) => entry.severity),
    }, clock);
    await record("WEBHOOK_EVIDENCE_PRESERVED",
      controlMode(state, "webhook_ingestion") === "enabled",
      { webhookIngestion: controlMode(state, "webhook_ingestion") },
      clock,
    );
    await input.gateway.clearScenario({
      runId,
      releaseId,
      scenario: "webhook_failure_sev2",
      occurredAt: clock,
    });
    state = await input.gateway.recoverScenario({
      runId,
      releaseId,
      scenario: "webhook_failure_sev2",
      occurredAt: clock,
    });
    await record("SEV2_RECOVERY_REVIEWED", !state.openIncidents.some((entry) => entry.severity === "SEV2"), {
      remainingIncidents: state.openIncidents.map((entry) => ({ severity: entry.severity, state: entry.state })),
    }, clock);

    const audit = await input.gateway.runConsistencyAudit({
      runId,
      releaseId,
      requestId: `${runId}:consistency`,
      occurredAt: clock,
    });
    await record("CONSISTENCY_AUDIT_PASSED", audit.passed, {
      failedChecks: audit.failedChecks,
    }, clock);

    const stages: Array<Exclude<MMGCommerceRolloutStage, "paused">> = [
      "internal",
      "pilot",
      "limited",
      "expanded",
      "full",
    ];
    let fromStage: MMGCommerceRolloutStage = "paused";
    for (const targetStage of stages) {
      if (targetStage !== "internal") {
        await input.gateway.grantStageApproval({
          runId,
          releaseId,
          fromStage,
          toStage: targetStage,
          occurredAt: clock,
        });
      }
      state = await input.gateway.advanceRollout({
        runId,
        releaseId,
        requestId: `${runId}:rollout:${targetStage}`,
        targetStage,
        occurredAt: clock,
      });
      await record(`ROLLOUT_${targetStage.toUpperCase()}_ENTERED`, state.rollout?.stage === targetStage, {
        stage: state.rollout?.stage ?? null,
        cohortPercentage: state.rollout?.cohortPercentage ?? null,
      }, clock);
      fromStage = targetStage;
      const hours = targetStage === "limited" ? 48 : targetStage === "expanded" || targetStage === "full" ? 72 : 24;
      clock = await input.gateway.advanceObservation({
        runId,
        releaseId,
        hours,
        occurredAt: clock,
      });
    }

    const finalRights = await input.gateway.readRightsDigest({
      runId,
      releaseId,
      occurredAt: clock,
    });
    await record("CUSTOMER_RIGHTS_PRESERVED", sameRights(baselineRights, finalRights), {
      baselineDigest: baselineRights.digestSha256,
      finalDigest: finalRights.digestSha256,
      activeOwnershipCount: finalRights.activeOwnershipCount,
      activeDeliveryGrantCount: finalRights.activeDeliveryGrantCount,
      deliveredWindowCount: finalRights.deliveredWindowCount,
      activeEntitlementCount: finalRights.activeEntitlementCount,
    }, clock);

    const completedAt = input.now();
    const evidence: MMGCommerceRehearsalEvidence = {
      schemaVersion: MMG_COMMERCE_REHEARSAL_VERSION,
      runId,
      releaseId,
      environment: "staging",
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status: "passed",
      scenarios: ["database_connectivity_sev1", "webhook_failure_sev2"],
      rolloutStages: ["paused", "internal", "pilot", "limited", "expanded", "full"],
      checks,
      publicationAttempted: false,
      liveCustomerDataUsed: false,
      deliveredOwnershipRevocationAllowed: false,
    };
    await input.repository.complete(evidence);
    return evidence;
  } catch (error) {
    await input.repository.fail({
      runId,
      errorCode: error instanceof Error ? error.message.slice(0, 500) : "MMG_REHEARSAL_FAILED",
      checks,
      failedAt: input.now(),
    });
    throw error;
  } finally {
    await input.gateway.teardown({
      runId,
      releaseId,
      occurredAt: input.now(),
    }).catch(() => undefined);
  }
};
