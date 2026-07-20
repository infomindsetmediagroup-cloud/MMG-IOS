import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type PersistenceContract = {
  contract_id: string;
  version: string;
  status: string;
  implementation: Record<string, string>;
  subscription_plan_contract: Array<{
    plan_code: string;
    monthly_price: number;
    packages_per_billing_cycle: number;
    assets_per_package: number;
    assets_per_billing_cycle: number;
  }>;
  database_contract: {
    engine: string;
    tables: string[];
    versioned_records: string[];
    canonical_asset_key: string;
    customer_ownership_key: string;
    selection_key: string;
    idempotency_key: string;
  };
  ownership_contract: {
    grant_sources: string[];
    grant_statuses: string[];
    active_uniqueness: string;
  };
  entitlement_counter_contract: {
    current_window_priority: string[];
  };
  confirmation_transaction_contract: {
    required_checks: string[];
    atomic_writes: string[];
    rollback_rule: string;
  };
  entitlement_api_contract: {
    logical_endpoint: string;
    method: string;
    authentication: string;
    cache_control: string;
    response_schema_version: string;
    customer_identity_from_browser_allowed: boolean;
  };
  storefront_component: {
    liquid_snippet: string;
    javascript_asset: string;
    stylesheet_asset: string;
    knowledge_library_integration: string;
    refresh_events: string[];
    emitted_events: string[];
  };
  integration_sequence: {
    previous_component: string;
    current_component: string;
    completed_dependency: string;
    next_component: string;
    subsequent_components: string[];
  };
  release_gates: string[];
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const read = (path: string): string =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

const contract = JSON.parse(
  read(
    "registry/knowledge-library/mmg-entitlement-ownership-persistence-contract-v1.json",
  ),
) as PersistenceContract;
const migration = read(
  "database/migrations/20260720_001_mmg_knowledge_entitlements.sql",
);
const repository = read(
  "server/knowledge-library/postgres-entitlement-repository.ts",
);
const liquid = read("shopify/snippets/mmg-entitlement-counter.liquid");
const runtime = read("shopify/assets/mmg-entitlement-counter.js");
const styles = read("shopify/assets/mmg-entitlement-counter.css");
const integration = read(
  "shopify/knowledge-library/mmg-entitlement-counter-integration.liquid",
);

describe("MMG entitlement and ownership persistence contract", () => {
  it("is the approved staged persistence authority", () => {
    expect(contract.contract_id).toBe(
      "mmg-entitlement-ownership-persistence-v1",
    );
    expect(contract.version).toBe("1.1.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.implementation.database_migration).toBe(
      "database/migrations/20260720_001_mmg_knowledge_entitlements.sql",
    );
    expect(contract.implementation.postgres_repository).toBe(
      "server/knowledge-library/postgres-entitlement-repository.ts",
    );
  });

  it("locks exact plan prices, packages, and units", () => {
    expect(contract.subscription_plan_contract).toEqual([
      expect.objectContaining({
        plan_code: "monthly",
        monthly_price: 14.95,
        packages_per_billing_cycle: 1,
        assets_per_package: 2,
        assets_per_billing_cycle: 2,
      }),
      expect.objectContaining({
        plan_code: "biweekly",
        monthly_price: 24.95,
        packages_per_billing_cycle: 2,
        assets_per_package: 2,
        assets_per_billing_cycle: 4,
      }),
      expect.objectContaining({
        plan_code: "weekly",
        monthly_price: 39.95,
        packages_per_billing_cycle: 4,
        assets_per_package: 2,
        assets_per_billing_cycle: 8,
      }),
    ]);
  });

  it("defines every durable table and version key", () => {
    expect(contract.database_contract.engine).toContain("PostgreSQL");
    expect(contract.database_contract.tables).toEqual(
      expect.arrayContaining([
        "mmg_knowledge_assets",
        "mmg_subscription_entitlements",
        "mmg_entitlement_cycles",
        "mmg_entitlement_windows",
        "mmg_entitlement_selections",
        "mmg_picker_requests",
        "mmg_delivery_grants",
        "mmg_ownership_grants",
        "mmg_entitlement_events",
      ]),
    );
    expect(contract.database_contract.versioned_records).toEqual(
      expect.arrayContaining([
        "mmg_subscription_entitlements.version",
        "mmg_entitlement_cycles.version",
        "mmg_entitlement_windows.version",
      ]),
    );
    expect(contract.database_contract.canonical_asset_key).toBe("asset_id");
    expect(contract.database_contract.customer_ownership_key).toBe(
      "customer_id + asset_id",
    );
    expect(contract.database_contract.idempotency_key).toBe(
      "window_id + request_id",
    );
  });

  it("creates relational constraints that prevent duplicate active ownership and delivery", () => {
    for (const table of contract.database_contract.tables) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain(
      "mmg_ownership_grants_one_active_asset_idx",
    );
    expect(migration).toContain("WHERE status = 'active'");
    expect(migration).toContain("UNIQUE (window_id, asset_id)");
    expect(migration).toContain("PRIMARY KEY (window_id, request_id)");
    expect(migration).toContain("mmg_entitlement_windows_one_open_cycle_idx");
    expect(migration).toContain("CHECK (consumed_units <= total_units)");
  });

  it("locks transactional confirmation and rollback behavior", () => {
    expect(
      contract.confirmation_transaction_contract.required_checks.join(" "),
    ).toContain("already actively owned");
    expect(contract.confirmation_transaction_contract.atomic_writes).toEqual(
      expect.arrayContaining([
        "Create one delivery grant per selected asset.",
        "Create one active ownership grant per selected asset.",
        "Increment cycle confirmed-package and consumed-unit counters.",
        "Write an entitlement audit event.",
      ]),
    );
    expect(contract.confirmation_transaction_contract.rollback_rule).toContain(
      "rolls back",
    );

    expect(repository).toContain("FOR UPDATE");
    expect(repository).toContain("FOR SHARE");
    expect(repository).toContain("expectedPreviousVersion");
    expect(repository).toContain(
      "MMG_PERSISTENCE_CONFIRMATION_ASSET_ALREADY_OWNED",
    );
    expect(repository).toContain("INSERT INTO mmg_delivery_grants");
    expect(repository).toContain("INSERT INTO mmg_ownership_grants");
    expect(repository).toContain("UPDATE mmg_entitlement_cycles");
    expect(repository).toContain("INSERT INTO mmg_entitlement_events");
  });

  it("persists picker idempotency keys and limits retained request IDs", () => {
    expect(repository).toContain("INSERT INTO mmg_picker_requests");
    expect(repository).toContain(
      "ON CONFLICT (window_id, request_id) DO NOTHING",
    );
    expect(repository).toContain("LIMIT 100");
  });

  it("defines the secure authenticated entitlement endpoint", () => {
    expect(contract.entitlement_api_contract).toEqual({
      logical_endpoint: "/api/knowledge-library/entitlement",
      method: "GET",
      authentication: "Authenticated server session",
      cache_control: "no-store, private",
      response_schema_version: "1.0.0",
      customer_identity_from_browser_allowed: false,
    });
  });

  it("includes delivery and recovery states in counter priority", () => {
    expect(contract.entitlement_counter_contract.current_window_priority).toEqual([
      "open",
      "recovery_required",
      "scheduled",
      "confirmed",
      "delivery_ready",
      "delivered",
      "closed",
      "expired",
      "canceled",
    ]);
  });

  it("builds the reusable storefront counter without page-shell damage", () => {
    expect(contract.storefront_component.liquid_snippet).toBe(
      "shopify/snippets/mmg-entitlement-counter.liquid",
    );
    expect(liquid).toContain("<mmg-entitlement-counter");
    expect(liquid).toContain('role="progressbar"');
    expect(liquid).toContain('aria-live="polite"');
    expect(runtime).toContain('credentials: "same-origin"');
    expect(runtime).toContain("textContent");
    expect(runtime).not.toContain("insertAdjacentHTML");
    expect(runtime).not.toContain("document.write");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (max-width: 640px)");
    expect(integration).toContain("mmg-entitlement-counter");

    for (const source of [liquid, runtime, styles, integration]) {
      expect(source).not.toContain("100vw");
      expect(source).not.toContain("#MainContent");
      expect(source).not.toContain("document.body.style");
    }
  });

  it("records the completed controller and advances to the Customer Portal dashboard", () => {
    expect(contract.integration_sequence.previous_component).toBe(
      "MMG Knowledge Library Picker",
    );
    expect(contract.integration_sequence.current_component).toBe(
      "MMG Entitlement Counter and Ownership-Resolution Persistence",
    );
    expect(contract.integration_sequence.completed_dependency).toBe(
      "MMG Delivery Window Controller",
    );
    expect(contract.integration_sequence.next_component).toBe(
      "Customer Portal subscription dashboard",
    );
    expect(contract.release_gates).toContain(
      "Concurrent selection and confirmation tests pass against a real PostgreSQL transaction environment.",
    );
  });
});
