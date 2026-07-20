import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Variant = {
  plan_code: string;
  title: string;
  sku: string;
  price: string;
  billing_interval: string;
  billing_interval_count: number;
  packages_per_billing_cycle: number;
  assets_per_package: number;
  assets_per_billing_cycle: number;
  entitlement_units: number;
};

type ProductContract = {
  contract_id: string;
  version: string;
  status: string;
  product: {
    title: string;
    handle: string;
    requires_selling_plan: boolean;
    requires_shipping: boolean;
    inventory_tracking: boolean;
    option: {
      name: string;
      values: string[];
    };
  };
  variants: Variant[];
  selling_plan_mapping: {
    architecture: string;
    group: {
      merchant_code: string;
    };
    plan: {
      category: string;
      billing_policy: {
        type: string;
        interval: string;
        interval_count: number;
      };
      delivery_policy: {
        type: string;
        interval: string;
        interval_count: number;
      };
      pricing_policy: {
        type: string;
      };
    };
    associated_variant_codes: string[];
  };
  cart_contract: {
    selling_plan_required: boolean;
    explicit_customer_consent_required: boolean;
    default_preselected_plan_allowed: boolean;
    silent_cart_insertion_allowed: boolean;
  };
  runtime_mapping: {
    product_gid: string | null;
    variant_gids: Record<string, string | null>;
    selling_plan_group_gid: string | null;
    selling_plan_gid: string | null;
  };
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const contractPath = resolve(
  repositoryRoot,
  "shopify/products/mmg-knowledge-subscription/product-contract.json",
);
const contract = JSON.parse(
  readFileSync(contractPath, "utf8"),
) as ProductContract;

describe("MMG Knowledge Subscription product contract", () => {
  it("defines the canonical subscription-only product", () => {
    expect(contract.contract_id).toBe("mmg-knowledge-subscription-product-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_provisioning");
    expect(contract.product.title).toBe("MMG Knowledge Subscription™");
    expect(contract.product.handle).toBe("mmg-knowledge-subscription");
    expect(contract.product.requires_selling_plan).toBe(true);
    expect(contract.product.requires_shipping).toBe(false);
    expect(contract.product.inventory_tracking).toBe(false);
  });

  it("defines exactly three cadence variants with locked prices and entitlements", () => {
    expect(contract.product.option).toEqual({
      name: "Delivery cadence",
      values: ["Monthly", "Bi-weekly", "Weekly"],
    });

    expect(
      contract.variants.map((variant) => ({
        plan_code: variant.plan_code,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        assets: variant.assets_per_billing_cycle,
      })),
    ).toEqual([
      {
        plan_code: "monthly",
        title: "Monthly",
        sku: "MMG-KS-MONTHLY",
        price: "14.95",
        assets: 2,
      },
      {
        plan_code: "biweekly",
        title: "Bi-weekly",
        sku: "MMG-KS-BIWEEKLY",
        price: "24.95",
        assets: 4,
      },
      {
        plan_code: "weekly",
        title: "Weekly",
        sku: "MMG-KS-WEEKLY",
        price: "39.95",
        assets: 8,
      },
    ]);

    for (const variant of contract.variants) {
      expect(variant.billing_interval).toBe("MONTH");
      expect(variant.billing_interval_count).toBe(1);
      expect(variant.assets_per_package).toBe(2);
      expect(variant.assets_per_billing_cycle).toBe(
        variant.packages_per_billing_cycle * variant.assets_per_package,
      );
      expect(variant.entitlement_units).toBe(
        variant.assets_per_billing_cycle,
      );
    }
  });

  it("uses one shared monthly selling plan for every cadence variant", () => {
    expect(contract.selling_plan_mapping.architecture).toBe(
      "ONE_SHARED_MONTHLY_SELLING_PLAN_FOR_THREE_CADENCE_VARIANTS",
    );
    expect(contract.selling_plan_mapping.group.merchant_code).toBe(
      "mmg-knowledge-subscription-monthly-billing",
    );
    expect(contract.selling_plan_mapping.plan.category).toBe("SUBSCRIPTION");
    expect(contract.selling_plan_mapping.plan.billing_policy).toEqual({
      type: "RECURRING",
      interval: "MONTH",
      interval_count: 1,
      minimum_cycles: 1,
      maximum_cycles: null,
    });
    expect(contract.selling_plan_mapping.plan.delivery_policy).toMatchObject({
      type: "RECURRING",
      interval: "MONTH",
      interval_count: 1,
    });
    expect(contract.selling_plan_mapping.plan.pricing_policy.type).toBe("NONE");
    expect(contract.selling_plan_mapping.associated_variant_codes).toEqual([
      "monthly",
      "biweekly",
      "weekly",
    ]);
  });

  it("enforces explicit recurring-purchase consent", () => {
    expect(contract.cart_contract.selling_plan_required).toBe(true);
    expect(contract.cart_contract.explicit_customer_consent_required).toBe(true);
    expect(contract.cart_contract.default_preselected_plan_allowed).toBe(false);
    expect(contract.cart_contract.silent_cart_insertion_allowed).toBe(false);
  });

  it("keeps mutable Shopify runtime identifiers unresolved before provisioning", () => {
    expect(contract.runtime_mapping.product_gid).toBeNull();
    expect(contract.runtime_mapping.variant_gids).toEqual({
      monthly: null,
      biweekly: null,
      weekly: null,
    });
    expect(contract.runtime_mapping.selling_plan_group_gid).toBeNull();
    expect(contract.runtime_mapping.selling_plan_gid).toBeNull();
  });
});
