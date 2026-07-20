import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

const contract = JSON.parse(
  read("registry/shopify/mmg-subscription-webhook-reconciliation-contract-v1.json"),
) as {
  contract_id: string;
  version: string;
  status: string;
  shopify_contract: {
    api_version: string;
    logical_endpoint: string;
    required_scope: string;
    topics: string[];
    maximum_body_bytes: number;
  };
  verification_contract: Record<string, unknown>;
  idempotency_contract: Record<string, unknown>;
  authoritative_contract_requirements: {
    variant_plan_mapping: Record<
      string,
      {
        packages_per_billing_cycle: number;
        assets_per_billing_cycle: number;
        window_offsets_days: number[];
      }
    >;
  };
  status_mapping: Record<string, string>;
  privacy_and_security_contract: string[];
  release_gates: string[];
  integration_sequence: Record<string, unknown>;
};

const migration = read(
  "database/migrations/20260720_005_mmg_shopify_subscription_reconciliation.sql",
);
const manifest = read(
  "shopify/webhooks/mmg-subscription-webhooks.shopify.app.toml",
);
const http = read("server/shopify/subscription-webhook-http.ts");
const auth = read("server/shopify/shopify-webhook-auth.ts");
const repository = read("server/shopify/subscription-webhook-repository.ts");
const gateway = read("server/shopify/shopify-subscription-contract-gateway.ts");

describe("MMG Shopify subscription webhook reconciliation contract", () => {
  it("is the approved staged reconciliation authority", () => {
    expect(contract.contract_id).toBe(
      "mmg-shopify-subscription-webhook-reconciliation-v1",
    );
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
  });

  it("locks the 2026-07 app-specific webhook surface and scope", () => {
    expect(contract.shopify_contract).toEqual(
      expect.objectContaining({
        api_version: "2026-07",
        logical_endpoint: "/api/shopify/webhooks/subscriptions",
        required_scope: "read_own_subscription_contracts",
        maximum_body_bytes: 65536,
      }),
    );
    expect(contract.shopify_contract.topics).toEqual([
      "subscription_contracts/create",
      "subscription_contracts/update",
      "subscription_billing_attempts/success",
      "subscription_billing_attempts/failure",
      "subscription_billing_attempts/challenged",
    ]);
    expect(manifest).toContain('api_version = "2026-07"');
    for (const topic of contract.shopify_contract.topics) {
      expect(manifest).toContain(`"${topic}"`);
    }
    expect(manifest).toContain('uri = "/api/shopify/webhooks/subscriptions"');
  });

  it("verifies the exact raw body before JSON processing", () => {
    expect(contract.verification_contract).toEqual(
      expect.objectContaining({
        hmac_algorithm: "HMAC-SHA256",
        hmac_encoding: "base64",
        payload_authoritative: false,
      }),
    );
    expect(auth).toContain('createHmac("sha256"');
    expect(auth).toContain("timingSafeEqual");
    expect(http.indexOf("verify({")).toBeLessThan(http.indexOf("safePayload(rawBody)"));
    expect(http).toContain("X-Shopify-Hmac-Sha256");
    expect(http).toContain("MAX_BODY_BYTES = 65_536");
  });

  it("creates durable inbox, contract, and billing-attempt persistence without raw bodies", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS mmg_shopify_webhook_deliveries");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS mmg_shopify_subscription_contracts");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS mmg_shopify_subscription_billing_attempts");
    expect(migration).toContain("payload_sha256");
    expect(migration).not.toMatch(/raw_(body|payload)\s+text/i);
    expect(repository).toContain("MMG_SHOPIFY_WEBHOOK_ID_PAYLOAD_COLLISION");
    expect(repository).toContain("duplicate_processed");
  });

  it("locks exact plan capacity and four Weekly windows", () => {
    expect(contract.authoritative_contract_requirements.variant_plan_mapping).toEqual({
      monthly: expect.objectContaining({
        packages_per_billing_cycle: 1,
        assets_per_billing_cycle: 2,
        window_offsets_days: [0],
      }),
      biweekly: expect.objectContaining({
        packages_per_billing_cycle: 2,
        assets_per_billing_cycle: 4,
        window_offsets_days: [0, 14],
      }),
      weekly: expect.objectContaining({
        packages_per_billing_cycle: 4,
        assets_per_billing_cycle: 8,
        window_offsets_days: [0, 7, 14, 21],
      }),
    });
    expect(repository).toContain("return [0, 7, 14, 21]");
    expect(repository).toContain("plan.packagesPerBillingCycle");
    expect(repository).toContain("ON CONFLICT (subscription_entitlement_id, starts_at) DO NOTHING");
  });

  it("preserves all five membership states and authoritative GraphQL reload", () => {
    expect(contract.status_mapping).toEqual({
      ACTIVE: "active",
      PAUSED: "paused",
      FAILED: "failed",
      CANCELLED: "canceled",
      EXPIRED: "expired",
    });
    expect(gateway).toContain("subscriptionContract(id: $contractId)");
    expect(gateway).toContain("productId");
    expect(gateway).toContain("variantId");
    expect(gateway).toContain("sellingPlanId");
    expect(gateway).toContain("X-Shopify-Access-Token");
  });

  it("keeps secrets and provider internals outside storefront output", () => {
    const privacy = contract.privacy_and_security_contract.join(" ");
    expect(privacy).toContain("Never persist the Shopify app client secret");
    expect(privacy).toContain("Never persist the raw webhook body");
    expect(privacy).toContain("Never expose provider contract IDs");
    expect(migration).not.toMatch(/client_secret|access_token/i);
    expect(contract.release_gates.length).toBeGreaterThanOrEqual(12);
  });

  it("locks recommendation ranking as the next dependency", () => {
    expect(contract.integration_sequence).toEqual({
      previous_component: "My Library delivery interface",
      current_component: "Shopify subscription webhook reconciliation",
      next_component: "Kairos recommendation and curation ranking",
      subsequent_components: ["Live Shopify provisioning and end-to-end deployment"],
    });
  });
});
