import { describe, expect, it, vi } from "vitest";
import { MMGCompositeCommerceDeploymentGateway } from "../server/deployment/live-commerce-deployment-gateway.js";

const mapping = (status: "DRAFT" | "ACTIVE" = "DRAFT") => ({
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
  verifiedAt: "2026-07-20T23:00:00.000Z",
});

const build = () => {
  const app = {
    inspectScopes: vi.fn().mockResolvedValue(["write_products"]),
    releaseAppConfiguration: vi.fn().mockResolvedValue({
      grantedScopes: ["write_products"],
      webhookTopics: [],
      versionId: "app-version-1",
    }),
    rollbackAppConfiguration: vi.fn().mockResolvedValue({ versionId: "app-version-0" }),
    inspectWebhookTopics: vi.fn().mockResolvedValue([]),
  };
  const database = {
    inspectAppliedMigrations: vi.fn().mockResolvedValue([]),
    applyCommerceMigrations: vi.fn().mockResolvedValue({ applied: ["001"] }),
  };
  const runtime = {
    inspectRoutedEndpoints: vi.fn().mockResolvedValue([]),
    deployCommerceRoutes: vi.fn().mockResolvedValue({
      deploymentId: "runtime-1",
      routedEndpoints: ["/api/internal/commerce/deployment"],
    }),
    rollbackCommerceRoutes: vi.fn().mockResolvedValue({ deploymentId: "runtime-0" }),
  };
  const shopify = {
    inspectRuntimeMapping: vi.fn().mockResolvedValue(mapping()),
    provisionDraftProduct: vi.fn().mockResolvedValue(mapping()),
    provisionSellingPlan: vi.fn().mockResolvedValue(mapping()),
    activateAndPublish: vi.fn().mockResolvedValue(mapping("ACTIVE")),
    returnToDraftOrUnpublish: vi.fn().mockResolvedValue(mapping()),
  };
  const assets = {
    inspectVerifiedSelectableAssetCount: vi.fn().mockResolvedValue(0),
    synchronizeAndVerifyAssets: vi.fn().mockResolvedValue({ verifiedSelectableAssetCount: 2 }),
  };
  const storefront = {
    inspectInstalledPortalComponents: vi.fn().mockResolvedValue([]),
    installPortalComponents: vi.fn().mockResolvedValue({
      installedComponents: ["mmg-my-library"],
      themeId: "theme-1",
    }),
    rollbackPortalComponents: vi.fn().mockResolvedValue({ themeId: "theme-0" }),
  };
  const operations = {
    inspect: vi.fn().mockResolvedValue({
      schedulerActive: false,
      dispatcherActive: false,
      storageSignerActive: false,
    }),
    activate: vi.fn().mockResolvedValue({
      schedulerActive: true,
      dispatcherActive: true,
      storageSignerActive: true,
    }),
    deactivate: vi.fn().mockResolvedValue(undefined),
  };
  const verification = {
    inspectLatestEvidence: vi.fn().mockResolvedValue(null),
    verify: vi.fn().mockResolvedValue({
      runId: "e2e-release-12345678",
      completedAt: "2026-07-20T23:00:00.000Z",
      environment: "staging" as const,
      checks: { full_path: "passed" as const },
      testOrderIdHash: "a".repeat(64),
      testCustomerReferenceHash: "b".repeat(64),
    }),
  };
  return {
    app,
    database,
    runtime,
    shopify,
    assets,
    storefront,
    operations,
    verification,
    gateway: new MMGCompositeCommerceDeploymentGateway({
      canonicalShopDomain: "example.myshopify.com",
      apiVersion: "2026-07",
      app,
      database,
      runtime,
      shopify,
      assets,
      storefront,
      operations,
      verification,
    }),
  };
};

const baseInput = {
  releaseId: "release-20260720-001",
  environment: "staging" as const,
  releaseCommitSha: "a".repeat(40),
  approval: null,
  occurredAt: new Date("2026-07-20T23:00:00.000Z"),
};

describe("MMG composite commerce deployment gateway", () => {
  it("probes every deployment authority", async () => {
    const { gateway } = build();
    const probe = await gateway.probe({
      releaseId: baseInput.releaseId,
      environment: "staging",
    });
    expect(probe.canonicalShopDomain).toBe("example.myshopify.com");
    expect(probe.runtimeMapping?.productStatus).toBe("DRAFT");
    expect(probe.schedulerActive).toBe(false);
  });

  it("maps product, verification, and publication phases to their adapters", async () => {
    const { gateway, shopify, verification } = build();
    const product = await gateway.applyPhase({ ...baseInput, phase: "shopify_product" });
    expect(product.runtimeMapping?.productStatus).toBe("DRAFT");
    expect(shopify.provisionDraftProduct).toHaveBeenCalled();

    const verify = await gateway.applyPhase({
      ...baseInput,
      phase: "end_to_end_verification",
    });
    expect(verify.e2eEvidence?.checks.full_path).toBe("passed");
    expect(verification.verify).toHaveBeenCalled();

    await expect(
      gateway.applyPhase({ ...baseInput, phase: "publication" }),
    ).rejects.toThrow("MMG_DEPLOYMENT_PUBLICATION_APPROVAL_REQUIRED");
  });

  it("uses safe rollback policies", async () => {
    const { gateway, operations } = build();
    const database = await gateway.rollbackPhase({
      ...baseInput,
      phase: "database_migrations",
    });
    expect(database.status).toBe("not_applicable");
    expect(database.result.policy).toBe("forward_repair_migration_required");

    const scheduler = await gateway.rollbackPhase({
      ...baseInput,
      phase: "scheduler_and_dispatcher",
    });
    expect(scheduler.status).toBe("rolled_back");
    expect(operations.deactivate).toHaveBeenCalled();
  });
});
