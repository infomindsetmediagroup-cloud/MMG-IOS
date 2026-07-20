import { describe, expect, it, vi } from "vitest";
import {
  executeMMGCommerceDeploymentCommand,
  type MMGCommerceDeploymentRepository,
  type MMGCommerceDeploymentServiceDependencies,
} from "../server/deployment/live-commerce-deployment-service.js";
import {
  MMG_REQUIRED_MIGRATIONS,
  MMG_REQUIRED_PORTAL_COMPONENTS,
  MMG_REQUIRED_PRODUCTION_SCOPES,
  MMG_REQUIRED_RUNTIME_ENDPOINTS,
  MMG_REQUIRED_WEBHOOK_TOPICS,
  type MMGCommerceDeploymentEnvironment,
  type MMGCommerceDeploymentProbe,
} from "../server/deployment/live-commerce-deployment.js";

const releaseSha = "a".repeat(40);
const now = new Date("2026-07-20T23:00:00.000Z");

const mapping = (status: "DRAFT" | "ACTIVE") => ({
  shopDomain: "example.myshopify.com",
  apiVersion: "2026-07" as const,
  productGid: "gid://shopify/Product/1",
  variantGids: {
    monthly: "gid://shopify/ProductVariant/1",
    biweekly: "gid://shopify/ProductVariant/2",
    weekly: "gid://shopify/ProductVariant/3",
  },
  sellingPlanGroupGid: "gid://shopify/SellingPlanGroup/1",
  sellingPlanGid: "gid://shopify/SellingPlan/1",
  onlineStorePublicationGid: "gid://shopify/Publication/1",
  productStatus: status,
  verifiedAt: now.toISOString(),
});

const probe = (
  complete: boolean,
  productStatus: "DRAFT" | "ACTIVE" = "DRAFT",
  releaseId = "release-20260720-staging",
  environment: MMGCommerceDeploymentEnvironment = "staging",
): MMGCommerceDeploymentProbe => ({
  canonicalShopDomain: "example.myshopify.com",
  apiVersion: "2026-07",
  grantedScopes: complete ? [...MMG_REQUIRED_PRODUCTION_SCOPES] : [],
  appliedMigrations: complete ? [...MMG_REQUIRED_MIGRATIONS] : [],
  routedEndpoints: complete ? [...MMG_REQUIRED_RUNTIME_ENDPOINTS] : [],
  runtimeMapping: complete ? mapping(productStatus) : null,
  verifiedSelectableAssetCount: complete ? 2 : 0,
  portalComponents: complete ? [...MMG_REQUIRED_PORTAL_COMPONENTS] : [],
  webhookTopics: complete ? [...MMG_REQUIRED_WEBHOOK_TOPICS] : [],
  schedulerActive: complete,
  dispatcherActive: complete,
  storageSignerActive: complete,
  e2eEvidence: complete
    ? {
        runId: `e2e:${releaseId}:${now.toISOString()}`,
        completedAt: now.toISOString(),
        environment,
        checks: { full_path: "passed" },
        testOrderIdHash: "b".repeat(64),
        testCustomerReferenceHash: "c".repeat(64),
      }
    : null,
});

const repository = (approval: boolean): MMGCommerceDeploymentRepository => {
  let version = 1;
  return {
    claimRequest: vi.fn().mockResolvedValue("claimed"),
    loadApproval: vi.fn().mockResolvedValue(
      approval
        ? {
            approvalId: "approval-12345678",
            approvedBy: "executive-1",
            approvedAt: "2026-07-20T22:00:00.000Z",
            expiresAt: "2026-07-21T00:00:00.000Z",
            approvedActions: ["execute", "verify", "publish", "rollback"],
            approvedEnvironment: "production",
            releaseCommitSha: releaseSha,
          }
        : null,
    ),
    loadReleaseVersion: vi.fn().mockResolvedValue(null),
    beginRelease: vi
      .fn()
      .mockImplementation(async () => ({ version, created: true })),
    recordStep: vi.fn().mockImplementation(async () => ({ version: ++version })),
    completeRequest: vi.fn().mockResolvedValue(undefined),
    failRequest: vi.fn().mockResolvedValue(undefined),
    saveRuntimeMapping: vi.fn().mockResolvedValue(undefined),
    saveE2EEvidence: vi.fn().mockResolvedValue(undefined),
  };
};

describe("MMG live commerce deployment service", () => {
  it("executes staging phases without pretending to publish", async () => {
    const repo = repository(false);
    let call = 0;
    const gateway = {
      probe: vi.fn().mockImplementation(async () => probe(call++ > 0)),
      applyPhase: vi
        .fn()
        .mockResolvedValue({ status: "completed", result: {} }),
      rollbackPhase: vi.fn(),
    };
    const dependencies: MMGCommerceDeploymentServiceDependencies = {
      repository: repo,
      gateway,
      now: () => now,
      hashPayload: () => "d".repeat(64),
    };
    const response = await executeMMGCommerceDeploymentCommand({
      command: {
        requestId: "request-20260720-staging",
        releaseId: "release-20260720-staging",
        environment: "staging",
        action: "execute",
        releaseCommitSha: releaseSha,
      },
      principal: {
        actorId: "deployer-1",
        sessionId: "session-12345678",
        roles: ["mmg-commerce-deployer"],
      },
      dependencies,
    });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("executed");
    expect(gateway.applyPhase).toHaveBeenCalledTimes(10);
    expect(
      gateway.applyPhase.mock.calls.some(
        ([phaseInput]) => phaseInput.phase === "publication",
      ),
    ).toBe(false);
  });

  it("requires a production release role and bound approval", async () => {
    const dependencies: MMGCommerceDeploymentServiceDependencies = {
      repository: repository(false),
      gateway: {
        probe: vi.fn().mockResolvedValue(probe(false)),
        applyPhase: vi.fn(),
        rollbackPhase: vi.fn(),
      },
      now: () => now,
      hashPayload: () => "d".repeat(64),
    };
    await expect(
      executeMMGCommerceDeploymentCommand({
        command: {
          requestId: "request-20260720-production",
          releaseId: "release-20260720-production",
          environment: "production",
          action: "execute",
          releaseCommitSha: releaseSha,
        },
        principal: {
          actorId: "deployer-1",
          sessionId: "session-12345678",
          roles: ["mmg-commerce-deployer"],
        },
        dependencies,
      }),
    ).rejects.toThrow("MMG_PRODUCTION_RELEASE_ROLE_REQUIRED");

    await expect(
      executeMMGCommerceDeploymentCommand({
        command: {
          requestId: "request-20260720-production-2",
          releaseId: "release-20260720-production-2",
          environment: "production",
          action: "execute",
          releaseCommitSha: releaseSha,
        },
        principal: {
          actorId: "deployer-1",
          sessionId: "session-12345678",
          roles: [
            "mmg-commerce-deployer",
            "mmg-production-release-manager",
          ],
        },
        dependencies,
      }),
    ).rejects.toThrow("MMG_DEPLOYMENT_APPROVAL_REQUIRED");
  });

  it("publishes only after fresh release-bound evidence and approval", async () => {
    const releaseId = "release-20260720-publish";
    const repo = repository(true);
    let published = false;
    const gateway = {
      probe: vi.fn().mockImplementation(async () =>
        probe(
          true,
          published ? "ACTIVE" : "DRAFT",
          releaseId,
          "production",
        ),
      ),
      applyPhase: vi.fn().mockImplementation(async ({ phase }) => {
        expect(phase).toBe("publication");
        published = true;
        return {
          status: "completed" as const,
          result: { productStatus: "ACTIVE" },
          runtimeMapping: mapping("ACTIVE"),
        };
      }),
      rollbackPhase: vi.fn(),
    };
    const response = await executeMMGCommerceDeploymentCommand({
      command: {
        requestId: "request-20260720-publish",
        releaseId,
        environment: "production",
        action: "publish",
        releaseCommitSha: releaseSha,
        includePublication: true,
      },
      principal: {
        actorId: "release-manager-1",
        sessionId: "session-12345678",
        roles: [
          "mmg-commerce-deployer",
          "mmg-production-release-manager",
        ],
      },
      dependencies: {
        repository: repo,
        gateway,
        now: () => now,
        hashPayload: () => "e".repeat(64),
      },
    });
    expect(response.body.status).toBe("published");
    expect(gateway.applyPhase).toHaveBeenCalledTimes(1);
    expect(repo.saveRuntimeMapping).toHaveBeenCalled();
  });

  it("rejects publication evidence from another release", async () => {
    const repo = repository(true);
    await expect(
      executeMMGCommerceDeploymentCommand({
        command: {
          requestId: "request-20260720-publish-wrong-e2e",
          releaseId: "release-20260720-publish-wrong-e2e",
          environment: "production",
          action: "publish",
          releaseCommitSha: releaseSha,
          includePublication: true,
        },
        principal: {
          actorId: "release-manager-1",
          sessionId: "session-12345678",
          roles: [
            "mmg-commerce-deployer",
            "mmg-production-release-manager",
          ],
        },
        dependencies: {
          repository: repo,
          gateway: {
            probe: vi
              .fn()
              .mockResolvedValue(
                probe(true, "DRAFT", "another-release", "production"),
              ),
            applyPhase: vi.fn(),
            rollbackPhase: vi.fn(),
          },
          now: () => now,
          hashPayload: () => "f".repeat(64),
        },
      }),
    ).rejects.toThrow("MMG_DEPLOYMENT_E2E_RELEASE_MISMATCH");
  });
});
