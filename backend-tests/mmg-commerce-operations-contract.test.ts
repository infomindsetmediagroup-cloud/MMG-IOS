import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  readFileSync(
    resolve(
      root,
      "registry/operations/mmg-commerce-operations-control-contract-v1.json",
    ),
    "utf8",
  ),
) as Record<string, any>;

describe("MMG commerce operations contract", () => {
  it("locks the protected operations implementation", () => {
    expect(contract.contract_id).toBe("mmg-commerce-operations-control-v1");
    expect(contract.status).toBe("approved_for_staging_integration");
    expect(contract.implementation.logical_endpoint).toBe(
      "/api/internal/commerce/operations",
    );
    expect(contract.actions).toContain("evaluate");
    expect(contract.actions).toContain("pause_rollout");
  });

  it("locks health thresholds and incident response", () => {
    expect(contract.health_signals.webhook_delivery_failure_rate).toEqual(
      expect.objectContaining({ warning: 0.02, critical: 0.05 }),
    );
    expect(contract.health_signals.ownership_duplicate_conflict_count).toEqual(
      expect.objectContaining({ critical: 1, critical_severity: "SEV1" }),
    );
    expect(contract.incident_contract.severity_levels.SEV1.suppressible).toBe(false);
    expect(contract.incident_contract.open_incident_blocks_rollout).toEqual([
      "SEV1",
      "SEV2",
    ]);
  });

  it("starts safely and forbids destructive containment", () => {
    expect(contract.control_contract.safe_initial_state).toEqual(
      expect.objectContaining({
        subscription_checkout: "disabled",
        webhook_ingestion: "enabled",
        delivery_scheduler: "disabled",
        recommendation_automation: "observe_only",
      }),
    );
    expect(
      contract.control_contract.automatic_containment
        .automatic_customer_data_deletion_allowed,
    ).toBe(false);
    expect(
      contract.control_contract.automatic_containment
        .automatic_delivered_ownership_revocation_allowed,
    ).toBe(false);
  });

  it("locks deterministic staged rollout", () => {
    expect(contract.rollout_contract.stages.pilot.cohort_percentage).toBe(5);
    expect(contract.rollout_contract.stages.limited.cohort_percentage).toBe(25);
    expect(contract.rollout_contract.stages.expanded.cohort_percentage).toBe(50);
    expect(contract.rollout_contract.stages.full.cohort_percentage).toBe(100);
    expect(contract.rollout_contract.assignment.stage_skip_allowed).toBe(false);
    expect(contract.rollout_contract.advancement_gates).toContain(
      "Latest consistency audit passed.",
    );
  });

  it("requires migration 008 and a staging incident drill", () => {
    expect(contract.dependencies.database_schema).toContain("20260720_008");
    expect(contract.release_gates.join(" ")).toContain("staging incident drill");
    expect(contract.integration_sequence.next_component).toContain(
      "Production adapter wiring",
    );
  });
});
