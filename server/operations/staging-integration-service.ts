import type {
  MMGCommerceControlCode,
  MMGCommerceControlMode,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";

export const MMG_STAGING_INTEGRATION_VERSION = "1.0.0" as const;

export type MMGStagingIntegrationAction = "inspect" | "bootstrap" | "verify";

export interface MMGStagingIntegrationCommand {
  requestId: string;
  integrationRunId: string;
  releaseId: string;
  releaseCommitSha: string;
  action: MMGStagingIntegrationAction;
}

export interface MMGStagingIntegrationPrincipal {
  actorId: string;
  roles: string[];
}

export interface MMGStagingAdapterHeartbeat {
  adapterCode: string;
  status: "healthy" | "degraded" | "unavailable" | "unknown";
  releaseId: string | null;
  observedAt: string;
}

export interface MMGStagingIntegrationSnapshot {
  schemaVersion: typeof MMG_STAGING_INTEGRATION_VERSION;
  environment: "staging";
  releaseId: string;
  releaseCommitSha: string;
  migrationIds: string[];
  routeProbe: { successes: number; total: number };
  heartbeats: MMGStagingAdapterHeartbeat[];
  controls: Partial<Record<MMGCommerceControlCode, MMGCommerceControlMode>>;
  rollout: {
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
  } | null;
  rehearsalEvidencePassed: boolean;
  publicationAllowed: false;
  liveCustomerDataAllowed: false;
  inspectedAt: string;
}

export interface MMGStagingIntegrationRepository {
  claim(input: {
    command: MMGStagingIntegrationCommand;
    actorId: string;
    occurredAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision">;
  complete(input: {
    command: MMGStagingIntegrationCommand;
    status: "planned" | "verified";
    snapshot: MMGStagingIntegrationSnapshot;
    occurredAt: Date;
  }): Promise<void>;
  fail(input: {
    command: MMGStagingIntegrationCommand;
    errorCode: string;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGStagingIntegrationGateway {
  inspect(input: {
    releaseId: string;
    releaseCommitSha: string;
    occurredAt: Date;
  }): Promise<MMGStagingIntegrationSnapshot>;
  bootstrapSafeState(input: {
    releaseId: string;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGStagingIntegrationDependencies {
  repository: MMGStagingIntegrationRepository;
  gateway: MMGStagingIntegrationGateway;
  now(): Date;
}

export const MMG_REQUIRED_STAGING_MIGRATIONS = Object.freeze([
  "20260720_001_mmg_knowledge_entitlements",
  "20260720_002_mmg_delivery_window_controller",
  "20260720_003_mmg_thank_you_first_title_handoff",
  "20260720_004_mmg_my_library_delivery",
  "20260720_005_mmg_shopify_subscription_reconciliation",
  "20260720_006_mmg_recommendation_curation_ranking",
  "20260720_007_mmg_live_commerce_deployment_control",
  "20260720_008_mmg_commerce_operations_control",
  "20260720_009_mmg_commerce_operations_integrity",
  "20260721_010_mmg_production_adapters_staging_rehearsal",
  "20260721_011_mmg_staging_integration_execution",
]);

export const MMG_REQUIRED_STAGING_ADAPTERS = Object.freeze([
  "database",
  "runtime_routes",
  "runtime_controls",
  "alerts",
  "scheduler",
  "dispatcher",
  "storage_signer",
  "admin_auth",
]);

const SAFE_CONTROLS: Partial<
  Record<MMGCommerceControlCode, MMGCommerceControlMode>
> = {
  product_publication: "observe_only",
  subscription_checkout: "disabled",
  webhook_ingestion: "enabled",
  delivery_scheduler: "disabled",
  delivery_dispatcher: "disabled",
  recommendation_automation: "observe_only",
  signed_library_access: "disabled",
  thank_you_handoff: "disabled",
};

const identifier = (value: string, code: string): string => {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
};

const validateCommand = (
  command: MMGStagingIntegrationCommand,
): MMGStagingIntegrationCommand => {
  identifier(command.requestId, "MMG_STAGING_INTEGRATION_REQUEST_ID_INVALID");
  identifier(
    command.integrationRunId,
    "MMG_STAGING_INTEGRATION_RUN_ID_INVALID",
  );
  identifier(command.releaseId, "MMG_STAGING_INTEGRATION_RELEASE_ID_INVALID");
  if (!/^[a-f0-9]{40}$/.test(command.releaseCommitSha)) {
    throw new Error("MMG_STAGING_INTEGRATION_COMMIT_SHA_INVALID");
  }
  if (!new Set<MMGStagingIntegrationAction>(["inspect", "bootstrap", "verify"]).has(command.action)) {
    throw new Error("MMG_STAGING_INTEGRATION_ACTION_INVALID");
  }
  return command;
};

const assertAuthorized = (principal: MMGStagingIntegrationPrincipal): void => {
  if (!principal.roles.includes("mmg-commerce-staging-integrator")) {
    throw new Error("MMG_STAGING_INTEGRATOR_ROLE_REQUIRED");
  }
};

export const stagingIntegrationBlockers = (
  snapshot: MMGStagingIntegrationSnapshot,
): string[] => {
  const blockers: string[] = [];
  const applied = new Set(snapshot.migrationIds);
  for (const migration of MMG_REQUIRED_STAGING_MIGRATIONS) {
    if (!applied.has(migration)) blockers.push(`MISSING_MIGRATION:${migration}`);
  }
  if (
    snapshot.routeProbe.total < 1 ||
    snapshot.routeProbe.successes !== snapshot.routeProbe.total
  ) {
    blockers.push("STAGING_RUNTIME_ROUTES_UNAVAILABLE");
  }
  const heartbeats = new Map(
    snapshot.heartbeats.map((heartbeat) => [heartbeat.adapterCode, heartbeat]),
  );
  for (const adapter of MMG_REQUIRED_STAGING_ADAPTERS) {
    const heartbeat = heartbeats.get(adapter);
    if (!heartbeat) {
      blockers.push(`MISSING_ADAPTER_HEARTBEAT:${adapter}`);
    } else if (heartbeat.status !== "healthy") {
      blockers.push(`ADAPTER_NOT_HEALTHY:${adapter}:${heartbeat.status}`);
    } else if (heartbeat.releaseId !== snapshot.releaseId) {
      blockers.push(`ADAPTER_RELEASE_MISMATCH:${adapter}`);
    }
  }
  for (const [control, expected] of Object.entries(SAFE_CONTROLS)) {
    if (snapshot.controls[control as MMGCommerceControlCode] !== expected) {
      blockers.push(`UNSAFE_CONTROL:${control}`);
    }
  }
  if (
    snapshot.rollout?.stage !== "paused" ||
    snapshot.rollout.cohortPercentage !== 0 ||
    snapshot.rollout.releaseId !== snapshot.releaseId
  ) {
    blockers.push("STAGING_ROLLOUT_NOT_SAFELY_PAUSED");
  }
  if (snapshot.publicationAllowed || snapshot.liveCustomerDataAllowed) {
    blockers.push("STAGING_SAFETY_BOUNDARY_VIOLATED");
  }
  return blockers;
};

export const executeMMGStagingIntegrationCommand = async (input: {
  command: MMGStagingIntegrationCommand;
  principal: MMGStagingIntegrationPrincipal;
  dependencies: MMGStagingIntegrationDependencies;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const command = validateCommand(input.command);
  assertAuthorized(input.principal);
  const occurredAt = input.dependencies.now();
  const claim = await input.dependencies.repository.claim({
    command,
    actorId: input.principal.actorId,
    occurredAt,
  });
  if (claim === "collision") {
    throw new Error("MMG_STAGING_INTEGRATION_REQUEST_COLLISION");
  }
  if (claim === "duplicate_completed") {
    return {
      status: 200,
      body: {
        ok: true,
        status: "duplicate_ignored",
        integrationRunId: command.integrationRunId,
      },
    };
  }

  try {
    if (command.action === "bootstrap") {
      await input.dependencies.gateway.bootstrapSafeState({
        releaseId: command.releaseId,
        occurredAt,
      });
    }
    const snapshot = await input.dependencies.gateway.inspect({
      releaseId: command.releaseId,
      releaseCommitSha: command.releaseCommitSha,
      occurredAt: input.dependencies.now(),
    });
    const blockers = stagingIntegrationBlockers(snapshot);
    const verified = blockers.length === 0;
    if (command.action === "verify" && !verified) {
      throw new Error(`MMG_STAGING_INTEGRATION_BLOCKED:${blockers.join(",")}`);
    }
    const status = command.action === "verify" ? "verified" : "planned";
    await input.dependencies.repository.complete({
      command,
      status,
      snapshot,
      occurredAt: input.dependencies.now(),
    });
    return {
      status: verified || command.action !== "verify" ? 200 : 409,
      body: {
        ok: command.action !== "verify" || verified,
        status,
        snapshot,
        blockers,
      },
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "MMG_STAGING_INTEGRATION_FAILED";
    await input.dependencies.repository.fail({
      command,
      errorCode: code.split(":", 1)[0],
      occurredAt: input.dependencies.now(),
    });
    throw error;
  }
};
