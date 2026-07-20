import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type SubscriptionPlan = {
  plan_code: string;
  display_name: string;
  price: number;
  billing_interval: string;
  packages_per_billing_cycle: number;
  assets_per_package: number;
  assets_per_billing_cycle: number;
};

type CommerceContract = {
  contract_id: string;
  version: string;
  status: string;
  knowledge_library_contract: {
    canonical_asset_key: string;
    server_authority: string;
  };
  knowledge_library_picker_contract: {
    logical_endpoint: string;
    optimistic_concurrency_field: string;
    idempotency_field: string;
  };
  entitlement_ownership_persistence_contract: {
    database_schema: string;
    confirmation_transaction: string;
  };
  delivery_window_controller_contract: {
    authority: string;
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
  };
  customer_portal_subscription_dashboard_contract: {
    authority: string;
    domain_model: string;
    postgres_repository: string;
    service_boundary: string;
    logical_endpoint: string;
    storefront_component: string;
    canonical_route: string;
    authentication: string;
    mutation_mode: string;
    private_response: boolean;
    server_authority: string;
  };
  thank_you_first_title_handoff_contract: {
    authority: string;
    domain_model: string;
    service_boundary: string;
    postgres_repository: string;
    logical_endpoint: string;
    extension_config: string;
    extension_source: string;
    extension_target: string;
    database_schema: string;
    authentication: string;
    raw_checkout_token_persisted: boolean;
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
        selling_plan_model: string;
        billing_owner: string;
        intra_cycle_package_schedule_owner: string;
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
      mutation_rules: string[];
    };
    my_library: {
      ownership_authority: string;
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
  reusable_components: string[];
  canonical_customer_flow: string[];
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
  it("is the approved v1.7 authority", () => {
    expect(contract.contract_id).toBe("mmg-commerce-contract-v1");
    expect(contract.version).toBe("1.7.0");
    expect(contract.status).toBe("approved");
  });

  it("locks the exact subscription prices, package counts, and asset counts", () => {
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

  it("locks the single subscription product and Shopify/Kairos boundary", () => {
    const subscription = contract.product_types.subscription;
    expect(subscription.canonical_product_title).toBe(
      "MMG Knowledge Subscription™",
    );
    expect(subscription.canonical_handle).toBe("mmg-knowledge-subscription");
    expect(subscription.billing_currency).toBe("USD");
    expect(subscription.shopify_structure.product_model).toBe(
      "ONE_PRODUCT_THREE_CADENCE_VARIANTS",
    );
    expect(subscription.shopify_structure.variant_codes).toEqual([
      "monthly",
      "biweekly",
      "weekly",
    ]);
    expect(subscription.shopify_structure.requires_selling_plan).toBe(true);
    expect(subscription.shopify_structure.selling_plan_model).toBe(
      "ONE_SHARED_MONTHLY_SELLING_PLAN",
    );
    expect(subscription.shopify_structure.billing_owner).toBe("Shopify");
    expect(subscription.shopify_structure.intra_cycle_package_schedule_owner).toBe(
      "Kairos",
    );
  });

  it("preserves digital and service media contracts", () => {
    expect(contract.product_types.digital_download.storefront).toEqual(
      expect.objectContaining({
        preferred_portrait_size_px: [2048, 3072],
        portrait_aspect_ratio: "2:3",
        square_thumbnail_size_px: [2048, 2048],
        square_thumbnail_aspect_ratio: "1:1",
      }),
    );
    expect(
      contract.product_types.digital_download.delivery_package.required_image_assets,
    ).toEqual(expect.arrayContaining(["portrait_cover", "square_thumbnail"]));
    expect(contract.product_types.service.variants.map((variant) => variant.name)).toEqual([
      "Starter",
      "Growth",
      "Professional",
    ]);
    expect(contract.product_types.service.media_behavior.gallery_rule).toContain(
      "Do not display",
    );
    expect(contract.product_types.service.media_behavior.cart_rule).toContain(
      "selected tier image",
    );
  });

  it("connects the Knowledge Library, persistence, and delivery-window authorities", () => {
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
      contract.entitlement_ownership_persistence_contract.confirmation_transaction,
    ).toContain("commit or roll back together");
    expect(contract.delivery_window_controller_contract).toEqual(
      expect.objectContaining({
        authority:
          "registry/knowledge-library/mmg-delivery-window-controller-contract-v1.json",
        internal_endpoint:
          "/api/internal/knowledge-library/delivery-windows/run",
        review_window_hours: { minimum: 24, maximum: 48, default: 48 },
        weekly_package_offsets_days: [0, 7, 14, 21],
        first_package_expiry: "recovery_required",
      }),
    );
  });

  it("connects commerce to the authenticated Customer Portal dashboard", () => {
    expect(contract.customer_portal_subscription_dashboard_contract).toEqual({
      authority:
        "registry/customer-portal/mmg-subscription-dashboard-contract-v1.json",
      domain_model: "server/customer-portal/subscription-dashboard.ts",
      postgres_repository:
        "server/customer-portal/subscription-dashboard-repository.ts",
      service_boundary:
        "server/customer-portal/subscription-dashboard-service.ts",
      logical_endpoint: "/api/customer-portal/subscription",
      storefront_component:
        "shopify/snippets/mmg-customer-portal-subscription-dashboard.liquid",
      canonical_route: "/pages/customer-portal",
      authentication: "authenticated server session",
      mutation_mode: "read_only",
      private_response: true,
      server_authority: "Kairos",
    });
    expect(contract.site_placements.customer_portal).toContain(
      "authenticated subscription dashboard",
    );
    expect(contract.reusable_components).toContain(
      "MMG Customer Portal Subscription Dashboard",
    );
  });

  it("connects commerce to the Shopify Thank you first-title handoff", () => {
    expect(contract.thank_you_first_title_handoff_contract).toEqual({
      authority:
        "registry/checkout/mmg-thank-you-first-title-handoff-contract-v1.json",
      domain_model: "server/checkout/thank-you-first-title-handoff.ts",
      service_boundary: "server/checkout/thank-you-handoff-service.ts",
      postgres_repository: "server/checkout/thank-you-handoff-repository.ts",
      logical_endpoint: "/api/checkout/thank-you/subscription-handoff",
      extension_config:
        "extensions/mmg-thank-you-first-title-handoff/shopify.extension.toml",
      extension_source:
        "extensions/mmg-thank-you-first-title-handoff/src/ThankYou.tsx",
      extension_target: "purchase.thank-you.block.render",
      database_schema:
        "database/migrations/20260720_003_mmg_thank_you_first_title_handoff.sql",
      authentication:
        "Shopify checkout extension session token plus server-verified order context",
      raw_checkout_token_persisted: false,
      server_authority: "Kairos",
    });
    expect(contract.site_placements.thank_you_page).toContain(
      "checkout UI extension",
    );
    expect(contract.reusable_components).toContain(
      "MMG Thank-You First-Title Handoff",
    );
    expect(contract.canonical_customer_flow).toEqual(
      expect.arrayContaining([
        "Checkout",
        "Thank-you first-title handoff",
        "Customer Portal",
      ]),
    );
  });

  it("preserves first-package choice and governed future expiry", () => {
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

  it("keeps metadata, ownership, anti-overdraw, and handoff-verification rules", () => {
    expect(contract.canonical_metadata.namespace).toBe("mmg");
    expect(contract.canonical_metadata.fields).toEqual(
      expect.arrayContaining([
        "product_type",
        "subscription_eligible",
        "asset_id",
        "square_thumbnail",
        "portrait_cover",
        "subscription_value",
        "delivery_package",
        "customer_destination",
      ]),
    );
    expect(contract.knowledge_library_modes.my_library.ownership_authority).toContain(
      "mmg_ownership_grants",
    );
    expect(contract.offer_and_entitlement_engine.rules).toEqual(
      expect.arrayContaining([
        "Never silently add a recurring product to the cart.",
        "Never preselect subscription consent.",
        "Never allow entitlement units or package counts to exceed the locked plan contract.",
        "Never create a fifth Weekly package in a five-week calendar month.",
        "Expose Customer Portal subscription data only through an authenticated private read-only dashboard endpoint.",
        "Verify Thank you handoffs with a signed Shopify extension session token and a server-loaded order; never trust browser-supplied customer, product, plan, entitlement, or ownership data.",
        "Persist only a cryptographic hash of the checkout token.",
      ]),
    );
  });
});
