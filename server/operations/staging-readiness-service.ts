import {
  evaluateMMGStagingReadiness,
  type MMGStagingReadinessReport,
  type MMGStagingReadinessSnapshot,
} from "./staging-readiness-inspector.js";

export interface MMGStagingReadinessCommand {
  requestId: string;
  environment: "staging";
  releaseId: string;
  releaseCommitSha: string;
  tooling: MMGStagingReadinessSnapshot["tooling"];
  githubEnvironment: MMGStagingReadinessSnapshot["githubEnvironment"];
  publicationAllowed: false;
  liveCustomerDataAllowed: false;
}

export interface MMGStagingReadinessPrincipal {
  actorId: string;
  roles: string[];
}

export interface MMGStagingReadinessGateway {
  inspect(input: {
    releaseId: string;
    releaseCommitSha: string;
    tooling: MMGStagingReadinessSnapshot["tooling"];
    githubEnvironment: MMGStagingReadinessSnapshot["githubEnvironment"];
    occurredAt: Date;
  }): Promise<MMGStagingReadinessSnapshot>;
}

export interface MMGStagingReadinessDependencies {
  gateway: MMGStagingReadinessGateway;
  now(): Date;
}

const identifier = (value: string, code: string): string => {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
};

const booleanOrNull = (value: boolean | null, code: string): boolean | null => {
  if (value !== true && value !== false && value !== null) throw new Error(code);
  return value;
};

const validate = (
  command: MMGStagingReadinessCommand,
): MMGStagingReadinessCommand => {
  identifier(command.requestId, "MMG_STAGING_READINESS_REQUEST_ID_INVALID");
  identifier(command.releaseId, "MMG_STAGING_READINESS_RELEASE_ID_INVALID");
  if (command.environment !== "staging") {
    throw new Error("MMG_STAGING_READINESS_STAGING_ONLY");
  }
  if (!/^[a-f0-9]{40}$/.test(command.releaseCommitSha)) {
    throw new Error("MMG_STAGING_READINESS_COMMIT_SHA_INVALID");
  }
  if (command.publicationAllowed !== false || command.liveCustomerDataAllowed !== false) {
    throw new Error("MMG_STAGING_READINESS_SAFETY_CONTRACT_VIOLATION");
  }
  const nodeMajor = command.tooling.nodeMajor;
  if (nodeMajor !== null && (!Number.isInteger(nodeMajor) || nodeMajor < 1 || nodeMajor > 99)) {
    throw new Error("MMG_STAGING_READINESS_NODE_VERSION_INVALID");
  }
  booleanOrNull(command.tooling.psqlAvailable, "MMG_STAGING_READINESS_PSQL_EVIDENCE_INVALID");
  booleanOrNull(
    command.tooling.sha256ToolAvailable,
    "MMG_STAGING_READINESS_SHA256_EVIDENCE_INVALID",
  );
  booleanOrNull(
    command.githubEnvironment.configured,
    "MMG_STAGING_READINESS_GITHUB_ENVIRONMENT_EVIDENCE_INVALID",
  );
  booleanOrNull(
    command.githubEnvironment.requiredSecretNamesPresent,
    "MMG_STAGING_READINESS_GITHUB_SECRETS_EVIDENCE_INVALID",
  );
  return command;
};

const authorize = (principal: MMGStagingReadinessPrincipal): void => {
  if (!principal.roles.includes("mmg-commerce-staging-integrator")) {
    throw new Error("MMG_STAGING_READINESS_ROLE_REQUIRED");
  }
};

export const executeMMGStagingReadinessInspection = async (input: {
  command: MMGStagingReadinessCommand;
  principal: MMGStagingReadinessPrincipal;
  dependencies: MMGStagingReadinessDependencies;
}): Promise<MMGStagingReadinessReport> => {
  const command = validate(input.command);
  authorize(input.principal);
  const occurredAt = input.dependencies.now();
  const snapshot = await input.dependencies.gateway.inspect({
    releaseId: command.releaseId,
    releaseCommitSha: command.releaseCommitSha,
    tooling: command.tooling,
    githubEnvironment: command.githubEnvironment,
    occurredAt,
  });
  if (
    snapshot.environment !== "staging" ||
    snapshot.publicationAllowed !== false ||
    snapshot.liveCustomerDataAllowed !== false
  ) {
    throw new Error("MMG_STAGING_READINESS_GATEWAY_SAFETY_VIOLATION");
  }
  return evaluateMMGStagingReadiness(snapshot);
};
