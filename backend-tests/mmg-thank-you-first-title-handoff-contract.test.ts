import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

const contract = JSON.parse(
  read("registry/checkout/mmg-thank-you-first-title-handoff-contract-v1.json"),
) as {
  contract_id: string;
  version: string;
  status: string;
  shopify_surface: Record<string, unknown>;
  endpoint_contract: Record<string, unknown>;
  subscription_detection: { required_predicates: string[] };
  handoff_states: Array<{ state: string }>;
  first_package_contract: Record<string, unknown>;
  persistence_contract: Record<string, unknown>;
  security_contract: string[];
  release_gates: string[];
  integration_sequence: Record<string, unknown>;
};

const extensionConfig = read(
  "extensions/mmg-thank-you-first-title-handoff/shopify.extension.toml",
);
const extensionSource = read(
  "extensions/mmg-thank-you-first-title-handoff/src/ThankYou.tsx",
);
const migration = read(
  "database/migrations/20260720_003_mmg_thank_you_first_title_handoff.sql",
);
const http = read("server/checkout/thank-you-handoff-http.ts");
const service = read("server/checkout/thank-you-handoff-service.ts");

describe("MMG Thank-you first-title handoff contract", () => {
  it("is the approved staged handoff authority", () => {
    expect(contract.contract_id).toBe("mmg-thank-you-first-title-handoff-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
  });

  it("uses the new Thank you checkout UI extension target", () => {
    expect(contract.shopify_surface).toEqual(
      expect.objectContaining({
        page: "Thank you",
        extension_target: "purchase.thank-you.block.render",
        default_placement: "ORDER_STATUS1",
        api_version: "2026-07",
        network_access_required: true,
        write_access_to_order: false,
      }),
    );
    expect(extensionConfig).toContain('target = "purchase.thank-you.block.render"');
    expect(extensionConfig).toContain('default_placement = "ORDER_STATUS1"');
    expect(extensionConfig).toContain("network_access = true");
    expect(extensionConfig).not.toContain("checkout.liquid");
    expect(extensionConfig).not.toContain("additional scripts");
  });

  it("requires an authenticated private POST with CORS support", () => {
    expect(contract.endpoint_contract).toEqual(
      expect.objectContaining({
        logical_endpoint: "/api/checkout/thank-you/subscription-handoff",
        method: "POST",
        preflight_method: "OPTIONS",
        authentication: "Shopify checkout extension session token",
        maximum_body_bytes: 4096,
        cache_control: "no-store, private",
        cors_allow_origin: "*",
        raw_checkout_token_persisted: false,
        order_verification_required: true,
      }),
    );
    expect(http).toContain('"Access-Control-Allow-Origin": "*"');
    expect(http).toContain('request.headers.get("authorization")');
    expect(http).toContain("MAX_BODY_BYTES = 4096");
    expect(service).toContain("loadVerifiedOrder");
    expect(service).toContain("createHash(\"sha256\")");
  });

  it("implements every governed handoff state", () => {
    expect(contract.handoff_states.map(({ state }) => state)).toEqual([
      "not_applicable",
      "sign_in_required",
      "activation_pending",
      "ready",
      "selection_in_progress",
      "recovery_required",
      "completed",
    ]);
    for (const state of contract.handoff_states.map(({ state }) => state)) {
      expect(extensionSource).toContain(`\"${state}\"`);
    }
  });

  it("preserves the first two-title contract outside checkout", () => {
    expect(contract.first_package_contract).toEqual(
      expect.objectContaining({
        target_titles: 2,
        target_units: 2,
        customer_selects_titles: true,
        selection_inside_checkout: false,
        first_package_auto_confirmation: false,
        expired_first_package_state: "recovery_required",
      }),
    );
    expect(extensionSource).toContain("Choose your first two titles");
    expect(extensionSource).not.toContain("applyCartLinesChange");
    expect(extensionSource).not.toContain("applyMetafieldChange");
  });

  it("persists an idempotent order link without storing the raw checkout token", () => {
    expect(contract.persistence_contract).toEqual(
      expect.objectContaining({
        order_link_table: "mmg_subscription_order_links",
        event_table: "mmg_thank_you_handoff_events",
        order_link_key: "shop_domain + order_id",
        checkout_token_storage: "SHA-256 hash only",
        entitlement_link_owner: "Shopify subscription webhook reconciliation",
      }),
    );
    expect(migration).toContain("PRIMARY KEY (shop_domain, order_id)");
    expect(migration).toContain("checkout_token_hash");
    expect(migration).not.toMatch(/checkout_token\s+text/);
    expect(migration).toContain("subscription_entitlement_id");
  });

  it("keeps the extension customer-safe and checkout-compatible", () => {
    expect(extensionSource).toContain("shopify.sessionToken.get()");
    expect(extensionSource).toContain("shopify.orderConfirmation.value?.order.id");
    expect(extensionSource).toContain("shopify.checkoutToken.value");
    expect(extensionSource).not.toContain("shopify.orderConfirmation.value?.id");
    expect(extensionSource).not.toContain("innerHTML");
    expect(extensionSource).not.toContain("document.querySelector");
    expect(extensionSource).not.toContain("window.location");
    expect(extensionSource).not.toContain("customerId:");
    expect(contract.security_contract.join(" ")).toContain(
      "Guest buyers must authenticate",
    );
  });

  it("locks the next commerce dependency", () => {
    expect(contract.integration_sequence).toEqual({
      previous_component: "Customer Portal subscription dashboard",
      current_component: "Thank-you page first-title handoff",
      next_component: "My Library delivery interface",
      subsequent_components: [
        "Shopify subscription webhook reconciliation",
        "Kairos recommendation and curation ranking",
        "Live Shopify provisioning and end-to-end deployment",
      ],
    });
    expect(contract.release_gates.length).toBeGreaterThanOrEqual(10);
  });
});
