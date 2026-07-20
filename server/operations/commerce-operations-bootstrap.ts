import {
  MMG_SAFE_INITIAL_CONTROLS,
  type MMGCommerceOperationsEnvironment,
} from "./commerce-operations-control.js";
import type {
  MMGCommerceOperationsPrincipal,
  MMGCommerceOperationsRepository,
} from "./commerce-operations-service.js";
import type { MMGCommerceControlAdapter } from "./commerce-operations-service.js";

export const bootstrapMMGCommerceOperations = async (input: {
  environment: MMGCommerceOperationsEnvironment;
  releaseId: string;
  principal: MMGCommerceOperationsPrincipal;
  repository: MMGCommerceOperationsRepository;
  controls: MMGCommerceControlAdapter;
  occurredAt: Date;
}): Promise<void> => {
  if (!input.principal.roles.includes("mmg-commerce-operator")) {
    throw new Error("MMG_COMMERCE_OPERATOR_ROLE_REQUIRED");
  }
  for (const [control, mode] of Object.entries(MMG_SAFE_INITIAL_CONTROLS)) {
    const change = {
      control: control as keyof typeof MMG_SAFE_INITIAL_CONTROLS,
      mode,
      reasonCode: "safe_initial_bootstrap",
      automatic: false,
    };
    await input.controls.applyControl({
      environment: input.environment,
      change,
      occurredAt: input.occurredAt,
    });
    await input.repository.setControl({
      environment: input.environment,
      change,
      actorId: input.principal.actorId,
      occurredAt: input.occurredAt,
    });
  }
  await input.controls.applyRollout({
    environment: input.environment,
    releaseId: input.releaseId,
    stage: "paused",
    cohortPercentage: 0,
    occurredAt: input.occurredAt,
  });
  await input.repository.setRollout({
    environment: input.environment,
    releaseId: input.releaseId,
    stage: "paused",
    cohortPercentage: 0,
    observationUntil: null,
    actorId: input.principal.actorId,
    status: "paused",
    reason: "safe_initial_bootstrap",
    occurredAt: input.occurredAt,
  });
};
