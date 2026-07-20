import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string =>
  readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(
  read("registry/knowledge-library/mmg-recommendation-curation-ranking-contract-v1.json"),
) as Record<string, any>;
const migration = read(
  "database/migrations/20260720_006_mmg_recommendation_curation_ranking.sql",
);
const ranking = read("server/knowledge-library/recommendation-ranking.ts");
const curator = read("server/knowledge-library/recommendation-curator.ts");
const profileHttp = read("server/knowledge-library/recommendation-profile-http.ts");

describe("MMG recommendation and curation contract", () => {
  it("is the approved staged v1 authority", () => {
    expect(contract.contract_id).toBe("mmg-recommendation-curation-ranking-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.implementation.ranking_version).toBe("1.0.0");
  });

  it("locks the authenticated onboarding profile fields", () => {
    expect(contract.learning_profile_contract.fields).toEqual(
      expect.arrayContaining([
        "role_code",
        "primary_goal",
        "secondary_goals",
        "experience_level",
        "primary_topics",
        "secondary_topics",
        "preferred_formats",
        "excluded_topics",
      ]),
    );
    expect(contract.learning_profile_contract.same_origin_write_required).toBe(true);
    expect(contract.learning_profile_contract.csrf_write_required).toBe(true);
    expect(contract.learning_profile_contract.browser_customer_identity_authoritative).toBe(false);
    expect(profileHttp).toContain("validateSameOrigin");
    expect(profileHttp).toContain("validateCsrf");
    expect(profileHttp).toContain("MAX_BODY_BYTES = 8192");
  });

  it("preserves eligibility and exact package capacity", () => {
    expect(contract.candidate_hard_gates).toEqual(
      expect.arrayContaining([
        "not already owned",
        "not already selected in the current window",
        "verified delivery package",
        "not explicitly disliked",
      ]),
    );
    expect(contract.package_contract.exact_count_required).toBe(true);
    expect(contract.package_contract.exact_units_required).toBe(true);
    expect(contract.package_contract.first_package_behavior).toContain(
      "customer-selected",
    );
    expect(ranking).toContain("targetAssetCount");
    expect(ranking).toContain("unitsRemaining");
    expect(curator).toContain('source: "kairos"');
  });

  it("creates durable profile, interaction, run, and score records", () => {
    for (const table of [
      "mmg_customer_learning_profiles",
      "mmg_customer_asset_interactions",
      "mmg_recommendation_runs",
      "mmg_recommendation_scores",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain("UNIQUE (window_id, window_version)");
    expect(contract.persistence_contract.maximum_persisted_candidate_scores_per_run).toBe(250);
  });

  it("uses deterministic explainable ranking rather than browser authority", () => {
    expect(contract.explainability_contract).toEqual(
      expect.objectContaining({
        deterministic: true,
        reason_codes_required: true,
        score_components_persisted: true,
        raw_model_prompt_persisted: false,
        external_model_required: false,
        browser_score_authoritative: false,
        customer_facing_internal_scores: false,
      }),
    );
    expect(ranking).toContain("reasonCodes");
    expect(ranking).toContain("components");
    expect(ranking).toContain("assetId.localeCompare");
  });

  it("locks live provisioning as the next dependency", () => {
    expect(contract.integration_sequence).toEqual({
      previous_component: "Shopify subscription webhook reconciliation",
      current_component: "Kairos recommendation and curation ranking",
      next_component: "Live Shopify provisioning and end-to-end deployment",
      subsequent_components: [
        "Operational monitoring and controlled production rollout",
      ],
    });
    expect(contract.release_gates.length).toBeGreaterThanOrEqual(12);
  });
});