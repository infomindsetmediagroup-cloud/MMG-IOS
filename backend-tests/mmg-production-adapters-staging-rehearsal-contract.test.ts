import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  readFileSync(
    resolve(
      root,
      "registry/operations/mmg-production-adapters-staging-rehearsal-contract-v1.json",
    ),
    "utf8",
  ),
) as Record<string, any>;

describe("MMG production adapters and staging rehearsal contract", () => {
  it("locks the production adapter implementation", () => {
    expect(contract.contract_id).toBe(
      "mmg-production-adapters-staging-rehearsal-v1",
    );
    expect(contract.status).toBe("approved_for_staging_integration");
    expect(contract.implementation.composition_root).toContain(
      "production-operations-runtime.ts",
    );
    expect(contract.implementation.rehearsal_endpoint).toBe(
      "/api/internal/commerce/rehearsal",
    );
  });

  it("keeps publication and live customer data outside the rehearsal", () => {
    expect(contract.staging_rehearsal_contract.environment).toBe("staging_only");
    expect(contract.staging_rehearsal_contract.publication_allowed).toBe(false);
    expect(contract.staging_rehearsal_contract.live_customer_data_allowed).toBe(
      false,
    );
    expect(
      contract.staging_rehearsal_contract
        .delivered_ownership_revocation_allowed,
    ).toBe(false);
  });

  it("locks both incident drills and the full rollout sequence", () => {
    expect(contract.staging_rehearsal_contract.required_scenarios).toEqual([
      "database_connectivity_sev1",
      "webhook_failure_sev2",
    ]);
    expect(contract.staging_rehearsal_contract.rollout_sequence).toEqual([
      "paused",
      "internal",
      "pilot",
      "limited",
      "expanded",
      "full",
    ]);
    expect(contract.staging_rehearsal_contract.required_checks).toContain(
      "CUSTOMER_RIGHTS_PRESERVED",
    );
  });

  it("requires migration 010 and real staging adapter deployment", () => {
    expect(contract.dependencies.database_schema).toContain("20260721_010");
    expect(contract.release_gates.join(" ")).toContain(
      "complete SEV1, SEV2, consistency, rights-preservation, and staged-rollout rehearsal",
    );
    expect(contract.integration_sequence.next_component).toContain(
      "execute the first real staging rehearsal",
    );
  });
});
