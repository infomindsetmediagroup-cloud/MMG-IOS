import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type DeliveryWindowContract = {
  contract_id: string;
  version: string;
  status: string;
  dependencies: Record<string, string>;
  plan_schedule_contract: Array<{
    plan_code: string;
    packages_per_billing_cycle: number;
    assets_per_package: number;
    assets_per_billing_cycle: number;
    package_open_offsets_days: number[];
    five_week_month_rule?: string;
  }>;
  review_window_contract: {
    minimum_hours: number;
    maximum_hours: number;
    default_hours: number;
    first_package: {
      auto_confirm_on_expiry: boolean;
      expiry_result: string;
    };
    future_packages: {
      proposed_assets: number;
      auto_confirm_on_expiry: boolean;
      incomplete_or_invalid_expiry_result: string;
    };
  };
  window_lifecycle: {
    primary_states: string[];
    exception_states: string[];
    allowed_transitions: Record<string, string[]>;
  };
  controller_run_contract: {
    logical_endpoint: string;
    method: string;
    authorization: string;
    idempotency_field: string;
    actions: string[];
  };
  curation_contract: {
    required_title_count: number;
    required_unit_count: number;
    owned_assets_excluded: boolean;
    deterministic_fallback: { available: boolean };
  };
  security_contract: string[];
  integration_sequence: {
    previous_component: string;
    current_component: string;
    next_component: string;
    subsequent_components: string[];
  };
  release_gates: string[];
};

const currentFile = fileURLToPath(import.meta.url);
const root = resolve(dirname(currentFile), "..");
const read = (path: string): string =>
  readFileSync(resolve(root, path), "utf8");

const contract = JSON.parse(
  read(
    "registry/knowledge-library/mmg-delivery-window-controller-contract-v1.json",
  ),
) as DeliveryWindowContract;
const domain = read("server/knowledge-library/delivery-windows.ts");
const service = read("server/knowledge-library/delivery-window-service.ts");
const repository = read(
  "server/knowledge-library/postgres-delivery-window-repository.ts",
);
const http = read("server/knowledge-library/delivery-window-http.ts");
const migration = read(
  "database/migrations/20260720_002_mmg_delivery_window_controller.sql",
);

describe("MMG Delivery Window Controller contract", () => {
  it("is the approved staged delivery-window authority", () => {
    expect(contract.contract_id).toBe("mmg-delivery-window-controller-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.dependencies.domain_controller).toBe(
      "server/knowledge-library/delivery-windows.ts",
    );
    expect(contract.dependencies.postgres_repository).toBe(
      "server/knowledge-library/postgres-delivery-window-repository.ts",
    );
  });

  it("locks the exact monthly, bi-weekly, and weekly schedules", () => {
    expect(contract.plan_schedule_contract).toEqual([
      {
        plan_code: "monthly",
        packages_per_billing_cycle: 1,
        assets_per_package: 2,
        assets_per_billing_cycle: 2,
        package_open_offsets_days: [0],
      },
      {
        plan_code: "biweekly",
        packages_per_billing_cycle: 2,
        assets_per_package: 2,
        assets_per_billing_cycle: 4,
        package_open_offsets_days: [0, 14],
      },
      {
        plan_code: "weekly",
        packages_per_billing_cycle: 4,
        assets_per_package: 2,
        assets_per_billing_cycle: 8,
        package_open_offsets_days: [0, 7, 14, 21],
        five_week_month_rule:
          "The entitlement remains four packages and eight assets. No fifth package is created.",
      },
    ]);
    expect(domain).toContain("weekly: Object.freeze([0, 7, 14, 21])");
  });

  it("locks the first-package and future-package expiry policies", () => {
    expect(contract.review_window_contract).toMatchObject({
      minimum_hours: 24,
      maximum_hours: 48,
      default_hours: 48,
    });
    expect(
      contract.review_window_contract.first_package.auto_confirm_on_expiry,
    ).toBe(false);
    expect(contract.review_window_contract.first_package.expiry_result).toBe(
      "recovery_required",
    );
    expect(
      contract.review_window_contract.future_packages.auto_confirm_on_expiry,
    ).toBe(true);
    expect(contract.review_window_contract.future_packages.proposed_assets).toBe(
      2,
    );
    expect(
      contract.review_window_contract.future_packages
        .incomplete_or_invalid_expiry_result,
    ).toBe("recovery_required");
    expect(domain).toContain("FIRST_PACKAGE_CUSTOMER_SELECTION_EXPIRED");
    expect(service).toContain("AUTO_CONFIRM_REVALIDATION_FAILED");
  });

  it("extends the durable lifecycle through delivery and recovery", () => {
    expect(contract.window_lifecycle.primary_states).toEqual([
      "scheduled",
      "open",
      "confirmed",
      "delivery_ready",
      "delivered",
    ]);
    expect(contract.window_lifecycle.exception_states).toContain(
      "recovery_required",
    );
    expect(contract.window_lifecycle.allowed_transitions.confirmed).toContain(
      "delivery_ready",
    );
    expect(contract.window_lifecycle.allowed_transitions.delivery_ready).toContain(
      "delivered",
    );
    expect(migration).toContain("'delivery_ready'");
    expect(migration).toContain("'recovery_required'");
  });

  it("uses internal authorization and run-level idempotency", () => {
    expect(contract.controller_run_contract).toMatchObject({
      logical_endpoint:
        "/api/internal/knowledge-library/delivery-windows/run",
      method: "POST",
      authorization: "server-to-server internal authorization",
      idempotency_field: "runId",
    });
    expect(contract.controller_run_contract.actions).toEqual([
      "tick",
      "mark_delivered",
      "reopen_recovery",
    ]);
    expect(migration).toContain("mmg_delivery_controller_runs");
    expect(http).toContain("dependencies.authorize(request)");
    expect(http).toContain('"Cache-Control": "no-store, private"');
  });

  it("revalidates curation and excludes active ownership", () => {
    expect(contract.curation_contract).toMatchObject({
      required_title_count: 2,
      required_unit_count: 2,
      owned_assets_excluded: true,
      deterministic_fallback: { available: true },
    });
    expect(repository).toContain("MMG_DELIVERY_WINDOW_PROPOSAL_REVALIDATION_FAILED");
    expect(repository).toContain("FROM mmg_ownership_grants ownership");
    expect(repository).toContain("delivery_package_verified = TRUE");
  });

  it("records state transitions through parameterized SQL and audit events", () => {
    expect(repository).toContain("FOR UPDATE");
    expect(repository).toContain("mmg_entitlement_events");
    expect(repository).toContain("delivery_package_queued");
    expect(repository).toContain("delivery_package_delivered");
    expect(repository).not.toContain("document.body");
    expect(repository).not.toContain("customerId = '");
  });

  it("hands the completed controller to the Customer Portal dashboard", () => {
    expect(contract.integration_sequence).toEqual({
      previous_component:
        "MMG Entitlement Counter and Ownership-Resolution Persistence",
      current_component: "MMG Delivery Window Controller",
      next_component: "Customer Portal subscription dashboard",
      subsequent_components: [
        "Thank-you page first-title handoff",
        "My Library delivery interface",
        "Shopify subscription webhook reconciliation",
        "Kairos recommendation ranking",
        "Live Shopify provisioning and end-to-end deployment",
      ],
    });
    expect(contract.release_gates).toEqual(
      expect.arrayContaining([
        "The internal controller endpoint is connected to a protected scheduled runtime.",
        "The production delivery dispatcher is idempotent by window ID.",
        "Weekly cycles create exactly four packages, including five-week calendar months.",
      ]),
    );
  });
});
