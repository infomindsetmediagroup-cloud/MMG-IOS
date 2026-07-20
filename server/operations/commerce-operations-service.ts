import {
  buildMMGCommerceHealthSnapshot,
  deriveMMGCommerceMitigationPlan,
  evaluateMMGCommerceRolloutTransition,
  type MMGCommerceControlChange,
  type MMGCommerceControlCode,
  type MMGCommerceControlMode,
  type MMGCommerceHealthMetric,
  type MMGCommerceHealthSnapshot,
  type MMGCommerceHealthStatus,
  type MMGCommerceOperationsEnvironment,
  type MMGCommerceRolloutStage,
  type MMGCommerceSignalEvaluation,
  type MMGIncidentSeverity,
  type MMGIncidentState,
} from "./commerce-operations-control.js";
import {
  buildMMGCommerceConsistencyAudit,
  type MMGCommerceConsistencyAudit,
  type MMGCommerceConsistencyFacts,
} from "./commerce-consistency-audit.js";

export type MMGCommerceOperationsAction =
  | "inspect"
  | "evaluate"
  | "run_consistency_audit"
  | "acknowledge_incident"
  | "apply_mitigation"
  | "resolve_incident"
  | "close_incident"
  | "set_control"
  | "advance_rollout"
  | "pause_rollout";

export interface MMGCommerceOperationsCommand {
  requestId: string;
  action: MMGCommerceOperationsAction;
  environment: MMGCommerceOperationsEnvironment;
  releaseId?: string | null;
  incidentId?: string;
  control?: MMGCommerceControlCode;
  mode?: MMGCommerceControlMode;
  targetStage?: MMGCommerceRolloutStage;
  expectedVersion?: number;
  reason?: string;
  allowAutomaticContainment?: boolean;
}

export interface MMGCommerceOperationsPrincipal {
  actorId: string;
  sessionId: string;
  roles: string[];
}

export interface MMGCommerceControlState {
  control: MMGCommerceControlCode;
  mode: MMGCommerceControlMode;
  version: number;
  reason: string;
  changedAt: string;
}

export interface MMGCommerceRolloutState {
  environment: MMGCommerceOperationsEnvironment;
  releaseId: string;
  stage: MMGCommerceRolloutStage;
  cohortPercentage: number;
  enteredAt: string;
  observationUntil: string | null;
  version: number;
  status: "active" | "paused" | "rolled_back";
}

export interface MMGCommerceIncidentRecord {
  incidentId: string;
  environment: MMGCommerceOperationsEnvironment;
  signalCode: string;
  severity: MMGIncidentSeverity;
  state: MMGIncidentState;
  title: string;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  version: number;
}

export interface MMGCommerceOperationsState {
  environment: MMGCommerceOperationsEnvironment;
  latestHealth: MMGCommerceHealthSnapshot | null;
  latestConsistencyAudit: MMGCommerceConsistencyAudit | null;
  rollout: MMGCommerceRolloutState | null;
  controls: MMGCommerceControlState[];
  openIncidents: MMGCommerceIncidentRecord[];
  freshE2EPassed: boolean;
}

export interface MMGCommerceRolloutApproval {
  approvalId: string;
  releaseId: string;
  environment: MMGCommerceOperationsEnvironment;
  fromStage: MMGCommerceRolloutStage;
  toStage: MMGCommerceRolloutStage;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  status: "active" | "revoked" | "expired" | "consumed";
}

export interface MMGCommerceOperationsRepository {
  claimRequest(input: {
    requestId: string;
    action: MMGCommerceOperationsAction;
    environment: MMGCommerceOperationsEnvironment;
    payloadHash: string;
    occurredAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision">;
  completeRequest(input: {
    requestId: string;
    outcome: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void>;
  failRequest(input: {
    requestId: string;
    errorCode: string;
    occurredAt: Date;
  }): Promise<void>;
  loadState(environment: MMGCommerceOperationsEnvironment): Promise<MMGCommerceOperationsState>;
  saveHealthSnapshot(snapshot: MMGCommerceHealthSnapshot): Promise<void>;
  upsertSignalIncident(input: {
    incidentId: string;
    environment: MMGCommerceOperationsEnvironment;
    signal: MMGCommerceSignalEvaluation;
    summary: string;
    occurredAt: Date;
  }): Promise<MMGCommerceIncidentRecord>;
  markSignalRecovered(input: {
    environment: MMGCommerceOperationsEnvironment;
    signalCode: string;
    occurredAt: Date;
  }): Promise<void>;
  loadIncident(incidentId: string): Promise<MMGCommerceIncidentRecord | null>;
  transitionIncident(input: {
    incidentId: string;
    expectedVersion?: number;
    from: MMGIncidentState;
    to: MMGIncidentState;
    actorId: string;
    reason: string;
    occurredAt: Date;
  }): Promise<MMGCommerceIncidentRecord>;
  setControl(input: {
    environment: MMGCommerceOperationsEnvironment;
    change: MMGCommerceControlChange;
    actorId: string;
    expectedVersion?: number;
    occurredAt: Date;
  }): Promise<MMGCommerceControlState>;
  setRollout(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    observationUntil: Date | null;
    actorId: string;
    expectedVersion?: number;
    status: MMGCommerceRolloutState["status"];
    reason: string;
    occurredAt: Date;
  }): Promise<MMGCommerceRolloutState>;
  loadRolloutApproval(input: {
    releaseId: string;
    environment: MMGCommerceOperationsEnvironment;
    fromStage: MMGCommerceRolloutStage;
    toStage: MMGCommerceRolloutStage;
    asOf: Date;
  }): Promise<MMGCommerceRolloutApproval | null>;
  saveConsistencyAudit(audit: MMGCommerceConsistencyAudit): Promise<void>;
  recordOperationsEvent(input: {
    environment: MMGCommerceOperationsEnvironment;
    eventType: string;
    actorId: string | null;
    incidentId?: string | null;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGCommerceMetricsAdapter {
  collect(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    occurredAt: Date;
  }): Promise<MMGCommerceHealthMetric[]>;
}

export interface MMGCommerceConsistencyAdapter {
  collectFacts(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    occurredAt: Date;
  }): Promise<MMGCommerceConsistencyFacts>;
}

export interface MMGCommerceControlAdapter {
  applyControl(input: {
    environment: MMGCommerceOperationsEnvironment;
    change: MMGCommerceControlChange;
    occurredAt: Date;
  }): Promise<void>;
  applyRollout(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGCommerceAlertAdapter {
  notify(input: {
    environment: MMGCommerceOperationsEnvironment;
    incident: MMGCommerceIncidentRecord;
    signal: MMGCommerceSignalEvaluation;
    automaticContainmentApplied: boolean;
  }): Promise<void>;
}

export interface MMGCommerceOperationsDependencies {
  repository: MMGCommerceOperationsRepository;
  metrics: MMGCommerceMetricsAdapter;
  consistency: MMGCommerceConsistencyAdapter;
  controls: MMGCommerceControlAdapter;
  alerts: MMGCommerceAlertAdapter;
  now(): Date;
  hashPayload(command: MMGCommerceOperationsCommand): string;
}

const id = (value: string | undefined, code: string): string => {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) throw new Error(code);
  return normalized;
};

const assertCommand = (
  command: MMGCommerceOperationsCommand,
): MMGCommerceOperationsCommand => {
  id(command.requestId, "MMG_OPERATIONS_REQUEST_ID_INVALID");
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

const role = (
  principal: MMGCommerceOperationsPrincipal,
  required: string,
  code: string,
): void => {
  if (!principal.roles.includes(required)) throw new Error(code);
};

const assertAuthorization = (
  principal: MMGCommerceOperationsPrincipal,
  command: MMGCommerceOperationsCommand,
): void => {
  role(principal, "mmg-commerce-operator", "MMG_COMMERCE_OPERATOR_ROLE_REQUIRED");
  const productionMutation =
    command.environment === "production" &&
    !["inspect", "evaluate", "run_consistency_audit"].includes(command.action);
  if (productionMutation) {
    role(
      principal,
      "mmg-incident-commander",
      "MMG_INCIDENT_COMMANDER_ROLE_REQUIRED",
    );
  }
  if (
    command.environment === "production" &&
    command.action === "advance_rollout"
  ) {
    role(
      principal,
      "mmg-production-release-manager",
      "MMG_PRODUCTION_RELEASE_ROLE_REQUIRED",
    );
  }
  if (command.allowAutomaticContainment) {
    role(principal, "mmg-commerce-monitor", "MMG_COMMERCE_MONITOR_ROLE_REQUIRED");
  }
};

const incidentIdFor = (
  environment: MMGCommerceOperationsEnvironment,
  signal: MMGCommerceSignalEvaluation,
): string => `incident:${environment}:${signal.code}`;

const summaryFor = (signal: MMGCommerceSignalEvaluation): string =>
  `${signal.title} is ${signal.status}; observed ${signal.value} ${signal.unit} with ${signal.sampleSize} samples.`;

const transitionMap: Record<MMGIncidentState, MMGIncidentState[]> = {
  detected: ["acknowledged"],
  acknowledged: ["mitigating", "resolved"],
  mitigating: ["monitoring", "resolved"],
  monitoring: ["mitigating", "resolved"],
  resolved: ["closed", "detected"],
  closed: ["detected"],
};

const targetIncidentState = (
  action: MMGCommerceOperationsAction,
): MMGIncidentState => {
  if (action === "acknowledge_incident") return "acknowledged";
  if (action === "apply_mitigation") return "mitigating";
  if (action === "resolve_incident") return "resolved";
  if (action === "close_incident") return "closed";
  throw new Error("MMG_INCIDENT_ACTION_INVALID");
};

const applyControlChange = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  change: MMGCommerceControlChange;
  occurredAt: Date;
}): Promise<MMGCommerceControlState> => {
  if (
    input.change.control === "webhook_ingestion" &&
    input.change.mode === "disabled"
  ) {
    throw new Error("MMG_WEBHOOK_INGESTION_DISABLE_FORBIDDEN");
  }
  if (
    input.change.control === "product_publication" &&
    input.change.mode === "enabled"
  ) {
    throw new Error("MMG_PUBLICATION_ENABLE_REQUIRES_DEPLOYMENT_CONTROL");
  }
  await input.dependencies.controls.applyControl({
    environment: input.command.environment,
    change: input.change,
    occurredAt: input.occurredAt,
  });
  return input.dependencies.repository.setControl({
    environment: input.command.environment,
    change: input.change,
    actorId: input.principal.actorId,
    expectedVersion: input.command.expectedVersion,
    occurredAt: input.occurredAt,
  });
};

const inspect = async (
  command: MMGCommerceOperationsCommand,
  dependencies: MMGCommerceOperationsDependencies,
) => ({
  status: 200,
  body: {
    ok: true,
    status: "inspected",
    state: await dependencies.repository.loadState(command.environment),
  },
});

const evaluate = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
}) => {
  const runId = `monitor:${input.command.environment}:${input.command.requestId}`;
  const metrics = await input.dependencies.metrics.collect({
    environment: input.command.environment,
    releaseId: input.command.releaseId ?? null,
    occurredAt: input.occurredAt,
  });
  const snapshot = buildMMGCommerceHealthSnapshot({
    environment: input.command.environment,
    releaseId: input.command.releaseId ?? null,
    runId,
    metrics,
    evaluatedAt: input.occurredAt,
  });
  await input.dependencies.repository.saveHealthSnapshot(snapshot);
  const incidents: MMGCommerceIncidentRecord[] = [];
  const appliedControls: MMGCommerceControlState[] = [];
  let rolloutPaused = false;

  for (const signal of snapshot.signals) {
    if (signal.status === "healthy") {
      await input.dependencies.repository.markSignalRecovered({
        environment: input.command.environment,
        signalCode: signal.code,
        occurredAt: input.occurredAt,
      });
      continue;
    }
    const incident = await input.dependencies.repository.upsertSignalIncident({
      incidentId: incidentIdFor(input.command.environment, signal),
      environment: input.command.environment,
      signal,
      summary: summaryFor(signal),
      occurredAt: input.occurredAt,
    });
    incidents.push(incident);
    const mitigation = deriveMMGCommerceMitigationPlan(signal);
    let contained = false;
    if (mitigation && input.command.allowAutomaticContainment) {
      for (const change of mitigation.controlChanges) {
        appliedControls.push(
          await applyControlChange({
            command: input.command,
            principal: input.principal,
            dependencies: input.dependencies,
            change,
            occurredAt: input.occurredAt,
          }),
        );
      }
      const state = await input.dependencies.repository.loadState(
        input.command.environment,
      );
      if (mitigation.pauseRollout && state.rollout) {
        await input.dependencies.controls.applyRollout({
          environment: input.command.environment,
          releaseId: state.rollout.releaseId,
          stage: "paused",
          cohortPercentage: 0,
          occurredAt: input.occurredAt,
        });
        await input.dependencies.repository.setRollout({
          environment: input.command.environment,
          releaseId: state.rollout.releaseId,
          stage: "paused",
          cohortPercentage: 0,
          observationUntil: null,
          actorId: input.principal.actorId,
          status: "paused",
          reason: `automatic_containment:${signal.code}`,
          occurredAt: input.occurredAt,
        });
        rolloutPaused = true;
      }
      contained = true;
    }
    await input.dependencies.alerts.notify({
      environment: input.command.environment,
      incident,
      signal,
      automaticContainmentApplied: contained,
    });
  }

  await input.dependencies.repository.recordOperationsEvent({
    environment: input.command.environment,
    eventType: "health_evaluated",
    actorId: input.principal.actorId,
    payload: {
      runId,
      overallStatus: snapshot.overallStatus,
      incidentCount: incidents.length,
      automaticContainmentApplied: appliedControls.length > 0 || rolloutPaused,
    },
    occurredAt: input.occurredAt,
  });

  return {
    status: 200,
    body: {
      ok: true,
      status: "evaluated",
      snapshot,
      incidents,
      appliedControls,
      rolloutPaused,
    },
  };
};

const runAudit = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
}) => {
  const facts = await input.dependencies.consistency.collectFacts({
    environment: input.command.environment,
    releaseId: input.command.releaseId ?? null,
    occurredAt: input.occurredAt,
  });
  const audit = buildMMGCommerceConsistencyAudit({
    auditId: `audit:${input.command.environment}:${input.command.requestId}`,
    environment: input.command.environment,
    releaseId: input.command.releaseId ?? null,
    facts,
    startedAt: input.occurredAt,
    completedAt: input.dependencies.now(),
  });
  await input.dependencies.repository.saveConsistencyAudit(audit);
  await input.dependencies.repository.recordOperationsEvent({
    environment: input.command.environment,
    eventType: "consistency_audit_completed",
    actorId: input.principal.actorId,
    payload: {
      auditId: audit.auditId,
      status: audit.status,
      failedChecks: audit.checks.filter((entry) => entry.status === "failed").map((entry) => entry.code),
    },
    occurredAt: input.dependencies.now(),
  });
  return { status: audit.status === "passed" ? 200 : 409, body: { ok: true, status: "audited", audit } };
};

const changeIncident = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
}) => {
  const incidentId = id(input.command.incidentId, "MMG_INCIDENT_ID_INVALID");
  const incident = await input.dependencies.repository.loadIncident(incidentId);
  if (!incident) throw new Error("MMG_INCIDENT_NOT_FOUND");
  const to = targetIncidentState(input.command.action);
  if (!transitionMap[incident.state].includes(to)) {
    throw new Error("MMG_INCIDENT_TRANSITION_INVALID");
  }
  const changed = await input.dependencies.repository.transitionIncident({
    incidentId,
    expectedVersion: input.command.expectedVersion,
    from: incident.state,
    to,
    actorId: input.principal.actorId,
    reason: input.command.reason?.trim() || input.command.action,
    occurredAt: input.occurredAt,
  });
  return { status: 200, body: { ok: true, status: "incident_updated", incident: changed } };
};

const setControl = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
}) => {
  if (!input.command.control || !input.command.mode) {
    throw new Error("MMG_CONTROL_CHANGE_INCOMPLETE");
  }
  const state = await applyControlChange({
    ...input,
    change: {
      control: input.command.control,
      mode: input.command.mode,
      reasonCode: input.command.reason?.trim() || "manual_operator_change",
      automatic: false,
    },
  });
  return { status: 200, body: { ok: true, status: "control_updated", control: state } };
};

const changeRollout = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
}) => {
  const state = await input.dependencies.repository.loadState(input.command.environment);
  const current = state.rollout;
  if (!current) throw new Error("MMG_ROLLOUT_STATE_NOT_FOUND");
  const target: MMGCommerceRolloutStage =
    input.command.action === "pause_rollout"
      ? "paused"
      : input.command.targetStage ?? "paused";
  const approval =
    target === "paused"
      ? null
      : await input.dependencies.repository.loadRolloutApproval({
          releaseId: current.releaseId,
          environment: input.command.environment,
          fromStage: current.stage,
          toStage: target,
          asOf: input.occurredAt,
        });
  const enteredAt = Date.parse(current.enteredAt);
  const observedHours = Number.isFinite(enteredAt)
    ? Math.max(0, (input.occurredAt.getTime() - enteredAt) / 3_600_000)
    : 0;
  const decision = evaluateMMGCommerceRolloutTransition({
    currentStage: current.stage,
    targetStage: target,
    observedHours,
    openSev1Count: state.openIncidents.filter((entry) => entry.severity === "SEV1").length,
    openSev2Count: state.openIncidents.filter((entry) => entry.severity === "SEV2").length,
    latestHealthStatus: state.latestHealth?.overallStatus ?? "unknown",
    consistencyAuditPassed: state.latestConsistencyAudit?.status === "passed",
    freshE2EPassed: state.freshE2EPassed,
    executiveApprovalPresent: Boolean(approval),
  });
  if (!decision.allowed) {
    throw new Error(`MMG_ROLLOUT_TRANSITION_BLOCKED:${decision.blockers.join(",")}`);
  }
  await input.dependencies.controls.applyRollout({
    environment: input.command.environment,
    releaseId: current.releaseId,
    stage: target,
    cohortPercentage: decision.targetPercentage,
    occurredAt: input.occurredAt,
  });
  const observationUntil =
    decision.targetObservationHours > 0
      ? new Date(
          input.occurredAt.getTime() + decision.targetObservationHours * 3_600_000,
        )
      : null;
  const rollout = await input.dependencies.repository.setRollout({
    environment: input.command.environment,
    releaseId: current.releaseId,
    stage: target,
    cohortPercentage: decision.targetPercentage,
    observationUntil,
    actorId: input.principal.actorId,
    expectedVersion: input.command.expectedVersion,
    status: target === "paused" ? "paused" : "active",
    reason: input.command.reason?.trim() || input.command.action,
    occurredAt: input.occurredAt,
  });
  return { status: 200, body: { ok: true, status: "rollout_updated", rollout } };
};

export const executeMMGCommerceOperationsCommand = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const command = assertCommand(input.command);
  assertAuthorization(input.principal, command);
  const occurredAt = input.dependencies.now();
  const payloadHash = input.dependencies.hashPayload(command);
  if (!/^[a-f0-9]{64}$/.test(payloadHash)) {
    throw new Error("MMG_OPERATIONS_PAYLOAD_HASH_INVALID");
  }
  const claim = await input.dependencies.repository.claimRequest({
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
    let response: { status: number; body: Record<string, unknown> };
    if (command.action === "inspect") {
      response = await inspect(command, input.dependencies);
    } else if (command.action === "evaluate") {
      response = await evaluate({ ...input, command, occurredAt });
    } else if (command.action === "run_consistency_audit") {
      response = await runAudit({ ...input, command, occurredAt });
    } else if (
      [
        "acknowledge_incident",
        "apply_mitigation",
        "resolve_incident",
        "close_incident",
      ].includes(command.action)
    ) {
      response = await changeIncident({ ...input, command, occurredAt });
    } else if (command.action === "set_control") {
      response = await setControl({ ...input, command, occurredAt });
    } else {
      response = await changeRollout({ ...input, command, occurredAt });
    }
    await input.dependencies.repository.completeRequest({
      requestId: command.requestId,
      outcome: response.body,
      occurredAt: input.dependencies.now(),
    });
    return response;
  } catch (error) {
    await input.dependencies.repository.failRequest({
      requestId: command.requestId,
      errorCode: error instanceof Error ? error.message : "MMG_OPERATIONS_FAILED",
      occurredAt: input.dependencies.now(),
    });
    throw error;
  }
};
