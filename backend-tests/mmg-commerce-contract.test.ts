import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "registry/products/mmg-commerce-contract-v1.json"),
    "utf8",
  ),
) as Record<string, any>;

describe("MMG commerce contract", () => {
  it("is the approved v1.9 authority", () => {
    expect(contract.contract_id).toBe("mmg-commerce-contract-v1");
    expect(contract.version).toBe("1.9.0");
    expect(contract.status).toBe("approved");
  });

  it("locks exact subscription prices, packages, and asset capacity", () => {
    expect(
      contract.product_types.subscription.plans.map(
        ({
          plan_code,
          price,
          packages_per_billing_cycle,
          assets_per_package,
          assets_per_billing_cycle,
        }: Record<string, unknown>) => ({
          plan_code,
          price,
          packages_per_billing_cycle,
          assets_per_package,
          assets_per_billing_cycle,
        }),
      ),
    ).toEqual([
      {
        plan_code: "monthly",
        price: 14.95,
        packages_per_billing_cycle: 1,
        assets_per_package: 2,
        assets_per_billing_cycle: 2,
      },
      {
        plan_code: "biweekly",
        price: 24.95,
        packages_per_billing_cycle: 2,
        assets_per_package: 2,
        assets_per_billing_cycle: 4,
      },
      {
        plan_code: "weekly",
        price: 39.95,
        packages_per_billing_cycle: 4,
        assets_per_package: 2,
        assets_per_billing_cycle: 8,
      },
    ]);
    for (const plan of contract.product_types.subscription.plans) {
      expect(plan.billing_interval).toBe("month");
      expect(plan.assets_per_billing_cycle).toBe(
        plan.packages_per_billing_cycle * plan.assets_per_package,
      );
    }
  });

  it("locks one canonical subscription product and Shopify/Kairos ownership", () => {
    const subscription = contract.product_types.subscription;
    expect(subscription.canonical_product_title).toBe(
      "MMG Knowledge Subscription™",
    );
    expect(subscription.canonical_handle).toBe("mmg-knowledge-subscription");
    expect(subscription.billing_currency).toBe("USD");
    expect(subscription.shopify_structure).toEqual(
      expect.objectContaining({
        product_model: "ONE_PRODUCT_THREE_CADENCE_VARIANTS",
        variant_codes: ["monthly", "biweekly", "weekly"],
        requires_selling_plan: true,
        selling_plan_model: "ONE_SHARED_MONTHLY_SELLING_PLAN",
        billing_owner: "Shopify",
        intra_cycle_package_schedule_owner: "Kairos",
      }),
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
    ).toEqual(["portrait_cover", "square_thumbnail"]);
    expect(
      contract.product_types.service.variants.map(
        (variant: Record<string, string>) => variant.name,
      ),
    ).toEqual(["Starter", "Growth", "Professional"]);
    expect(contract.product_types.service.media_behavior.gallery_rule).toContain(
      "Do not display",
    );
  });

  it("connects picker, persistence, delivery windows, portal, handoff, and My Library", () => {
    expect(contract.knowledge_library_contract.canonical_asset_key).toBe(
      "mmg.asset_id",
    );
    expect(contract.knowledge_library_picker_contract).toEqual(
      expect.objectContaining({
        logical_endpoint: "/api/knowledge-library/picker",
        optimistic_concurrency_field: "expectedWindowVersion",
        idempotency_field: "requestId",
      }),
    );
    expect(
      contract.entitlement_ownership_persistence_contract.confirmation_transaction,
    ).toContain("commit or roll back together");
    expect(contract.delivery_window_controller_contract).toEqual(
      expect.objectContaining({
        weekly_package_offsets_days: [0, 7, 14, 21],
        first_package_expiry: "recovery_required",
        review_window_hours: { minimum: 24, maximum: 48, default: 48 },
      }),
    );
    expect(contract.customer_portal_subscription_dashboard_contract).toEqual(
      expect.objectContaining({
        logical_endpoint: "/api/customer-portal/subscription",
        authentication: "authenticated server session",
        mutation_mode: "read_only",
        private_response: true,
      }),
    );
    expect(contract.thank_you_first_title_handoff_contract).toEqual(
      expect.objectContaining({
        logical_endpoint: "/api/checkout/thank-you/subscription-handoff",
        extension_target: "purchase.thank-you.block.render",
        raw_checkout_token_persisted: false,
      }),
    );
    expect(contract.my_library_delivery_interface_contract).toEqual(
      expect.objectContaining({
        library_endpoint: "/api/customer-portal/my-library",
        access_endpoint: "/api/customer-portal/my-library/access",
        same_origin_and_csrf_required: true,
        signed_url_ttl_seconds: { minimum: 60, default: 300, maximum: 600 },
        permanent_file_urls_exposed: false,
      }),
    );
  });

  it("connects commerce to Shopify subscription webhook reconciliation", () => {
    expect(contract.shopify_subscription_webhook_reconciliation_contract).toEqual({
      authority:
        "registry/shopify/mmg-subscription-webhook-reconciliation-contract-v1.json",
      domain_model: "server/shopify/subscription-webhook-reconciliation.ts",
      service_boundary: "server/shopify/subscription-webhook-service.ts",
      postgres_repository: "server/shopify/subscription-webhook-repository.ts",
      shopify_gateway:
        "server/shopify/shopify-subscription-contract-gateway.ts",
      logical_endpoint: "/api/shopify/webhooks/subscriptions",
      webhook_manifest:
        "shopify/webhooks/mmg-subscription-webhooks.shopify.app.toml",
      database_schema:
        "database/migrations/20260720_005_mmg_shopify_subscription_reconciliation.sql",
      api_version: "2026-07",
      required_scope: "read_own_subscription_contracts",
      hmac_required: true,
      deduplication_header: "X-Shopify-Webhook-Id",
      server_authority: "Kairos",
    });
    expect(contract.reusable_components).toContain(
      "MMG Shopify Subscription Webhook Reconciliation",
    );
    expect(contract.canonical_customer_flow).toEqual(
      expect.arrayContaining([
        "Checkout",
        "Thank-you first-title handoff",
        "Shopify subscription webhook reconciliation",
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

  it("keeps metadata, ownership, security, and anti-overdraw rules", () => {
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
        "Persist only a cryptographic hash of the checkout token.",
        "Revalidate active ownership and delivered subscription state before issuing file access.",
        "Verify Shopify webhooks against the exact raw-body HMAC before parsing JSON.",
        "Deduplicate Shopify webhook deliveries by X-Shopify-Webhook-Id and reject webhook-ID payload collisions.",
        "Reload the authoritative Shopify SubscriptionContract before mutating entitlements.",
        "Create at most one entitlement cycle per subscription and authoritative current-period start.",
        "Never persist raw Shopify webhook bodies, app client secrets, or Admin API access tokens.",
      ]),
    );
  });
});
