import type {
  MMGCommerceOperationsEnvironment,
  MMGCommerceSignalEvaluation,
} from "./commerce-operations-control.js";
import type {
  MMGCommerceControlState,
  MMGCommerceIncidentRecord,
  MMGCommerceOperationsRepository,
} from "./commerce-operations-service.js";

export interface MMGCommerceOperationsDashboardPrincipal {
  actorId: string;
  sessionId: string;
  roles: string[];
}

export interface MMGCommerceOperationsDashboardView {
  schemaVersion: "1.0.0";
  environment: MMGCommerceOperationsEnvironment;
  generatedAt: string;
  health: {
    status: "healthy" | "degraded" | "critical" | "unknown";
    evaluatedAt: string | null;
    releaseId: string | null;
    signals: Array<
      Pick<
        MMGCommerceSignalEvaluation,
        | "code"
        | "status"
        | "severity"
        | "value"
        | "unit"
        | "sampleSize"
        | "observedAt"
        | "title"
        | "reasonCode"
      >
    >;
  };
  rollout: {
    releaseId: string | null;
    stage: string;
    cohortPercentage: number;
    status: string;
    enteredAt: string | null;
    observationUntil: string | null;
    version: number | null;
  };
  incidents: Array<
    Pick<
      MMGCommerceIncidentRecord,
      | "incidentId"
      | "signalCode"
      | "severity"
      | "state"
      | "title"
      | "summary"
      | "firstSeenAt"
      | "lastSeenAt"
      | "version"
    >
  >;
  controls: MMGCommerceControlState[];
  consistency: {
    status: "passed" | "failed" | "unknown";
    auditId: string | null;
    releaseId: string | null;
    completedAt: string | null;
    failedChecks: string[];
  };
  verification: {
    freshReleaseEvidenceReported: boolean;
    advisoryOnly: true;
  };
  mutationsAvailableInBrowser: false;
}

const requireOperator = (
  principal: MMGCommerceOperationsDashboardPrincipal,
): void => {
  if (!principal.roles.includes("mmg-commerce-operator")) {
    throw new Error("MMG_COMMERCE_OPERATOR_ROLE_REQUIRED");
  }
};

export const buildMMGCommerceOperationsDashboard = async (input: {
  environment: MMGCommerceOperationsEnvironment;
  principal: MMGCommerceOperationsDashboardPrincipal;
  repository: MMGCommerceOperationsRepository;
  generatedAt: Date;
}): Promise<MMGCommerceOperationsDashboardView> => {
  requireOperator(input.principal);
  const state = await input.repository.loadState(input.environment);
  const failedChecks =
    state.latestConsistencyAudit?.checks
      .filter((entry) => entry.status === "failed")
      .map((entry) => entry.code) ?? [];
  return {
    schemaVersion: "1.0.0",
    environment: input.environment,
    generatedAt: input.generatedAt.toISOString(),
    health: {
      status: state.latestHealth?.overallStatus ?? "unknown",
      evaluatedAt: state.latestHealth?.evaluatedAt ?? null,
      releaseId: state.latestHealth?.releaseId ?? null,
      signals:
        state.latestHealth?.signals.map((signal) => ({
          code: signal.code,
          status: signal.status,
          severity: signal.severity,
          value: signal.value,
          unit: signal.unit,
          sampleSize: signal.sampleSize,
          observedAt: signal.observedAt,
          title: signal.title,
          reasonCode: signal.reasonCode,
        })) ?? [],
    },
    rollout: {
      releaseId: state.rollout?.releaseId ?? null,
      stage: state.rollout?.stage ?? "not_initialized",
      cohortPercentage: state.rollout?.cohortPercentage ?? 0,
      status: state.rollout?.status ?? "not_initialized",
      enteredAt: state.rollout?.enteredAt ?? null,
      observationUntil: state.rollout?.observationUntil ?? null,
      version: state.rollout?.version ?? null,
    },
    incidents: state.openIncidents.map((incident) => ({
      incidentId: incident.incidentId,
      signalCode: incident.signalCode,
      severity: incident.severity,
      state: incident.state,
      title: incident.title,
      summary: incident.summary,
      firstSeenAt: incident.firstSeenAt,
      lastSeenAt: incident.lastSeenAt,
      version: incident.version,
    })),
    controls: state.controls.map((control) => ({ ...control })),
    consistency: {
      status: state.latestConsistencyAudit?.status ?? "unknown",
      auditId: state.latestConsistencyAudit?.auditId ?? null,
      releaseId: state.latestConsistencyAudit?.releaseId ?? null,
      completedAt: state.latestConsistencyAudit?.completedAt ?? null,
      failedChecks,
    },
    verification: {
      freshReleaseEvidenceReported: state.freshE2EPassed,
      advisoryOnly: true,
    },
    mutationsAvailableInBrowser: false,
  };
};
