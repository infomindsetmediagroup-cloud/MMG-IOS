import {
  MMG_COMMERCE_ROLLOUT_STAGES,
  evaluateMMGCommerceRolloutTransition,
  type MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";
import type {
  MMGCommerceOperationsCommand,
  MMGCommerceOperationsDependencies,
  MMGCommerceOperationsPrincipal,
  MMGCommerceOperationsState,
} from "./commerce-operations-service.js";
import type { MMGCommerceRolloutEvidenceAdapter } from "./commerce-rollout-evidence.js";

export interface MMGCommerceRolloutDependencies
  extends MMGCommerceOperationsDependencies {
  rolloutEvidence: MMGCommerceRolloutEvidenceAdapter;
}

const requireRole = (
  principal: MMGCommerceOperationsPrincipal,
  role: string,
  code: string,
): void => {
  if (!principal.roles.includes(role)) throw new Error(code);
};

const validateCommand = (
  command: MMGCommerceOperationsCommand,
): MMGCommerceOperationsCommand => {
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(command.requestId.trim())) {
    throw new Error("MMG_OPERATIONS_REQUEST_ID_INVALID");
  }
  if (
    command.expectedVersion !== undefined &&
    (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 1)
  ) {
    throw new Error("MMG_OPERATIONS_EXPECTED_VERSION_INVALID");
  }
  if (command.reason !== undefined && command.reason.trim().length > 500) {
    throw new Error("MMG_OPERATIONS_REASON_TOO_LONG");
  }
  return command;
};

const assertAuthorized = (
  principal: MMGCommerceOperationsPrincipal,
  command: MMGCommerceOperationsCommand,
): void => {
  requireRole(principal, "mmg-commerce-operator", "MMG_COMMERCE_OPERATOR_ROLE_REQUIRED");
  if (command.environment === "production") {
    requireRole(
      principal,
      "mmg-incident-commander",
      "MMG_INCIDENT_COMMANDER_ROLE_REQUIRED",
    );
  }
  if (command.action === "advance_rollout" && command.environment === "production") {
    requireRole(
      principal,
      "mmg-production-release-manager",
      "MMG_PRODUCTION_RELEASE_ROLE_REQUIRED",
    );
  }
};

const activeIncidentCount = (
  severity: "SEV1" | "SEV2",
  incidents: MMGCommerceOperationsState["openIncidents"],
): number => incidents.filter((entry) => entry.severity === severity).length;

const pausedResumeDecision = (input: {
  target: Exclude<MMGCommerceRolloutStage, "paused">;
  approvalPresent: boolean;
  state: MMGCommerceOperationsState;
  releaseEvidencePassed: boolean;
}) => {
  const blockers: string[] = [];
  if (activeIncidentCount("SEV1", input.state.openIncidents) > 0) {
    blockers.push("OPEN_SEV1_INCIDENT");
  }
  if (activeIncidentCount("SEV2", input.state.openIncidents) > 0) {
    blockers.push("OPEN_SEV2_INCIDENT");
  }
  if (["critical", "unknown"].includes(input.state.latestHealth?.overallStatus ?? "unknown")) {
    blockers.push("HEALTH_STATUS_NOT_ELIGIBLE");
  }
  if (input.state.latestHealth?.releaseId !== input.state.rollout?.releaseId) {
    blockers.push("HEALTH_RELEASE_MISMATCH");
  }
  if (input.state.latestConsistencyAudit?.status !== "passed") {
    blockers.push("CONSISTENCY_AUDIT_REQUIRED");
  }
  if (input.state.latestConsistencyAudit?.releaseId !== input.state.rollout?.releaseId) {
    blockers.push("CONSISTENCY_AUDIT_RELEASE_MISMATCH");
  }
  if (!input.releaseEvidencePassed) blockers.push("FRESH_RELEASE_E2E_REQUIRED");
  if (input.target !== "internal" && !input.approvalPresent) {
    blockers.push("PAUSED_RESUME_APPROVAL_REQUIRED");
  }
  const policy = MMG_COMMERCE_ROLLOUT_STAGES[input.target];
  if (policy.executiveApprovalRequired && !input.approvalPresent) {
    blockers.push("ROLLOUT_APPROVAL_REQUIRED");
  }
  return {
    allowed: blockers.length === 0,
    blockers,
    targetPercentage: policy.cohortPercentage,
    targetObservationHours: policy.minimumObservationHours,
  };
};

export const executeMMGCommerceRolloutCommand = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceRolloutDependencies;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const command = validateCommand(input.command);
  const { principal, dependencies } = input;
  if (!["advance_rollout", "pause_rollout"].includes(command.action)) {
    throw new Error("MMG_ROLLOUT_ACTION_INVALID");
  }
  assertAuthorized(principal, command);
  const occurredAt = dependencies.now();
  const payloadHash = dependencies.hashPayload(command);
  if (!/^[a-f0-9]{64}$/.test(payloadHash)) {
    throw new Error("MMG_OPERATIONS_PAYLOAD_HASH_INVALID");
  }
  const claim = await dependencies.repository.claimRequest({
    requestId: command.requestId,
    action: command.action,
    environment: command.environment,
    payloadHash,
    occurredAt,
  });
  if (claim === "collision") throw new Error("MMG_OPERATIONS_REQUEST_ID_COLLISION");
  if (claim === "duplicate_completed") {
    return { status: 200, body: { ok: true, status: "duplicate_ignored" } };
  }

  try {
    const state = await dependencies.repository.loadState(command.environment);
    const current = state.rollout;
    if (!current) throw new Error("MMG_ROLLOUT_STATE_NOT_FOUND");
    if (command.releaseId && command.releaseId !== current.releaseId) {
      throw new Error("MMG_ROLLOUT_RELEASE_ID_MISMATCH");
    }
    const target: MMGCommerceRolloutStage =
      command.action === "pause_rollout"
        ? "paused"
        : command.targetStage ?? (() => {
            throw new Error("MMG_ROLLOUT_TARGET_REQUIRED");
          })();
    if (target === current.stage) {
      await dependencies.repository.completeRequest({
        requestId: command.requestId,
        outcome: { status: "rollout_unchanged", stage: target },
        occurredAt,
      });
      return {
        status: 200,
        body: { ok: true, status: "rollout_unchanged", rollout: current },
      };
    }

    const approval =
      target === "paused"
        ? null
        : await dependencies.repository.loadRolloutApproval({
            releaseId: current.releaseId,
            environment: command.environment,
            fromStage: current.stage,
            toStage: target,
            asOf: occurredAt,
          });
    const releaseEvidencePassed =
      target === "paused"
        ? false
        : await dependencies.rolloutEvidence.hasFreshReleaseEvidence({
            environment: command.environment,
            releaseId: current.releaseId,
            maximumAgeSeconds: 86_400,
            asOf: occurredAt,
          });

    const observedHours = Math.max(
      0,
      (occurredAt.getTime() - Date.parse(current.enteredAt)) / 3_600_000,
    );
    const decision =
      target === "paused"
        ? { allowed: true, blockers: [], targetPercentage: 0, targetObservationHours: 0 }
        : current.stage === "paused"
          ? pausedResumeDecision({
              target,
              approvalPresent: Boolean(approval),
              state,
              releaseEvidencePassed,
            })
          : (() => {
              const decision = evaluateMMGCommerceRolloutTransition({
                currentStage: current.stage,
                targetStage: target,
                observedHours,
                openSev1Count: activeIncidentCount("SEV1", state.openIncidents),
                openSev2Count: activeIncidentCount("SEV2", state.openIncidents),
                latestHealthStatus: state.latestHealth?.overallStatus ?? "unknown",
                consistencyAuditPassed:
                  state.latestConsistencyAudit?.status === "passed" &&
                  state.latestConsistencyAudit.releaseId === current.releaseId,
                freshE2EPassed: releaseEvidencePassed,
                executiveApprovalPresent: Boolean(approval),
              });
              if (state.latestHealth?.releaseId !== current.releaseId) {
                decision.blockers.push("HEALTH_RELEASE_MISMATCH");
                decision.allowed = false;
              }
              return decision;
            })();

    if (!decision.allowed) {
      throw new Error(`MMG_ROLLOUT_TRANSITION_BLOCKED:${[...new Set(decision.blockers)].join(",")}`);
    }
    await dependencies.controls.applyRollout({
      environment: command.environment,
      releaseId: current.releaseId,
      stage: target,
      cohortPercentage: decision.targetPercentage,
      occurredAt,
    });
    const observationUntil =
      decision.targetObservationHours > 0
        ? new Date(
            occurredAt.getTime() + decision.targetObservationHours * 3_600_000,
          )
        : null;
    const rollout = await dependencies.repository.setRollout({
      environment: command.environment,
      releaseId: current.releaseId,
      stage: target,
      cohortPercentage: decision.targetPercentage,
      observationUntil,
      actorId: principal.actorId,
      expectedVersion: command.expectedVersion,
      status: target === "paused" ? "paused" : "active",
      reason: command.reason?.trim() || command.action,
      occurredAt,
    });
    const body = { ok: true, status: "rollout_updated", rollout };
    await dependencies.repository.completeRequest({
      requestId: command.requestId,
      outcome: body,
      occurredAt: dependencies.now(),
    });
    return { status: 200, body };
  } catch (error) {
    await dependencies.repository.failRequest({
      requestId: command.requestId,
      errorCode: error instanceof Error ? error.message : "MMG_ROLLOUT_FAILED",
      occurredAt: dependencies.now(),
    });
    throw error;
  }
};
