import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string =>
  readFileSync(resolve(root, path), "utf8");

const liquid = read("shopify/snippets/mmg-learning-profile.liquid");
const integration = read(
  "shopify/customer-portal/mmg-learning-profile-integration.liquid",
);
const javascript = read("shopify/assets/mmg-learning-profile.js");
const stylesheet = read("shopify/assets/mmg-learning-profile.css");
const contract = JSON.parse(
  read("registry/knowledge-library/mmg-recommendation-curation-ranking-contract-v1.json"),
) as Record<string, any>;

describe("MMG learning profile storefront", () => {
  it("registers the additive Customer Portal surface", () => {
    expect(contract.implementation).toEqual(
      expect.objectContaining({
        learning_profile_route: "/pages/customer-portal#learning-profile",
        learning_profile_storefront_component:
          "shopify/snippets/mmg-learning-profile.liquid",
        learning_profile_javascript: "shopify/assets/mmg-learning-profile.js",
        learning_profile_stylesheet: "shopify/assets/mmg-learning-profile.css",
        learning_profile_integration:
          "shopify/customer-portal/mmg-learning-profile-integration.liquid",
      }),
    );
    expect(contract.learning_profile_contract.additive_to_existing_customer_portal).toBe(
      true,
    );
    expect(liquid).toContain("<mmg-learning-profile");
    expect(liquid).toContain('id="learning-profile"');
    expect(integration).toContain("{% render 'mmg-learning-profile'");
  });

  it("requires a server-injected CSRF token and private endpoint", () => {
    expect(liquid).toContain("data-csrf-token");
    expect(liquid).toContain("/api/customer-portal/learning-profile");
    expect(integration).toContain("mmg_customer_portal_csrf_token");
    expect(javascript).toContain('"X-MMG-CSRF-Token": csrfToken');
    expect(javascript).toContain('credentials: "same-origin"');
    expect(javascript).toContain('method: "GET"');
    expect(javascript).toContain('method: "PUT"');
  });

  it("uses safe DOM rendering without exposing internal identity", () => {
    expect(javascript).not.toContain("innerHTML");
    expect(javascript).toContain("textContent");
    expect(javascript).not.toContain("customerId");
    expect(liquid).not.toContain("customer.id");
    expect(liquid).not.toContain("recommendation_score");
    expect(contract.learning_profile_contract.customer_id_returned_to_browser).toBe(
      false,
    );
  });

  it("preserves scoped responsive and reduced-motion behavior", () => {
    expect(stylesheet).not.toContain("100vw");
    expect(stylesheet).not.toContain("#MainContent");
    expect(stylesheet).not.toMatch(/(^|\s)(html|body)\s*\{/m);
    expect(stylesheet).toContain("@media (max-width: 620px)");
    expect(stylesheet).toContain("prefers-reduced-motion");
    expect(stylesheet).toContain(":focus-visible");
  });

  it("captures the canonical onboarding fields", () => {
    for (const field of [
      "roleCode",
      "primaryGoal",
      "experienceLevel",
      "primaryTopics",
      "secondaryTopics",
      "preferredFormats",
      "excludedTopics",
    ]) {
      expect(`${liquid}\n${javascript}`).toContain(field);
    }
    expect(liquid).toContain("Secondary interests");
    expect(liquid).toContain("Topics to exclude");
  });
});