import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const read = (path: string): string =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

const contract = JSON.parse(
  read("registry/customer-portal/mmg-subscription-dashboard-contract-v1.json"),
) as {
  contract_id: string;
  version: string;
  status: string;
  canonical_route: string;
  endpoint_contract: Record<string, unknown>;
  membership_contract: {
    locked_plans: Array<Record<string, unknown>>;
  };
  current_package_contract: {
    priority_order: string[];
  };
  storefront_implementation: Record<string, string>;
  security_contract: string[];
  integration_sequence: {
    previous_component: string;
    current_component: string;
    next_component: string;
  };
};

const liquid = read(
  "shopify/snippets/mmg-customer-portal-subscription-dashboard.liquid",
);
const runtime = read(
  "shopify/assets/mmg-customer-portal-subscription-dashboard.js",
);
const styles = read(
  "shopify/assets/mmg-customer-portal-subscription-dashboard.css",
);
const integration = read(
  "shopify/customer-portal/mmg-subscription-dashboard-integration.liquid",
);
const repository = read(
  "server/customer-portal/subscription-dashboard-repository.ts",
);

const sources = [liquid, runtime, styles, integration];

describe("MMG Customer Portal subscription dashboard contract", () => {
  it("is the approved staged authority for the active Customer Portal route", () => {
    expect(contract.contract_id).toBe(
      "mmg-customer-portal-subscription-dashboard-v1",
    );
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.canonical_route).toBe("/pages/customer-portal");
  });

  it("locks the exact three membership plans", () => {
    expect(contract.membership_contract.locked_plans).toEqual([
      expect.objectContaining({
        plan_code: "monthly",
        monthly_price: 14.95,
        packages_per_billing_cycle: 1,
        assets_per_billing_cycle: 2,
      }),
      expect.objectContaining({
        plan_code: "biweekly",
        monthly_price: 24.95,
        packages_per_billing_cycle: 2,
        assets_per_billing_cycle: 4,
      }),
      expect.objectContaining({
        plan_code: "weekly",
        monthly_price: 39.95,
        packages_per_billing_cycle: 4,
        assets_per_billing_cycle: 8,
      }),
    ]);
  });

  it("uses the governed current-package priority", () => {
    expect(contract.current_package_contract.priority_order).toEqual([
      "recovery_required",
      "open",
      "delivery_ready",
      "confirmed",
      "scheduled",
      "delivered",
      "closed",
      "expired",
      "canceled",
    ]);
  });

  it("defines a private read-only authenticated endpoint", () => {
    expect(contract.endpoint_contract).toEqual(
      expect.objectContaining({
        logical_endpoint: "/api/customer-portal/subscription",
        method: "GET",
        customer_identity_source: "server session only",
        cache_control: "no-store, private",
        provider_contract_id_exposed: false,
        raw_grant_ids_exposed: false,
        delivery_package_reference_exposed: false,
      }),
    );
    expect(repository).toContain("WHERE customer_id = $1");
    expect(repository).not.toContain("provider_contract_id:");
  });

  it("renders a Shopify-safe additive portal component", () => {
    expect(liquid).toContain("<mmg-customer-portal-subscription-dashboard");
    expect(liquid).toContain('role="timer"');
    expect(runtime).toContain('credentials: "same-origin"');
    expect(runtime).toContain("textContent");
    expect(runtime).toContain("replaceChildren");
    expect(runtime).not.toContain("innerHTML");
    expect(runtime).not.toContain("insertAdjacentHTML");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (max-width: 640px)");
    expect(integration).toContain("mmg-customer-portal-subscription-dashboard");

    for (const source of sources) {
      expect(source).not.toContain("100vw");
      expect(source).not.toContain("#MainContent");
      expect(source).not.toContain("document.body.style");
    }
  });

  it("preserves the security and build sequence", () => {
    expect(contract.security_contract.join(" ")).toContain(
      "authenticated server session",
    );
    expect(contract.security_contract.join(" ")).toContain(
      "initial dashboard endpoint is read-only",
    );
    expect(contract.integration_sequence).toEqual({
      previous_component: "MMG Delivery Window Controller",
      current_component: "Customer Portal subscription dashboard",
      next_component: "Thank-you page first-title handoff",
      subsequent_components: [
        "My Library delivery interface",
        "Shopify subscription webhook reconciliation",
        "Kairos recommendation ranking",
        "Live Shopify provisioning and end-to-end deployment",
      ],
    });
  });
});
