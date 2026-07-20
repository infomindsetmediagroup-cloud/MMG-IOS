import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type SubscriptionPlan = {
  plan_code: string;
  display_name: string;
  price: number;
  billing_interval: string;
  packages_per_billing_cycle: number;
  assets_per_package: number;
  assets_per_billing_cycle: number;
  cadence_note?: string;
};

type CommerceContract = {
  contract_id: string;
  version: string;
  status: string;
  product_types: {
    digital_download: {
      storefront: {
        preferred_portrait_size_px: [number, number];
        portrait_aspect_ratio: string;
        square_thumbnail_size_px: [number, number];
        square_thumbnail_aspect_ratio: string;
      };
      delivery_package: {
        required_image_assets: string[];
      };
    };
    service: {
      variants: Array<{
        name: string;
        color_identity: string;
        variant_image_role: string;
      }>;
      media_behavior: {
        gallery_rule: string;
        cart_rule: string;
      };
    };
    subscription: {
      canonical_product_title: string;
      canonical_handle: string;
      billing_currency: string;
      shopify_structure: {
        product_model: string;
        variant_option_name: string;
        variant_codes: string[];
        requires_selling_plan: boolean;
        requires_shipping: boolean;
        inventory_tracking: boolean;
        selling_plan_model: string;
        selling_plan_group_merchant_code: string;
        billing_owner: string;
        intra_cycle_package_schedule_owner: string;
        product_contract: string;
      };
      plans: SubscriptionPlan[];
      first_delivery_flow: {
        initial_selection_count: number;
      };
      future_delivery_flow: {
        assets_per_package: number;
        review_window_hours: {
          minimum: number;
          maximum: number;
        };
      };
    };
  };
  canonical_metadata: {
    namespace: string;
    fields: string[];
  };
  offer_and_entitlement_engine: {
    rules: string[];
  };
  site_placements: Record<string, string>;
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const contractPath = resolve(
  repositoryRoot,
  "registry/products/mmg-commerce-contract-v1.json",
);
const contract = JSON.parse(
  readFileSync(contractPath, "utf8"),
) as CommerceContract;

describe("MMG commerce contract", () => {
  it("is the approved v1 authority", () => {
    expect(contract.contract_id).toBe("mmg-commerce-contract-v1");
    expect(contract.version).toBe("1.1.0");
    expect(contract.status).toBe("approved");
  });

  it("locks the three subscription plans and exact entitlements", () => {
    const plans = contract.product_types.subscription.plans;

    expect(plans).toHaveLength(3);
    expect(
      plans.map(({ plan_code, price, assets_per_billing_cycle }) => ({
        plan_code,
        price,
        assets_per_billing_cycle,
      })),
    ).toEqual([
      { plan_code: "monthly", price: 14.95, assets_per_billing_cycle: 2 },
      { plan_code: "biweekly", price: 24.95, assets_per_billing_cycle: 4 },
      { plan_code: "weekly", price: 39.95, assets_per_billing_cycle: 8 },
    ]);

    for (const plan of plans) {
      expect(plan.billing_interval).toBe("month");
      expect(plan.assets_per_package).toBe(2);
      expect(plan.assets_per_billing_cycle).toBe(
        plan.packages_per_billing_cycle * plan.assets_per_package,
      );
    }
  });

  it("locks one subscription product with three variants and one shared monthly selling plan", () => {
    const structure = contract.product_types.subscription.shopify_structure;

    expect(structure.product_model).toBe("ONE_PRODUCT_THREE_CADENCE_VARIANTS");
    expect(structure.variant_option_name).toBe("Delivery cadence");
    expect(structure.variant_codes).toEqual(["monthly", "biweekly", "weekly"]);
    expect(structure.requires_selling_plan).toBe(true);
    expect(structure.requires_shipping).toBe(false);
    expect(structure.inventory_tracking).toBe(false);
    expect(structure.selling_plan_model).toBe("ONE_SHARED_MONTHLY_SELLING_PLAN");
    expect(structure.selling_plan_group_merchant_code).toBe(
      "mmg-knowledge-subscription-monthly-billing",
    );
    expect(structure.billing_owner).toBe("Shopify");
    expect(structure.intra_cycle_package_schedule_owner).toBe("Kairos");
    expect(structure.product_contract).toBe(
      "shopify/products/mmg-knowledge-subscription/product-contract.json",
    );
  });

  it("locks the subscription identity and post-purchase first selection", () => {
    const subscription = contract.product_types.subscription;

    expect(subscription.canonical_product_title).toBe(
      "MMG Knowledge Subscription™",
    );
    expect(subscription.canonical_handle).toBe("mmg-knowledge-subscription");
    expect(subscription.billing_currency).toBe("USD");
    expect(subscription.first_delivery_flow.initial_selection_count).toBe(2);
    expect(subscription.future_delivery_flow.assets_per_package).toBe(2);
    expect(subscription.future_delivery_flow.review_window_hours).toEqual({
      minimum: 24,
      maximum: 48,
    });
  });

  it("locks the digital-download portrait and square image package", () => {
    const digital = contract.product_types.digital_download;

    expect(digital.storefront.preferred_portrait_size_px).toEqual([2048, 3072]);
    expect(digital.storefront.portrait_aspect_ratio).toBe("2:3");
    expect(digital.storefront.square_thumbnail_size_px).toEqual([2048, 2048]);
    expect(digital.storefront.square_thumbnail_aspect_ratio).toBe("1:1");
    expect(digital.delivery_package.required_image_assets).toEqual(
      expect.arrayContaining(["portrait_cover", "square_thumbnail"]),
    );
  });

  it("locks service tier identity and dynamic variant-media behavior", () => {
    const service = contract.product_types.service;

    expect(service.variants).toEqual([
      {
        name: "Starter",
        color_identity: "electric_blue",
        variant_image_role: "starter_tier_image",
      },
      {
        name: "Growth",
        color_identity: "purple",
        variant_image_role: "growth_tier_image",
      },
      {
        name: "Professional",
        color_identity: "gold",
        variant_image_role: "professional_tier_image",
      },
    ]);
    expect(service.media_behavior.gallery_rule).toContain("Do not display");
    expect(service.media_behavior.cart_rule).toContain("selected tier image");
  });

  it("requires the canonical MMG metadata contract", () => {
    expect(contract.canonical_metadata.namespace).toBe("mmg");

    const requiredFields = [
      "product_type",
      "subscription_eligible",
      "asset_status",
      "asset_id",
      "topic",
      "experience_level",
      "format",
      "series",
      "related_assets",
      "square_thumbnail",
      "portrait_cover",
      "subscription_value",
      "delivery_package",
      "customer_destination",
    ];

    expect(contract.canonical_metadata.fields).toEqual(
      expect.arrayContaining(requiredFields),
    );
    expect(new Set(contract.canonical_metadata.fields).size).toBe(
      contract.canonical_metadata.fields.length,
    );
  });

  it("forbids silent recurring-product insertion", () => {
    expect(contract.offer_and_entitlement_engine.rules).toEqual(
      expect.arrayContaining([
        "Never silently add a recurring product to the cart.",
        "Never preselect subscription consent.",
      ]),
    );
  });

  it("defines every required sitewide integration surface", () => {
    expect(Object.keys(contract.site_placements)).toEqual(
      expect.arrayContaining([
        "homepage",
        "knowledge_library",
        "digital_product_page",
        "service_product_page",
        "publishing_services_landing_page",
        "membership_landing_page",
        "cart_drawer_and_cart_page",
        "thank_you_page",
        "customer_portal",
      ]),
    );
  });
});
