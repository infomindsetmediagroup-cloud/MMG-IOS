import {
  buildMMGCommerceHealthSnapshot,
  deriveMMGCommerceMitigationPlan,
  evaluateMMGCommerceHealthMetric,
  type MMGCommerceControlChange,
  type MMGCommerceControlCode,
  type MMGCommerceControlMode,
  type MMGCommerceHealthMetric,
  type MMGCommerceHealthSnapshot,
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

const identifier = (value: string | undefined, code: string): string => {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) throw new Error(code);
  return normalized;
};

const validateCommand = (
  command: MMGCommerceOperationsCommand,
): MMGCommerceOperationsCommand => {
  identifier(command.requestId, "MMG_OPERATIONS_REQUEST_ID_INVALID");
  if (
    command.expectedVersion !== undefined &&
    (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 1)
  ) {
    throw new Error("MMG_OPERATIONS_EXPECTED_VERSION_INVALID");
  }
  if (command.reason !== undefined && command.reason.trim().length > 500) {
    throw new Error("MMG_OPERATIONS_REASON_TOO_LONG");
  }
  if (["advance_rollout", "pause_rollout"].includes(command.action)) {
    throw new Error("MMG_ROLLOUT_ACTION_REQUIRES_ROLLOUT_SERVICE");
  }
  return command;
};

const requireRole = (
  principal: MMGCommerceOperationsPrincipal,
  role: string,
  code: string,
): void => {
  if (!principal.roles.includes(role)) throw new Error(code);
};

const assertAuthorization = (
  principal: MMGCommerceOperationsPrincipal,
  command: MMGCommerceOperationsCommand,
): void => {
  requireRole(principal, "mmg-commerce-operator", "MMG_COMMERCE_OPERATOR_ROLE_REQUIRED");
  const productionMutation =
    command.environment === "production" &&
    !["inspect", "evaluate", "run_consistency_audit"].includes(command.action);
  if (productionMutation) {
    requireRole(
      principal,
      "mmg-incident-commander",
      "MMG_INCIDENT_COMMANDER_ROLE_REQUIRED",
    );
  }
  if (command.allowAutomaticContainment) {
    requireRole(principal, "mmg-commerce-monitor", "MMG_COMMERCE_MONITOR_ROLE_REQUIRED");
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
  acknowledged: ["mitigating"],
  mitigating: ["monitoring"],
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

const assertSafeControlChange = (change: MMGCommerceControlChange): void => {
  if (change.control === "webhook_ingestion" && change.mode === "disabled") {
    throw new Error("MMG_WEBHOOK_INGESTION_DISABLE_FORBIDDEN");
  }
  if (change.control === "product_publication" && change.mode === "enabled") {
    throw new Error("MMG_PUBLICATION_ENABLE_REQUIRES_DEPLOYMENT_CONTROL");
  }
  if (
    !change.automatic &&
    change.mode === "enabled" &&
    change.control !== "webhook_ingestion"
  ) {
    throw new Error("MMG_CONTROL_ENABLE_REQUIRES_ROLLOUT_CONTROL");
  }
};

const applyControlChange = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  change: MMGCommerceControlChange;
  occurredAt: Date;
}): Promise<MMGCommerceControlState> => {
  assertSafeControlChange(input.change);
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

const applyAutomaticContainment = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
  signals: MMGCommerceSignalEvaluation[];
}): Promise<{ controls: MMGCommerceControlState[]; rolloutPaused: boolean }> => {
  const changes = new Map<string, MMGCommerceControlChange>();
  let pauseRollout = false;
  for (const signal of input.signals) {
    const plan = deriveMMGCommerceMitigationPlan(signal);
    if (!plan) continue;
    pauseRollout ||= plan.pauseRollout;
    for (const change of plan.controlChanges) {
      changes.set(`${change.control}:${change.mode}`, change);
    }
  }
  const controls: MMGCommerceControlState[] = [];
  for (const change of changes.values()) {
    controls.push(
      await applyControlChange({
        command: input.command,
        principal: input.principal,
        dependencies: input.dependencies,
        change,
        occurredAt: input.occurredAt,
      }),
    );
  }
  let rolloutPaused = false;
  if (pauseRollout) {
    const state = await input.dependencies.repository.loadState(input.command.environment);
    if (state.rollout && state.rollout.stage !== "paused") {
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
        reason: `automatic_containment:${input.signals.map((signal) => signal.code).join(",")}`,
        occurredAt: input.occurredAt,
      });
      rolloutPaused = true;
    }
  }
  return { controls, rolloutPaused };
};

const persistAndAlertSignals = async (input: {
  command: MMGCommerceOperationsCommand;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
  signals: MMGCommerceSignalEvaluation[];
  automaticContainmentApplied: boolean;
}): Promise<MMGCommerceIncidentRecord[]> => {
  const incidents: MMGCommerceIncidentRecord[] = [];
  for (const signal of input.signals) {
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
    await input.dependencies.alerts.notify({
      environment: input.command.environment,
      incident,
      signal,
      automaticContainmentApplied: input.automaticContainmentApplied,
    });
  }
  return incidents;
};

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
  const actionableSignals = snapshot.signals.filter(
    (signal) => signal.severity === "SEV1" || signal.severity === "SEV2",
  );
  const containment =
    input.command.allowAutomaticContainment && actionableSignals.length > 0
      ? await applyAutomaticContainment({
          ...input,
          signals: actionableSignals,
        })
      : { controls: [], rolloutPaused: false };
  const incidents = await persistAndAlertSignals({
    command: input.command,
    dependencies: input.dependencies,
    occurredAt: input.occurredAt,
    signals: snapshot.signals,
    automaticContainmentApplied:
      containment.controls.length > 0 || containment.rolloutPaused,
  });
  await input.dependencies.repository.recordOperationsEvent({
    environment: input.command.environment,
    eventType: "health_evaluated",
    actorId: input.principal.actorId,
    payload: {
      runId,
      releaseId: snapshot.releaseId,
      overallStatus: snapshot.overallStatus,
      incidentCount: incidents.length,
      automaticContainmentApplied:
        containment.controls.length > 0 || containment.rolloutPaused,
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
      appliedControls: containment.controls,
      rolloutPaused: containment.rolloutPaused,
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
  const sev1Failures = audit.checks.filter(
    (entry) => entry.status === "failed" && entry.severity === "SEV1",
  );
  let incident: MMGCommerceIncidentRecord | null = null;
  let containment = { controls: [] as MMGCommerceControlState[], rolloutPaused: false };
  if (sev1Failures.length > 0) {
    const signal = evaluateMMGCommerceHealthMetric({
      code: "entitlement_consistency_failure_count",
      value: Math.max(2, sev1Failures.reduce((sum, entry) => sum + entry.failureCount, 0)),
      unit: "count",
      sampleSize: 1,
      windowSeconds: 900,
      observedAt: input.dependencies.now().toISOString(),
    });
    if (input.command.allowAutomaticContainment) {
      containment = await applyAutomaticContainment({
        ...input,
        signals: [signal],
      });
    }
    [incident] = await persistAndAlertSignals({
      command: input.command,
      dependencies: input.dependencies,
      occurredAt: input.dependencies.now(),
      signals: [signal],
      automaticContainmentApplied:
        containment.controls.length > 0 || containment.rolloutPaused,
    });
  }
  await input.dependencies.repository.recordOperationsEvent({
    environment: input.command.environment,
    eventType: "consistency_audit_completed",
    actorId: input.principal.actorId,
    incidentId: incident?.incidentId ?? null,
    payload: {
      auditId: audit.auditId,
      releaseId: audit.releaseId,
      status: audit.status,
      failedChecks: audit.checks
        .filter((entry) => entry.status === "failed")
        .map((entry) => entry.code),
      automaticContainmentApplied:
        containment.controls.length > 0 || containment.rolloutPaused,
    },
    occurredAt: input.dependencies.now(),
  });
  return {
    status: audit.status === "passed" ? 200 : 409,
    body: {
      ok: audit.status === "passed",
      status: audit.status === "passed" ? "audited" : "audit_failed",
      audit,
      incident,
      appliedControls: containment.controls,
      rolloutPaused: containment.rolloutPaused,
    },
  };
};

const changeIncident = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
  occurredAt: Date;
}) => {
  const incidentId = identifier(input.command.incidentId, "MMG_INCIDENT_ID_INVALID");
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
  return {
    status: 200,
    body: { ok: true, status: "incident_updated", incident: changed },
  };
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
  return {
    status: 200,
    body: { ok: true, status: "control_updated", control: state },
  };
};

export const executeMMGCommerceOperationsCommand = async (input: {
  command: MMGCommerceOperationsCommand;
  principal: MMGCommerceOperationsPrincipal;
  dependencies: MMGCommerceOperationsDependencies;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const command = validateCommand(input.command);
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
      throw new Error("MMG_OPERATIONS_ACTION_INVALID");
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
