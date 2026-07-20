import type {
  MMGCommerceOperationsEnvironment,
  MMGCommerceSignalEvaluation,
  MMGIncidentSeverity,
} from "./commerce-operations-control.js";
import type { MMGCommerceIncidentRecord } from "./commerce-operations-service.js";

export type MMGCommerceAlertChannel =
  | "on_call_pager"
  | "operations_email"
  | "operations_chat"
  | "executive_briefing";

export interface MMGCommerceAlertPolicy {
  severity: MMGIncidentSeverity;
  channels: MMGCommerceAlertChannel[];
  acknowledgementTargetMinutes: number;
  mitigationTargetMinutes: number;
  repeatMinutes: number;
  suppressible: boolean;
}

export const MMG_COMMERCE_ALERT_POLICIES: Record<
  MMGIncidentSeverity,
  MMGCommerceAlertPolicy
> = {
  SEV1: {
    severity: "SEV1",
    channels: [
      "on_call_pager",
      "operations_email",
      "operations_chat",
      "executive_briefing",
    ],
    acknowledgementTargetMinutes: 15,
    mitigationTargetMinutes: 30,
    repeatMinutes: 5,
    suppressible: false,
  },
  SEV2: {
    severity: "SEV2",
    channels: ["on_call_pager", "operations_email", "operations_chat"],
    acknowledgementTargetMinutes: 30,
    mitigationTargetMinutes: 120,
    repeatMinutes: 15,
    suppressible: false,
  },
  SEV3: {
    severity: "SEV3",
    channels: ["operations_email", "operations_chat"],
    acknowledgementTargetMinutes: 240,
    mitigationTargetMinutes: 1_440,
    repeatMinutes: 60,
    suppressible: true,
  },
  SEV4: {
    severity: "SEV4",
    channels: ["operations_email"],
    acknowledgementTargetMinutes: 1_440,
    mitigationTargetMinutes: 2_880,
    repeatMinutes: 1_440,
    suppressible: true,
  },
};

export interface MMGCommerceAlertPlan {
  schemaVersion: "1.0.0";
  incidentId: string;
  environment: MMGCommerceOperationsEnvironment;
  severity: MMGIncidentSeverity;
  channels: MMGCommerceAlertChannel[];
  acknowledgementDueAt: string;
  mitigationDueAt: string;
  repeatAfter: string;
  deduplicationKey: string;
  customerDataIncluded: false;
  rawProviderPayloadIncluded: false;
}

export const buildMMGCommerceAlertPlan = (input: {
  incident: MMGCommerceIncidentRecord;
  signal: MMGCommerceSignalEvaluation;
  occurredAt: Date;
}): MMGCommerceAlertPlan => {
  const policy = MMG_COMMERCE_ALERT_POLICIES[input.incident.severity];
  const at = input.occurredAt.getTime();
  return {
    schemaVersion: "1.0.0",
    incidentId: input.incident.incidentId,
    environment: input.incident.environment,
    severity: input.incident.severity,
    channels: [...policy.channels],
    acknowledgementDueAt: new Date(
      at + policy.acknowledgementTargetMinutes * 60_000,
    ).toISOString(),
    mitigationDueAt: new Date(
      at + policy.mitigationTargetMinutes * 60_000,
    ).toISOString(),
    repeatAfter: new Date(at + policy.repeatMinutes * 60_000).toISOString(),
    deduplicationKey: `${input.incident.incidentId}:${input.signal.reasonCode}:${input.incident.version}`,
    customerDataIncluded: false,
    rawProviderPayloadIncluded: false,
  };
};
