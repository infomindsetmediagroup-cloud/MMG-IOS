import { describe, expect, it } from "vitest";
import {
  MMG_REQUIRED_MIGRATIONS,
  MMG_REQUIRED_PORTAL_COMPONENTS,
  MMG_REQUIRED_PRODUCTION_SCOPES,
  MMG_REQUIRED_RUNTIME_ENDPOINTS,
  MMG_REQUIRED_WEBHOOK_TOPICS,
  assertMMGCommerceReleaseApproval,
  buildMMGCommerceDeploymentPlan,
  type MMGCommerceDeploymentProbe,
} from "../server/deployment/live-commerce-deployment.js";

const mapping = {
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
};

const completeProbe = (): MMGCommerceDeploymentProbe => ({
  canonicalShopDomain: "example.myshopify.com",
  apiVersion: "2026-07",
  grantedScopes: [...MMG_REQUIRED_PRODUCTION_SCOPES],
  appliedMigrations: [...MMG_REQUIRED_MIGRATIONS],
  routedEndpoints: [...MMG_REQUIRED_RUNTIME_ENDPOINTS],
  runtimeMapping: mapping,
  verifiedSelectableAssetCount: 2,
  portalComponents: [...MMG_REQUIRED_PORTAL_COMPONENTS],
  webhookTopics: [...MMG_REQUIRED_WEBHOOK_TOPICS],
  schedulerActive: true,
  dispatcherActive: true,
  storageSignerActive: true,
  e2eEvidence: {
    runId: "e2e-release-12345678",
    completedAt: "2026-07-20T23:00:00.000Z",
    environment: "staging",
    checks: { full_path: "passed" },
    testOrderIdHash: "a".repeat(64),
    testCustomerReferenceHash: "b".repeat(64),
  },
});

describe("MMG live commerce deployment", () => {
  it("builds a complete non-publication release plan", () => {
    const plan = buildMMGCommerceDeploymentPlan({
      releaseId: "release-20260720-001",
      environment: "staging",
      releaseCommitSha: "a".repeat(40),
      generatedAt: new Date("2026-07-20T23:00:00.000Z"),
      probe: completeProbe(),
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.publishIncluded).toBe(false);
    expect(plan.steps.find((step) => step.phase === "publication")?.status).toBe(
      "not_applicable",
    );
  });

  it("blocks publication until the product is active", () => {
    const plan = buildMMGCommerceDeploymentPlan({
      releaseId: "release-20260720-002",
      environment: "production",
      releaseCommitSha: "b".repeat(40),
      generatedAt: new Date("2026-07-20T23:00:00.000Z"),
      probe: completeProbe(),
      includePublication: true,
    });
    expect(plan.blockers).toContain("PUBLICATION_NOT_COMPLETED");
    expect(plan.executable).toBe(false);
  });

  it("identifies missing scopes, migrations, routes, assets, and operations", () => {
    const probe = completeProbe();
    probe.grantedScopes = [];
    probe.appliedMigrations = [];
    probe.routedEndpoints = [];
    probe.verifiedSelectableAssetCount = 1;
    probe.schedulerActive = false;
    probe.dispatcherActive = false;
    probe.storageSignerActive = false;
    const plan = buildMMGCommerceDeploymentPlan({
      releaseId: "release-20260720-003",
      environment: "production",
      releaseCommitSha: "c".repeat(40),
      generatedAt: new Date("2026-07-20T23:00:00.000Z"),
      probe,
    });
    expect(plan.blockers).toContain("MISSING_SCOPE:write_products");
    expect(plan.blockers).toContain(
      "MISSING_MIGRATION:20260720_007_mmg_live_commerce_deployment_control",
    );
    expect(plan.blockers).toContain(
      "MISSING_ROUTE:/api/internal/commerce/deployment",
    );
    expect(plan.blockers).toContain("INSUFFICIENT_VERIFIED_SELECTABLE_ASSETS");
    expect(plan.blockers).toContain("DELIVERY_SCHEDULER_INACTIVE");
  });

  it("requires an action-, environment-, SHA-, and time-bound approval", () => {
    const approval = {
      approvalId: "approval-12345678",
      approvedBy: "executive-1",
      approvedAt: "2026-07-20T22:00:00.000Z",
      expiresAt: "2026-07-21T00:00:00.000Z",
      approvedActions: ["publish" as const],
      approvedEnvironment: "production" as const,
      releaseCommitSha: "d".repeat(40),
    };
    expect(
      assertMMGCommerceReleaseApproval({
        approval,
        environment: "production",
        action: "publish",
        releaseCommitSha: "d".repeat(40),
        now: new Date("2026-07-20T23:00:00.000Z"),
      }),
    ).toBe(approval);
    expect(() =>
      assertMMGCommerceReleaseApproval({
        approval,
        environment: "production",
        action: "execute",
        releaseCommitSha: "d".repeat(40),
        now: new Date("2026-07-20T23:00:00.000Z"),
      }),
    ).toThrow("MMG_DEPLOYMENT_ACTION_NOT_APPROVED");
  });
});
