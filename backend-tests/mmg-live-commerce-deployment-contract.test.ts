import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  readFileSync(
    resolve(
      root,
      "registry/deployment/mmg-live-commerce-deployment-contract-v1.json",
    ),
    "utf8",
  ),
) as Record<string, any>;

describe("MMG live commerce deployment contract", () => {
  it("locks the controlled release implementation", () => {
    expect(contract.contract_id).toBe("mmg-live-commerce-deployment-contract-v1");
    expect(contract.status).toBe("approved_for_controlled_release");
    expect(contract.implementation.logical_endpoint).toBe(
      "/api/internal/commerce/deployment",
    );
    expect(contract.deployment_actions).toEqual([
      "plan",
      "execute",
      "verify",
      "publish",
      "rollback",
    ]);
  });

  it("keeps publication separate and approval-gated", () => {
    expect(contract.shopify_contract.provisioning_status).toBe("DRAFT");
    expect(contract.shopify_contract.publication_is_separate_action).toBe(true);
    expect(contract.approval_contract.publication_always_requires_approval).toBe(
      true,
    );
    expect(contract.e2e_contract.publication_requires_all_checks_passed).toBe(
      true,
    );
  });

  it("preserves locked product economics", () => {
    expect(contract.locked_product_economics).toEqual(
      expect.objectContaining({
        monthly: expect.objectContaining({ price: "14.95", packages: 1, assets: 2 }),
        biweekly: expect.objectContaining({ price: "24.95", packages: 2, assets: 4 }),
        weekly: expect.objectContaining({
          price: "39.95",
          packages: 4,
          assets: 8,
          package_offsets_days: [0, 7, 14, 21],
        }),
      }),
    );
  });

  it("requires migrations, routes, scopes, webhooks, and complete E2E evidence", () => {
    expect(contract.required_migrations).toHaveLength(7);
    expect(contract.required_runtime_routes).toContain(
      "/api/shopify/webhooks/subscriptions",
    );
    expect(contract.shopify_contract.required_scopes).toContain(
      "write_own_subscription_contracts",
    );
    expect(contract.required_webhook_topics).toHaveLength(5);
    expect(contract.e2e_contract.checks).toContain(
      "signed_read_or_download_access_valid",
    );
  });

  it("forbids secret persistence and destructive customer rollback", () => {
    expect(contract.privacy_and_security_contract.join(" ")).toContain(
      "Never commit Shopify app secrets",
    );
    expect(contract.rollback_contract.automatic_live_data_deletion_allowed).toBe(
      false,
    );
    expect(contract.rollback_contract.customer_rights).toContain(
      "Never revoke delivered ownership",
    );
  });
});
