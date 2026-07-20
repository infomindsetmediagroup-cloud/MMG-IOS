import { describe, expect, it, vi } from "vitest";
import {
  handleMMGCommerceDeploymentRequest,
  type MMGCommerceDeploymentHttpDependencies,
} from "../server/deployment/live-commerce-deployment-http.js";
import {
  MMG_REQUIRED_MIGRATIONS,
  MMG_REQUIRED_PORTAL_COMPONENTS,
  MMG_REQUIRED_PRODUCTION_SCOPES,
  MMG_REQUIRED_RUNTIME_ENDPOINTS,
  MMG_REQUIRED_WEBHOOK_TOPICS,
} from "../server/deployment/live-commerce-deployment.js";

const command = {
  requestId: "request-20260720-001",
  releaseId: "release-20260720-001",
  environment: "staging",
  action: "plan",
  releaseCommitSha: "a".repeat(40),
};

const completeProbe = {
  canonicalShopDomain: "example.myshopify.com",
  apiVersion: "2026-07",
  grantedScopes: [...MMG_REQUIRED_PRODUCTION_SCOPES],
  appliedMigrations: [...MMG_REQUIRED_MIGRATIONS],
  routedEndpoints: [...MMG_REQUIRED_RUNTIME_ENDPOINTS],
  runtimeMapping: {
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
    productStatus: "DRAFT" as const,
    verifiedAt: "2026-07-20T23:00:00.000Z",
  },
  verifiedSelectableAssetCount: 2,
  portalComponents: [...MMG_REQUIRED_PORTAL_COMPONENTS],
  webhookTopics: [...MMG_REQUIRED_WEBHOOK_TOPICS],
  schedulerActive: true,
  dispatcherActive: true,
  storageSignerActive: true,
  e2eEvidence: {
    runId: "e2e-release-12345678",
    completedAt: "2026-07-20T23:00:00.000Z",
    environment: "staging" as const,
    checks: { full_path: "passed" as const },
    testOrderIdHash: "b".repeat(64),
    testCustomerReferenceHash: "c".repeat(64),
  },
};

const dependencies = (): MMGCommerceDeploymentHttpDependencies => ({
  authorize: vi.fn().mockResolvedValue({
    actorId: "deployer-1",
    sessionId: "session-12345678",
    roles: ["mmg-commerce-deployer"],
  }),
  validateSameOriginOrInternal: vi.fn().mockReturnValue(true),
  now: () => new Date("2026-07-20T23:00:00.000Z"),
  hashPayload: vi.fn().mockReturnValue("d".repeat(64)),
  repository: {
    claimRequest: vi.fn().mockResolvedValue("claimed"),
    loadApproval: vi.fn().mockResolvedValue(null),
    loadReleaseVersion: vi.fn().mockResolvedValue(null),
    beginRelease: vi.fn(),
    recordStep: vi.fn(),
    completeRequest: vi.fn().mockResolvedValue(undefined),
    failRequest: vi.fn().mockResolvedValue(undefined),
    saveRuntimeMapping: vi.fn(),
    saveE2EEvidence: vi.fn(),
  },
  gateway: {
    probe: vi.fn().mockResolvedValue(completeProbe),
    applyPhase: vi.fn(),
    rollbackPhase: vi.fn(),
  },
});

const request = (method: string, body: unknown = command): Request =>
  new Request("https://kairos.internal/api/internal/commerce/deployment", {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer internal",
      "X-MMG-Internal-Request": "test",
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

describe("MMG live commerce deployment HTTP", () => {
  it("returns a private read-only plan for an authorized caller", async () => {
    const response = await handleMMGCommerceDeploymentRequest(
      request("POST"),
      dependencies(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("planned");
  });

  it("rejects unsupported methods, invalid origins, and missing authorization", async () => {
    expect(
      (await handleMMGCommerceDeploymentRequest(request("GET"), dependencies()))
        .status,
    ).toBe(405);

    const origin = dependencies();
    origin.validateSameOriginOrInternal = vi.fn().mockReturnValue(false);
    expect(
      (await handleMMGCommerceDeploymentRequest(request("POST"), origin)).status,
    ).toBe(403);

    const auth = dependencies();
    auth.authorize = vi.fn().mockResolvedValue(null);
    expect(
      (await handleMMGCommerceDeploymentRequest(request("POST"), auth)).status,
    ).toBe(401);
  });

  it("rejects invalid actions and oversized bodies", async () => {
    const invalid = await handleMMGCommerceDeploymentRequest(
      request("POST", { ...command, action: "launch" }),
      dependencies(),
    );
    expect(invalid.status).toBe(409);

    const large = new Request(
      "https://kairos.internal/api/internal/commerce/deployment",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer internal",
          "Content-Type": "application/json",
          "Content-Length": "40000",
        },
        body: JSON.stringify(command),
      },
    );
    expect(
      (await handleMMGCommerceDeploymentRequest(large, dependencies())).status,
    ).toBe(413);
  });
});
