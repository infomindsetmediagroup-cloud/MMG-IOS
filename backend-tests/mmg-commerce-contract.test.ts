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
  entitlement_ownership_persistence_contract: {
    authority: string;
    database_schema: string;
    postgres_repository: string;
    entitlement_counter: string;
    ownership_resolution: string;
    logical_entitlement_endpoint: string;
    storefront_counter: string;
    confirmation_transaction: string;
    server_authority: string;
  };
  delivery_window_controller_contract: {
    authority: string;
    domain_controller: string;
    orchestration_service: string;
    postgres_repository: string;
    internal_endpoint: string;
    database_schema: string;
    review_window_hours: {
      minimum: number;
      maximum: number;
      default: number;
    };
    weekly_package_offsets_days: number[];
    first_package_expiry: string;
    future_package_expiry: string;
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
      delivery_package: { required_image_assets: string[] };
    };
    service: {
      variants: Array<{
        name: string;
        color_identity: string;
        variant_image_role: string;
      }>;
      media_behavior: { gallery_rule: string; cart_rule: string };
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
        expiry_policy: string;
      };
      future_delivery_flow: {
        assets_per_package: number;
        review_window_hours: {
          minimum: number;
          maximum: number;
          default: number;
        };
        expiry_policy: string;
      };
    };
  };
  knowledge_library_modes: {
    subscription_selection: {
      filters: string[];
      authority: string;
      mutation_rules: string[];
    };
    my_library: { ownership_authority: string };
  };
  canonical_metadata: {
    namespace: string;
    definition_manifest: string;
    fields: string[];
  };
  offer_and_entitlement_engine: { rules: string[] };
  site_placements: Record<string, string>;
  reusable_components: string[];
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const contract = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "registry/products/mmg-commerce-contract-v1.json"),
    "utf8",
  ),
) as CommerceContract;

describe("MMG commerce contract", () => {
  it("is the approved v1.5 authority", () => {
    expect(contract.contract_id).toBe("mmg-commerce-contract-v1");
    expect(contract.version).toBe("1.5.0");
    expect(contract.status).toBe("approved");
  });

  it("locks the exact subscription prices and entitlements", () => {
    expect(
      contract.product_types.subscription.plans.map(
        ({ plan_code, price, packages_per_billing_cycle, assets_per_billing_cycle }) => ({
          plan_code,
          price,
          packages_per_billing_cycle,
          assets_per_billing_cycle,
        }),
      ),
    ).toEqual([
      {
        plan_code: "monthly",
        price: 14.95,
        packages_per_billing_cycle: 1,
        assets_per_billing_cycle: 2,
      },
      {
        plan_code: "biweekly",
        price: 24.95,
        packages_per_billing_cycle: 2,
        assets_per_billing_cycle: 4,
      },
      {
        plan_code: "weekly",
        price: 39.95,
        packages_per_billing_cycle: 4,
        assets_per_billing_cycle: 8,
      },
    ]);

    for (const plan of contract.product_types.subscription.plans) {
      expect(plan.billing_interval).toBe("month");
      expect(plan.assets_per_package).toBe(2);
      expect(plan.assets_per_billing_cycle).toBe(
        plan.packages_per_billing_cycle * plan.assets_per_package,
      );
    }
  });

  it("locks one subscription product, three cadence variants, and one selling plan", () => {
    const subscription = contract.product_types.subscription;
    const structure = subscription.shopify_structure;

    expect(subscription.canonical_product_title).toBe(
      "MMG Knowledge Subscription™",
    );
    expect(subscription.canonical_handle).toBe("mmg-knowledge-subscription");
    expect(subscription.billing_currency).toBe("USD");
    expect(structure.product_model).toBe("ONE_PRODUCT_THREE_CADENCE_VARIANTS");
    expect(structure.variant_option_name).toBe("Delivery cadence");
    expect(structure.variant_codes).toEqual(["monthly", "biweekly", "weekly"]);
    expect(structure.requires_selling_plan).toBe(true);
    expect(structure.requires_shipping).toBe(false);
    expect(structure.inventory_tracking).toBe(false);
    expect(structure.selling_plan_model).toBe("ONE_SHARED_MONTHLY_SELLING_PLAN");
    expect(structure.billing_owner).toBe("Shopify");
    expect(structure.intra_cycle_package_schedule_owner).toBe("Kairos");
  });

  it("locks the digital portrait and square asset package", () => {
    const digital = contract.product_types.digital_download;
    expect(digital.storefront.preferred_portrait_size_px).toEqual([2048, 3072]);
    expect(digital.storefront.portrait_aspect_ratio).toBe("2:3");
    expect(digital.storefront.square_thumbnail_size_px).toEqual([2048, 2048]);
    expect(digital.storefront.square_thumbnail_aspect_ratio).toBe("1:1");
    expect(digital.delivery_package.required_image_assets).toEqual(
      expect.arrayContaining(["portrait_cover", "square_thumbnail"]),
    );
  });

  it("locks service tier identity and dynamic media", () => {
    expect(contract.product_types.service.variants).toEqual([
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
    expect(contract.product_types.service.media_behavior.gallery_rule).toContain(
      "Do not display",
    );
    expect(contract.product_types.service.media_behavior.cart_rule).toContain(
      "selected tier image",
    );
  });

  it("connects the Knowledge Library, picker, and durable persistence authorities", () => {
    expect(contract.knowledge_library_contract.canonical_asset_key).toBe(
      "mmg.asset_id",
    );
    expect(contract.knowledge_library_contract.server_authority).toBe("Kairos");
    expect(contract.knowledge_library_picker_contract.logical_endpoint).toBe(
      "/api/knowledge-library/picker",
    );
    expect(
      contract.knowledge_library_picker_contract.optimistic_concurrency_field,
    ).toBe("expectedWindowVersion");
    expect(contract.knowledge_library_picker_contract.idempotency_field).toBe(
      "requestId",
    );
    expect(
      contract.entitlement_ownership_persistence_contract.database_schema,
    ).toBe("database/migrations/20260720_001_mmg_knowledge_entitlements.sql");
    expect(
      contract.entitlement_ownership_persistence_contract.confirmation_transaction,
    ).toContain("commit or roll back together");
    expect(contract.knowledge_library_modes.my_library.ownership_authority).toContain(
      "mmg_ownership_grants",
    );
  });

  it("connects commerce to the delivery-window controller", () => {
    expect(contract.delivery_window_controller_contract).toEqual({
      authority:
        "registry/knowledge-library/mmg-delivery-window-controller-contract-v1.json",
      domain_controller: "server/knowledge-library/delivery-windows.ts",
      orchestration_service:
        "server/knowledge-library/delivery-window-service.ts",
      postgres_repository:
        "server/knowledge-library/postgres-delivery-window-repository.ts",
      internal_endpoint:
        "/api/internal/knowledge-library/delivery-windows/run",
      database_schema:
        "database/migrations/20260720_002_mmg_delivery_window_controller.sql",
      review_window_hours: { minimum: 24, maximum: 48, default: 48 },
      weekly_package_offsets_days: [0, 7, 14, 21],
      first_package_expiry: "recovery_required",
      future_package_expiry:
        "auto-confirm an exact valid two-title package; otherwise recovery_required",
      server_authority: "Kairos",
    });

    const subscription = contract.product_types.subscription;
    expect(subscription.first_delivery_flow.initial_selection_count).toBe(2);
    expect(subscription.first_delivery_flow.expiry_policy).toContain(
      "Never auto-confirm",
    );
    expect(subscription.future_delivery_flow.assets_per_package).toBe(2);
    expect(subscription.future_delivery_flow.review_window_hours).toEqual({
      minimum: 24,
      maximum: 48,
      default: 48,
    });
    expect(subscription.future_delivery_flow.expiry_policy).toContain(
      "server revalidation",
    );
  });

  it("requires the canonical MMG metadata contract", () => {
    expect(contract.canonical_metadata.namespace).toBe("mmg");
    expect(contract.canonical_metadata.definition_manifest).toBe(
      "shopify/metafields/mmg-knowledge-library-product-metafields.json",
    );
    expect(contract.canonical_metadata.fields).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(new Set(contract.canonical_metadata.fields).size).toBe(
      contract.canonical_metadata.fields.length,
    );
  });

  it("forbids silent recurring insertion, entitlement overdraw, and a fifth weekly package", () => {
    expect(contract.offer_and_entitlement_engine.rules).toEqual(
      expect.arrayContaining([
        "Never silently add a recurring product to the cart.",
        "Never preselect subscription consent.",
        "Resolve ownership from durable active grants rather than browser state.",
        "Never allow entitlement units or package counts to exceed the locked plan contract.",
        "Never create a fifth Weekly package in a five-week calendar month.",
        "Require an idempotent delivery dispatcher keyed by window ID.",
      ]),
    );
    expect(
      contract.knowledge_library_modes.subscription_selection.mutation_rules,
    ).toEqual(
      expect.arrayContaining([
        "The delivery-window controller never auto-confirms the first customer-selected package.",
        "A future curated package may auto-confirm at expiry only when the exact current package passes full server revalidation.",
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
    expect(contract.reusable_components).toContain(
      "MMG Delivery Window Controller",
    );
  });
});
