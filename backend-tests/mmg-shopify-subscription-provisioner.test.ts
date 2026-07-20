import { describe, expect, it } from "vitest";
import {
  assertMMGShopifyRuntimeMapping,
  buildMMGShopifySubscriptionProvisioningPlan,
} from "../server/deployment/shopify-subscription-provisioner.js";

describe("MMG Shopify subscription provisioner", () => {
  it("keeps provisioning in draft and locks exact variants", () => {
    const plan = buildMMGShopifySubscriptionProvisioningPlan({
      shopDomain: "example.myshopify.com",
      mode: "dry_run",
    });
    expect(plan.apiVersion).toBe("2026-07");
    expect(plan.keepDraft).toBe(true);
    expect(plan.operations.map((operation) => operation.code)).toEqual([
      "INSPECT_CANONICAL_PRODUCT",
      "CREATE_DRAFT_SUBSCRIPTION_PRODUCT",
      "CONFIGURE_MONTHLY_VARIANT",
      "CREATE_BIWEEKLY_AND_WEEKLY_VARIANTS",
      "CREATE_SHARED_MONTHLY_SELLING_PLAN",
      "VERIFY_DRAFT_RUNTIME_MAPPING",
    ]);
    const create = plan.operations[1].variables.product as Record<string, any>;
    expect(create.status).toBe("DRAFT");
    expect(create.requiresSellingPlan).toBe(true);
    expect(create.productOptions[0].values.map((value: any) => value.name)).toEqual([
      "Monthly",
      "Bi-weekly",
      "Weekly",
    ]);
    const additional = plan.operations[3].variables.variants as Record<string, any>[];
    expect(additional.map((variant) => variant.price)).toEqual(["24.95", "39.95"]);
    const sellingPlan = plan.operations[4].variables.input as Record<string, any>;
    expect(sellingPlan.sellingPlansToCreate[0].billingPolicy.recurring).toEqual({
      interval: "MONTH",
      intervalCount: 1,
    });
  });

  it("rejects incomplete or duplicate runtime GIDs", () => {
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
    expect(assertMMGShopifyRuntimeMapping(mapping)).toBe(mapping);
    expect(() =>
      assertMMGShopifyRuntimeMapping({
        ...mapping,
        variantGids: {
          ...mapping.variantGids,
          weekly: mapping.variantGids.monthly,
        },
      }),
    ).toThrow("MMG_SHOPIFY_RUNTIME_MAPPING_DUPLICATE_GID");
  });
});
