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
  knowledge_library_contract: {
    eligibility_and_selection_authority: string;
    digital_asset_registry: string;
    shopify_metafield_manifest: string;
    canonical_asset_key: string;
    server_authority: string;
    seed_asset: string;
  };
  knowledge_library_picker_contract: {
    authority: string;
    state_machine: string;
    service_boundary: string;
    logical_endpoint: string;
    storefront_component: string;
    first_package_target_titles: number;
    first_package_total_units: number;
    optimistic_concurrency_field: string;
    idempotency_field: string;
    server_authority: string;
  };
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
  knowledge_library_modes: {
    subscription_selection: {
      filters: string[];
      authority: string;
      mutation_rules: string[];
    };
  };
  canonical_metadata: {
    namespace: string;
    definition_manifest: string;
    fields: string[];
  };
  offer_and_entitlement_engine: {
    rules: string[];
  };
  site_placements: Record<string, string>;
  reusable_components: string[];
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
    expect(contract.version).toBe("1.3.0");
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
    expect(contract.canonical_metadata.definition_manifest).toBe(
      "shopify/metafields/mmg-knowledge-library-product-metafields.json",
    );

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

  it("connects the commerce contract to the Knowledge Library authority", () => {
    expect(contract.knowledge_library_contract).toEqual({
      eligibility_and_selection_authority:
        "registry/knowledge-library/mmg-knowledge-library-contract-v1.json",
      digital_asset_registry:
        "registry/knowledge-library/digital-asset-registry-v1.json",
      shopify_metafield_manifest:
        "shopify/metafields/mmg-knowledge-library-product-metafields.json",
      canonical_asset_key: "mmg.asset_id",
      server_authority: "Kairos",
      seed_asset: "mmg-dd-ai-image-mastery-001",
    });
    expect(contract.knowledge_library_modes.subscription_selection.filters).toEqual(
      expect.arrayContaining([
        "not already owned",
        "within current entitlement window",
        "sufficient remaining entitlement units",
      ]),
    );
    expect(contract.knowledge_library_modes.subscription_selection.authority).toContain(
      "server-side",
    );
    expect(contract.reusable_components).toContain(
      "MMG Knowledge Library Eligibility Metadata",
    );
  });

  it("connects the commerce contract to the implemented Knowledge Library picker", () => {
    expect(contract.knowledge_library_picker_contract).toEqual({
      authority:
        "registry/knowledge-library/mmg-knowledge-library-picker-contract-v1.json",
      state_machine: "server/knowledge-library/picker.ts",
      service_boundary: "server/knowledge-library/picker-service.ts",
      logical_endpoint: "/api/knowledge-library/picker",
      storefront_component:
        "shopify/snippets/mmg-knowledge-library-picker.liquid",
      first_package_target_titles: 2,
      first_package_total_units: 2,
      optimistic_concurrency_field: "expectedWindowVersion",
      idempotency_field: "requestId",
      server_authority: "Kairos",
    });
    expect(
      contract.knowledge_library_modes.subscription_selection.mutation_rules,
    ).toEqual(
      expect.arrayContaining([
        "Customer, subscription, and window identity are derived from the authenticated server session.",
        "Every mutation requires a request ID and expected window version.",
        "Confirmation requires the exact target asset count and complete unit consumption.",
      ]),
    );
    expect(contract.reusable_components).toContain(
      "MMG Knowledge Library Picker",
    );
  });

  it("forbids silent recurring-product insertion and provisional client authority", () => {
    expect(contract.offer_and_entitlement_engine.rules).toEqual(
      expect.arrayContaining([
        "Never silently add a recurring product to the cart.",
        "Never preselect subscription consent.",
        "Treat storefront eligibility as provisional until Kairos revalidates the customer, ownership, entitlement window, and delivery readiness.",
        "Use optimistic concurrency and idempotency for every title-selection mutation.",
        "Create confirmation and delivery grants transactionally.",
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
