export const MMG_COMMERCE_OPERATIONS_VERSION = "1.0.0" as const;

export type MMGCommerceOperationsEnvironment = "staging" | "production";
export type MMGCommerceHealthStatus = "healthy" | "degraded" | "critical" | "unknown";
export type MMGIncidentSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
export type MMGIncidentState =
  | "detected"
  | "acknowledged"
  | "mitigating"
  | "monitoring"
  | "resolved"
  | "closed";

export type MMGCommerceHealthSignalCode =
  | "database_connectivity_ratio"
  | "runtime_route_availability_ratio"
  | "webhook_delivery_failure_rate"
  | "webhook_oldest_processing_age_seconds"
  | "subscription_reconciliation_lag_seconds"
  | "scheduler_last_success_age_seconds"
  | "dispatcher_backlog_count"
  | "dispatcher_failure_rate"
  | "recovery_required_rate"
  | "signed_access_failure_rate"
  | "entitlement_consistency_failure_count"
  | "ownership_duplicate_conflict_count"
  | "e2e_evidence_age_seconds";

export interface MMGCommerceHealthMetric {
  code: MMGCommerceHealthSignalCode;
  value: number;
  unit: "ratio" | "seconds" | "count";
  sampleSize: number;
  windowSeconds: number;
  observedAt: string;
}

export interface MMGCommerceHealthPolicy {
  code: MMGCommerceHealthSignalCode;
  direction: "high_is_bad" | "low_is_bad";
  warning: number;
  critical: number;
  minimumSampleSize: number;
  criticalSeverity: Extract<MMGIncidentSeverity, "SEV1" | "SEV2">;
  title: string;
}

export interface MMGCommerceSignalEvaluation {
  code: MMGCommerceHealthSignalCode;
  status: MMGCommerceHealthStatus;
  severity: MMGIncidentSeverity | null;
  value: number;
  unit: MMGCommerceHealthMetric["unit"];
  sampleSize: number;
  observedAt: string;
  title: string;
  reasonCode:
    | "WITHIN_POLICY"
    | "WARNING_THRESHOLD_BREACHED"
    | "CRITICAL_THRESHOLD_BREACHED"
    | "INSUFFICIENT_SAMPLE"
    | "INVALID_METRIC";
}

export interface MMGCommerceHealthSnapshot {
  schemaVersion: typeof MMG_COMMERCE_OPERATIONS_VERSION;
  environment: MMGCommerceOperationsEnvironment;
  runId: string;
  releaseId: string | null;
  overallStatus: MMGCommerceHealthStatus;
  evaluatedAt: string;
  signals: MMGCommerceSignalEvaluation[];
}

export const MMG_COMMERCE_HEALTH_POLICIES: Record<
  MMGCommerceHealthSignalCode,
  MMGCommerceHealthPolicy
> = {
  database_connectivity_ratio: {
    code: "database_connectivity_ratio",
    direction: "low_is_bad",
    warning: 0.999,
    critical: 0.95,
    minimumSampleSize: 5,
    criticalSeverity: "SEV1",
    title: "Commerce database connectivity",
  },
  runtime_route_availability_ratio: {
    code: "runtime_route_availability_ratio",
    direction: "low_is_bad",
    warning: 0.99,
    critical: 0.95,
    minimumSampleSize: 10,
    criticalSeverity: "SEV1",
    title: "Commerce runtime route availability",
  },
  webhook_delivery_failure_rate: {
    code: "webhook_delivery_failure_rate",
    direction: "high_is_bad",
    warning: 0.02,
    critical: 0.05,
    minimumSampleSize: 20,
    criticalSeverity: "SEV2",
    title: "Shopify subscription webhook failures",
  },
  webhook_oldest_processing_age_seconds: {
    code: "webhook_oldest_processing_age_seconds",
    direction: "high_is_bad",
    warning: 300,
    critical: 900,
    minimumSampleSize: 1,
    criticalSeverity: "SEV2",
    title: "Oldest processing webhook",
  },
  subscription_reconciliation_lag_seconds: {
    code: "subscription_reconciliation_lag_seconds",
    direction: "high_is_bad",
    warning: 600,
    critical: 1800,
    minimumSampleSize: 1,
    criticalSeverity: "SEV2",
    title: "Subscription reconciliation lag",
  },
  scheduler_last_success_age_seconds: {
    code: "scheduler_last_success_age_seconds",
    direction: "high_is_bad",
    warning: 900,
    critical: 1800,
    minimumSampleSize: 1,
    criticalSeverity: "SEV2",
    title: "Delivery-window scheduler freshness",
  },
  dispatcher_backlog_count: {
    code: "dispatcher_backlog_count",
    direction: "high_is_bad",
    warning: 25,
    critical: 100,
    minimumSampleSize: 1,
    criticalSeverity: "SEV2",
    title: "Delivery dispatcher backlog",
  },
  dispatcher_failure_rate: {
    code: "dispatcher_failure_rate",
    direction: "high_is_bad",
    warning: 0.02,
    critical: 0.05,
    minimumSampleSize: 20,
    criticalSeverity: "SEV2",
    title: "Delivery dispatcher failures",
  },
  recovery_required_rate: {
    code: "recovery_required_rate",
    direction: "high_is_bad",
    warning: 0.1,
    critical: 0.2,
    minimumSampleSize: 10,
    criticalSeverity: "SEV2",
    title: "Packages requiring recovery",
  },
  signed_access_failure_rate: {
    code: "signed_access_failure_rate",
    direction: "high_is_bad",
    warning: 0.02,
    critical: 0.05,
    minimumSampleSize: 20,
    criticalSeverity: "SEV2",
    title: "Secure library access failures",
  },
  entitlement_consistency_failure_count: {
    code: "entitlement_consistency_failure_count",
    direction: "high_is_bad",
    warning: 1,
    critical: 2,
    minimumSampleSize: 1,
    criticalSeverity: "SEV1",
    title: "Entitlement consistency failures",
  },
  ownership_duplicate_conflict_count: {
    code: "ownership_duplicate_conflict_count",
    direction: "high_is_bad",
    warning: 1,
    critical: 1,
    minimumSampleSize: 1,
    criticalSeverity: "SEV1",
    title: "Ownership duplicate conflicts",
  },
  e2e_evidence_age_seconds: {
    code: "e2e_evidence_age_seconds",
    direction: "high_is_bad",
    warning: 64_800,
    critical: 86_400,
    minimumSampleSize: 1,
    criticalSeverity: "SEV2",
    title: "End-to-end verification freshness",
  },
};

const breached = (
  direction: MMGCommerceHealthPolicy["direction"],
  value: number,
  threshold: number,
): boolean => (direction === "high_is_bad" ? value >= threshold : value <= threshold);

export const evaluateMMGCommerceHealthMetric = (
  metric: MMGCommerceHealthMetric,
  policy: MMGCommerceHealthPolicy = MMG_COMMERCE_HEALTH_POLICIES[metric.code],
): MMGCommerceSignalEvaluation => {
  if (!Number.isFinite(metric.value) || metric.sampleSize < 0 || metric.windowSeconds < 1) {
    return {
      ...metric,
      title: policy.title,
      status: "unknown",
      severity: "SEV4",
      reasonCode: "INVALID_METRIC",
    };
  }
  if (metric.sampleSize < policy.minimumSampleSize) {
    return {
      ...metric,
      title: policy.title,
      status: "unknown",
      severity: "SEV4",
      reasonCode: "INSUFFICIENT_SAMPLE",
    };
  }
  if (breached(policy.direction, metric.value, policy.critical)) {
    return {
      ...metric,
      title: policy.title,
      status: "critical",
      severity: policy.criticalSeverity,
      reasonCode: "CRITICAL_THRESHOLD_BREACHED",
    };
  }
  if (breached(policy.direction, metric.value, policy.warning)) {
    return {
      ...metric,
      title: policy.title,
      status: "degraded",
      severity: "SEV3",
      reasonCode: "WARNING_THRESHOLD_BREACHED",
    };
  }
  return {
    ...metric,
    title: policy.title,
    status: "healthy",
    severity: null,
    reasonCode: "WITHIN_POLICY",
  };
};

export const buildMMGCommerceHealthSnapshot = (input: {
  environment: MMGCommerceOperationsEnvironment;
  runId: string;
  releaseId?: string | null;
  metrics: MMGCommerceHealthMetric[];
  evaluatedAt: Date;
}): MMGCommerceHealthSnapshot => {
  const observedCodes = new Set<MMGCommerceHealthSignalCode>();
  const signals = input.metrics.map((metric) => {
    if (observedCodes.has(metric.code)) throw new Error("MMG_HEALTH_SIGNAL_DUPLICATE");
    observedCodes.add(metric.code);
    return evaluateMMGCommerceHealthMetric(metric);
  });
  const statuses = new Set(signals.map((signal) => signal.status));
  const overallStatus: MMGCommerceHealthStatus = statuses.has("critical")
    ? "critical"
    : statuses.has("degraded") || statuses.has("unknown")
      ? "degraded"
      : signals.length === 0
        ? "unknown"
        : "healthy";
  return {
    schemaVersion: MMG_COMMERCE_OPERATIONS_VERSION,
    environment: input.environment,
    runId: input.runId,
    releaseId: input.releaseId ?? null,
    overallStatus,
    evaluatedAt: input.evaluatedAt.toISOString(),
    signals,
  };
};

export type MMGCommerceControlCode =
  | "product_publication"
  | "subscription_checkout"
  | "webhook_ingestion"
  | "delivery_scheduler"
  | "delivery_dispatcher"
  | "recommendation_automation"
  | "signed_library_access"
  | "thank_you_handoff";

export type MMGCommerceControlMode =
  | "enabled"
  | "disabled"
  | "observe_only"
  | "drain_only";

export interface MMGCommerceControlChange {
  control: MMGCommerceControlCode;
  mode: MMGCommerceControlMode;
  reasonCode: string;
  automatic: boolean;
}

export interface MMGCommerceMitigationPlan {
  incidentSeverity: MMGIncidentSeverity;
  pauseRollout: boolean;
  controlChanges: MMGCommerceControlChange[];
  destructiveDataActionAllowed: false;
  revokeDeliveredOwnershipAllowed: false;
}

const change = (
  control: MMGCommerceControlCode,
  mode: MMGCommerceControlMode,
  reasonCode: string,
): MMGCommerceControlChange => ({ control, mode, reasonCode, automatic: true });

export const deriveMMGCommerceMitigationPlan = (
  signal: MMGCommerceSignalEvaluation,
): MMGCommerceMitigationPlan | null => {
  if (!signal.severity || !["SEV1", "SEV2"].includes(signal.severity)) return null;
  const changes: MMGCommerceControlChange[] = [
    change("subscription_checkout", "disabled", signal.code),
    change("recommendation_automation", "observe_only", signal.code),
  ];
  if (
    signal.code === "scheduler_last_success_age_seconds" ||
    signal.code === "entitlement_consistency_failure_count" ||
    signal.code === "ownership_duplicate_conflict_count" ||
    signal.code === "database_connectivity_ratio"
  ) {
    changes.push(change("delivery_scheduler", "disabled", signal.code));
  }
  if (
    signal.code === "dispatcher_backlog_count" ||
    signal.code === "dispatcher_failure_rate" ||
    signal.code === "entitlement_consistency_failure_count" ||
    signal.code === "ownership_duplicate_conflict_count" ||
    signal.code === "database_connectivity_ratio"
  ) {
    changes.push(change("delivery_dispatcher", "drain_only", signal.code));
  }
  if (signal.code === "signed_access_failure_rate") {
    changes.push(change("signed_library_access", "disabled", signal.code));
  }
  if (signal.code === "runtime_route_availability_ratio") {
    changes.push(change("thank_you_handoff", "observe_only", signal.code));
  }
  return {
    incidentSeverity: signal.severity,
    pauseRollout: true,
    controlChanges: changes,
    destructiveDataActionAllowed: false,
    revokeDeliveredOwnershipAllowed: false,
  };
};

export type MMGCommerceRolloutStage =
  | "internal"
  | "pilot"
  | "limited"
  | "expanded"
  | "full"
  | "paused";

export interface MMGCommerceRolloutStagePolicy {
  stage: Exclude<MMGCommerceRolloutStage, "paused">;
  cohortPercentage: number;
  allowlistOnly: boolean;
  minimumObservationHours: number;
  freshE2ERequired: boolean;
  executiveApprovalRequired: boolean;
}

export const MMG_COMMERCE_ROLLOUT_STAGES: Record<
  Exclude<MMGCommerceRolloutStage, "paused">,
  MMGCommerceRolloutStagePolicy
> = {
  internal: {
    stage: "internal",
    cohortPercentage: 0,
    allowlistOnly: true,
    minimumObservationHours: 24,
    freshE2ERequired: true,
    executiveApprovalRequired: false,
  },
  pilot: {
    stage: "pilot",
    cohortPercentage: 5,
    allowlistOnly: false,
    minimumObservationHours: 24,
    freshE2ERequired: true,
    executiveApprovalRequired: false,
  },
  limited: {
    stage: "limited",
    cohortPercentage: 25,
    allowlistOnly: false,
    minimumObservationHours: 48,
    freshE2ERequired: true,
    executiveApprovalRequired: false,
  },
  expanded: {
    stage: "expanded",
    cohortPercentage: 50,
    allowlistOnly: false,
    minimumObservationHours: 72,
    freshE2ERequired: true,
    executiveApprovalRequired: true,
  },
  full: {
    stage: "full",
    cohortPercentage: 100,
    allowlistOnly: false,
    minimumObservationHours: 72,
    freshE2ERequired: true,
    executiveApprovalRequired: true,
  },
};

const stageOrder: Array<Exclude<MMGCommerceRolloutStage, "paused">> = [
  "internal",
  "pilot",
  "limited",
  "expanded",
  "full",
];

export interface MMGCommerceRolloutTransitionDecision {
  allowed: boolean;
  blockers: string[];
  targetPercentage: number;
  targetObservationHours: number;
}

export const evaluateMMGCommerceRolloutTransition = (input: {
  currentStage: MMGCommerceRolloutStage;
  targetStage: MMGCommerceRolloutStage;
  observedHours: number;
  openSev1Count: number;
  openSev2Count: number;
  latestHealthStatus: MMGCommerceHealthStatus;
  consistencyAuditPassed: boolean;
  freshE2EPassed: boolean;
  executiveApprovalPresent: boolean;
}): MMGCommerceRolloutTransitionDecision => {
  if (input.targetStage === "paused") {
    return { allowed: true, blockers: [], targetPercentage: 0, targetObservationHours: 0 };
  }
  const target = MMG_COMMERCE_ROLLOUT_STAGES[input.targetStage];
  const blockers: string[] = [];
  if (input.currentStage === "paused") {
    blockers.push("PAUSED_ROLLOUT_REQUIRES_EXPLICIT_RESUME_STAGE");
  } else {
    const currentIndex = stageOrder.indexOf(input.currentStage);
    const targetIndex = stageOrder.indexOf(input.targetStage);
    if (targetIndex > currentIndex + 1) blockers.push("ROLLOUT_STAGE_SKIP_FORBIDDEN");
    if (targetIndex > currentIndex && input.observedHours < MMG_COMMERCE_ROLLOUT_STAGES[input.currentStage].minimumObservationHours) {
      blockers.push("OBSERVATION_WINDOW_INCOMPLETE");
    }
  }
  if (input.openSev1Count > 0) blockers.push("OPEN_SEV1_INCIDENT");
  if (input.openSev2Count > 0) blockers.push("OPEN_SEV2_INCIDENT");
  if (["critical", "unknown"].includes(input.latestHealthStatus)) {
    blockers.push("HEALTH_STATUS_NOT_ELIGIBLE");
  }
  if (!input.consistencyAuditPassed) blockers.push("CONSISTENCY_AUDIT_REQUIRED");
  if (target.freshE2ERequired && !input.freshE2EPassed) blockers.push("FRESH_E2E_REQUIRED");
  if (target.executiveApprovalRequired && !input.executiveApprovalPresent) {
    blockers.push("ROLLOUT_APPROVAL_REQUIRED");
  }
  return {
    allowed: blockers.length === 0,
    blockers,
    targetPercentage: target.cohortPercentage,
    targetObservationHours: target.minimumObservationHours,
  };
};

export const MMG_SAFE_INITIAL_CONTROLS: Record<
  MMGCommerceControlCode,
  MMGCommerceControlMode
> = {
  product_publication: "disabled",
  subscription_checkout: "disabled",
  webhook_ingestion: "enabled",
  delivery_scheduler: "disabled",
  delivery_dispatcher: "disabled",
  recommendation_automation: "observe_only",
  signed_library_access: "disabled",
  thank_you_handoff: "observe_only",
};
