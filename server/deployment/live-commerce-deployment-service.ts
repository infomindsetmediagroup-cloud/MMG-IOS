import {
  assertMMGCommerceReleaseApproval,
  buildMMGCommerceDeploymentPlan,
  type MMGCommerceDeploymentAction,
  type MMGCommerceDeploymentEnvironment,
  type MMGCommerceDeploymentPhase,
  type MMGCommerceDeploymentPlan,
  type MMGCommerceDeploymentProbe,
  type MMGCommerceE2EEvidence,
  type MMGCommerceReleaseApproval,
  type MMGShopifyRuntimeMapping,
} from "./live-commerce-deployment.js";

export interface MMGCommerceDeploymentCommand {
  requestId: string;
  releaseId: string;
  environment: MMGCommerceDeploymentEnvironment;
  action: MMGCommerceDeploymentAction;
  releaseCommitSha: string;
  includePublication?: boolean;
  expectedReleaseVersion?: number;
}

export interface MMGCommerceDeploymentPrincipal {
  actorId: string;
  sessionId: string;
  roles: string[];
}

export interface MMGCommerceDeploymentRepository {
  claimRequest(input: {
    requestId: string;
    releaseId: string;
    action: MMGCommerceDeploymentAction;
    payloadHash: string;
    occurredAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision">;
  loadApproval(releaseId: string): Promise<MMGCommerceReleaseApproval | null>;
  loadReleaseVersion(releaseId: string): Promise<number | null>;
  beginRelease(input: {
    command: MMGCommerceDeploymentCommand;
    principal: MMGCommerceDeploymentPrincipal;
    plan: MMGCommerceDeploymentPlan;
    occurredAt: Date;
  }): Promise<{ version: number; created: boolean }>;
  recordStep(input: {
    releaseId: string;
    expectedReleaseVersion: number;
    phase: MMGCommerceDeploymentPhase;
    status: "running" | "completed" | "failed" | "rolled_back";
    result: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<{ version: number }>;
  completeRequest(input: {
    requestId: string;
    releaseId: string;
    outcome: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void>;
  failRequest(input: {
    requestId: string;
    releaseId: string;
    errorCode: string;
    occurredAt: Date;
  }): Promise<void>;
  saveRuntimeMapping(input: {
    releaseId: string;
    mapping: MMGShopifyRuntimeMapping;
    occurredAt: Date;
  }): Promise<void>;
  saveE2EEvidence(input: {
    releaseId: string;
    evidence: MMGCommerceE2EEvidence;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGCommerceDeploymentGateway {
  probe(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
  }): Promise<MMGCommerceDeploymentProbe>;
  applyPhase(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
    phase: MMGCommerceDeploymentPhase;
    releaseCommitSha: string;
    approval: MMGCommerceReleaseApproval | null;
    occurredAt: Date;
  }): Promise<{
    status: "completed" | "not_applicable";
    result: Record<string, unknown>;
    runtimeMapping?: MMGShopifyRuntimeMapping;
    e2eEvidence?: MMGCommerceE2EEvidence;
  }>;
  rollbackPhase(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
    phase: MMGCommerceDeploymentPhase;
    releaseCommitSha: string;
    approval: MMGCommerceReleaseApproval | null;
    occurredAt: Date;
  }): Promise<{
    status: "rolled_back" | "not_applicable";
    result: Record<string, unknown>;
  }>;
}

export interface MMGCommerceDeploymentServiceDependencies {
  repository: MMGCommerceDeploymentRepository;
  gateway: MMGCommerceDeploymentGateway;
  now(): Date;
  hashPayload(command: MMGCommerceDeploymentCommand): string;
}

const MAX_E2E_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

const executablePhases: MMGCommerceDeploymentPhase[] = [
  "application_scopes",
  "database_migrations",
  "runtime_routes",
  "shopify_product",
  "selling_plan",
  "asset_registry",
  "storefront_components",
  "webhook_release",
  "scheduler_and_dispatcher",
  "end_to_end_verification",
];

const validateCommand = (
  command: MMGCommerceDeploymentCommand,
): MMGCommerceDeploymentCommand => {
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(command.requestId.trim())) {
    throw new Error("MMG_DEPLOYMENT_REQUEST_ID_INVALID");
  }
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(command.releaseId.trim())) {
    throw new Error("MMG_DEPLOYMENT_RELEASE_ID_INVALID");
  }
  if (!/^[a-f0-9]{40}$/.test(command.releaseCommitSha)) {
    throw new Error("MMG_DEPLOYMENT_COMMIT_SHA_INVALID");
  }
  if (
    command.expectedReleaseVersion !== undefined &&
    (!Number.isInteger(command.expectedReleaseVersion) ||
      command.expectedReleaseVersion < 1)
  ) {
    throw new Error("MMG_DEPLOYMENT_RELEASE_VERSION_INVALID");
  }
  return command;
};

const assertPrincipal = (
  principal: MMGCommerceDeploymentPrincipal,
  command: MMGCommerceDeploymentCommand,
): void => {
  const roles = new Set(principal.roles);
  if (!roles.has("mmg-commerce-deployer")) {
    throw new Error("MMG_DEPLOYMENT_ROLE_REQUIRED");
  }
  if (
    command.environment === "production" &&
    !roles.has("mmg-production-release-manager")
  ) {
    throw new Error("MMG_PRODUCTION_RELEASE_ROLE_REQUIRED");
  }
};

const actionNeedsApproval = (command: MMGCommerceDeploymentCommand): boolean =>
  command.action === "publish" ||
  (command.environment === "production" &&
    (command.action === "execute" ||
      command.action === "verify" ||
      command.action === "rollback"));

const loadApproval = async (input: {
  repository: MMGCommerceDeploymentRepository;
  command: MMGCommerceDeploymentCommand;
  now: Date;
}): Promise<MMGCommerceReleaseApproval | null> => {
  if (!actionNeedsApproval(input.command)) return null;
  return assertMMGCommerceReleaseApproval({
    approval: await input.repository.loadApproval(input.command.releaseId),
    environment: input.command.environment,
    action: input.command.action,
    releaseCommitSha: input.command.releaseCommitSha,
    now: input.now,
  });
};

const phasesFor = (
  command: MMGCommerceDeploymentCommand,
): MMGCommerceDeploymentPhase[] => {
  if (command.action === "publish") return ["publication"];
  if (command.action === "verify") return ["end_to_end_verification"];
  if (command.action === "rollback") return [...executablePhases].reverse();
  return executablePhases;
};

const publicationPrerequisiteBlockers = (
  plan: MMGCommerceDeploymentPlan,
): string[] =>
  plan.blockers.filter((code) => code !== "PUBLICATION_NOT_COMPLETED");

const assertFreshReleaseEvidence = (input: {
  evidence: MMGCommerceE2EEvidence | null;
  command: MMGCommerceDeploymentCommand;
  now: Date;
}): void => {
  const evidence = input.evidence;
  if (!evidence) throw new Error("MMG_DEPLOYMENT_PUBLICATION_REQUIRES_E2E");
  if (evidence.environment !== input.command.environment) {
    throw new Error("MMG_DEPLOYMENT_E2E_ENVIRONMENT_MISMATCH");
  }
  if (!evidence.runId.startsWith(`e2e:${input.command.releaseId}:`)) {
    throw new Error("MMG_DEPLOYMENT_E2E_RELEASE_MISMATCH");
  }
  const completedAt = Date.parse(evidence.completedAt);
  if (
    !Number.isFinite(completedAt) ||
    completedAt > input.now.getTime() ||
    input.now.getTime() - completedAt > MAX_E2E_EVIDENCE_AGE_MS
  ) {
    throw new Error("MMG_DEPLOYMENT_E2E_EVIDENCE_STALE");
  }
  if (
    Object.keys(evidence.checks).length === 0 ||
    Object.values(evidence.checks).some((status) => status !== "passed")
  ) {
    throw new Error("MMG_DEPLOYMENT_E2E_EVIDENCE_INCOMPLETE");
  }
};

export const executeMMGCommerceDeploymentCommand = async (input: {
  command: MMGCommerceDeploymentCommand;
  principal: MMGCommerceDeploymentPrincipal;
  dependencies: MMGCommerceDeploymentServiceDependencies;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const command = validateCommand(input.command);
  assertPrincipal(input.principal, command);
  const occurredAt = input.dependencies.now();
  const payloadHash = input.dependencies.hashPayload(command);
  if (!/^[a-f0-9]{64}$/.test(payloadHash)) {
    throw new Error("MMG_DEPLOYMENT_PAYLOAD_HASH_INVALID");
  }

  const claim = await input.dependencies.repository.claimRequest({
    requestId: command.requestId,
    releaseId: command.releaseId,
    action: command.action,
    payloadHash,
    occurredAt,
  });
  if (claim === "collision") {
    throw new Error("MMG_DEPLOYMENT_REQUEST_ID_COLLISION");
  }
  if (claim === "duplicate_completed") {
    return {
      status: 200,
      body: {
        ok: true,
        status: "duplicate_ignored",
        releaseId: command.releaseId,
      },
    };
  }

  try {
    const probe = await input.dependencies.gateway.probe({
      releaseId: command.releaseId,
      environment: command.environment,
    });
    const plan = buildMMGCommerceDeploymentPlan({
      releaseId: command.releaseId,
      environment: command.environment,
      releaseCommitSha: command.releaseCommitSha,
      generatedAt: occurredAt,
      probe,
      includePublication:
        command.includePublication === true || command.action === "publish",
    });

    if (command.action === "plan") {
      await input.dependencies.repository.completeRequest({
        requestId: command.requestId,
        releaseId: command.releaseId,
        outcome: { status: "planned", blockers: plan.blockers },
        occurredAt,
      });
      return { status: 200, body: { ok: true, status: "planned", plan } };
    }

    const approval = await loadApproval({
      repository: input.dependencies.repository,
      command,
      now: occurredAt,
    });
    const currentVersion =
      await input.dependencies.repository.loadReleaseVersion(command.releaseId);
    if (
      command.expectedReleaseVersion !== undefined &&
      currentVersion !== null &&
      currentVersion !== command.expectedReleaseVersion
    ) {
      throw new Error("MMG_DEPLOYMENT_RELEASE_VERSION_CONFLICT");
    }

    if (command.action === "publish") {
      assertFreshReleaseEvidence({
        evidence: probe.e2eEvidence,
        command,
        now: occurredAt,
      });
      const blockers = publicationPrerequisiteBlockers(plan);
      if (blockers.length > 0) {
        throw new Error(`MMG_DEPLOYMENT_PUBLICATION_BLOCKED:${blockers.join(",")}`);
      }
      if (
        plan.steps.find((entry) => entry.phase === "publication")?.status ===
        "completed"
      ) {
        await input.dependencies.repository.completeRequest({
          requestId: command.requestId,
          releaseId: command.releaseId,
          outcome: { status: "already_published" },
          occurredAt,
        });
        return {
          status: 200,
          body: { ok: true, status: "already_published", plan },
        };
      }
    }

    const release = await input.dependencies.repository.beginRelease({
      command,
      principal: input.principal,
      plan,
      occurredAt,
    });
    let releaseVersion = release.version;
    const results: Array<Record<string, unknown>> = [];

    for (const phase of phasesFor(command)) {
      const planned = plan.steps.find((entry) => entry.phase === phase);
      if (
        command.action !== "rollback" &&
        (planned?.status === "completed" || planned?.status === "not_applicable")
      ) {
        continue;
      }

      releaseVersion = (
        await input.dependencies.repository.recordStep({
          releaseId: command.releaseId,
          expectedReleaseVersion: releaseVersion,
          phase,
          status: "running",
          result: {},
          occurredAt: input.dependencies.now(),
        })
      ).version;

      try {
        if (command.action === "rollback") {
          const rolledBack = await input.dependencies.gateway.rollbackPhase({
            releaseId: command.releaseId,
            environment: command.environment,
            phase,
            releaseCommitSha: command.releaseCommitSha,
            approval,
            occurredAt: input.dependencies.now(),
          });
          releaseVersion = (
            await input.dependencies.repository.recordStep({
              releaseId: command.releaseId,
              expectedReleaseVersion: releaseVersion,
              phase,
              status: "rolled_back",
              result: rolledBack.result,
              occurredAt: input.dependencies.now(),
            })
          ).version;
          results.push({ phase, ...rolledBack });
          continue;
        }

        const applied = await input.dependencies.gateway.applyPhase({
          releaseId: command.releaseId,
          environment: command.environment,
          phase,
          releaseCommitSha: command.releaseCommitSha,
          approval,
          occurredAt: input.dependencies.now(),
        });
        if (applied.runtimeMapping) {
          await input.dependencies.repository.saveRuntimeMapping({
            releaseId: command.releaseId,
            mapping: applied.runtimeMapping,
            occurredAt: input.dependencies.now(),
          });
        }
        if (applied.e2eEvidence) {
          await input.dependencies.repository.saveE2EEvidence({
            releaseId: command.releaseId,
            evidence: applied.e2eEvidence,
            occurredAt: input.dependencies.now(),
          });
        }
        releaseVersion = (
          await input.dependencies.repository.recordStep({
            releaseId: command.releaseId,
            expectedReleaseVersion: releaseVersion,
            phase,
            status: "completed",
            result: applied.result,
            occurredAt: input.dependencies.now(),
          })
        ).version;
        results.push({ phase, ...applied });
      } catch (error) {
        await input.dependencies.repository.recordStep({
          releaseId: command.releaseId,
          expectedReleaseVersion: releaseVersion,
          phase,
          status: "failed",
          result: {
            errorCode:
              error instanceof Error
                ? error.message
                : "MMG_DEPLOYMENT_PHASE_FAILED",
          },
          occurredAt: input.dependencies.now(),
        });
        throw error;
      }
    }

    const finalProbe = await input.dependencies.gateway.probe({
      releaseId: command.releaseId,
      environment: command.environment,
    });
    const finalPlan = buildMMGCommerceDeploymentPlan({
      releaseId: command.releaseId,
      environment: command.environment,
      releaseCommitSha: command.releaseCommitSha,
      generatedAt: input.dependencies.now(),
      probe: finalProbe,
      includePublication:
        command.action === "publish" || command.includePublication === true,
    });
    const status =
      command.action === "rollback"
        ? "rolled_back"
        : command.action === "publish"
          ? "published"
          : command.action === "verify"
            ? "verified"
            : finalPlan.blockers.length > 0
              ? "executed_with_blockers"
              : "executed";

    await input.dependencies.repository.completeRequest({
      requestId: command.requestId,
      releaseId: command.releaseId,
      outcome: { status, results, blockers: finalPlan.blockers },
      occurredAt: input.dependencies.now(),
    });
    return {
      status: 200,
      body: { ok: true, status, releaseVersion, results, plan: finalPlan },
    };
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? error.message
        : "MMG_COMMERCE_DEPLOYMENT_FAILED";
    await input.dependencies.repository.failRequest({
      requestId: command.requestId,
      releaseId: command.releaseId,
      errorCode,
      occurredAt: input.dependencies.now(),
    });
    throw error;
  }
};
