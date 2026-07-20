import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PickerContract = {
  contract_id: string;
  version: string;
  status: string;
  canonical_route: string;
  dependencies: Record<string, string>;
  first_package_contract: {
    headline: string;
    target_asset_count: number;
    total_units: number;
    selection_occurs_after_checkout: boolean;
    customer_selects_titles: boolean;
  };
  command_contract: {
    endpoint: string;
    read_method: string;
    mutation_method: string;
    actions: string[];
    optimistic_concurrency_field: string;
    idempotency_field: string;
    credentials_mode: string;
  };
  security_contract: {
    customer_identity_source: string;
    subscription_identity_source: string;
    window_identity_source: string;
    forbidden_client_identity_fields: string[];
    mutation_controls: string[];
  };
  selection_rules: string[];
  filter_contract: {
    client_side_display_filters: string[];
    authority_rule: string;
  };
  storefront_implementation: {
    liquid_snippet: string;
    javascript_asset: string;
    stylesheet_asset: string;
    page_integration: string;
    provisional_metadata_source: string;
    progressive_enhancement: string;
  };
  event_contract: Array<{
    name: string;
    detail_fields: string[];
  }>;
  accessibility_contract: Record<string, boolean>;
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
  read("registry/knowledge-library/mmg-knowledge-library-picker-contract-v1.json"),
) as PickerContract;
const liquid = read("shopify/snippets/mmg-knowledge-library-picker.liquid");
const runtime = read("shopify/assets/mmg-knowledge-library-picker.js");
const styles = read("shopify/assets/mmg-knowledge-library-picker.css");
const integration = read(
  "shopify/knowledge-library/mmg-knowledge-library-picker-integration.liquid",
);

describe("MMG Knowledge Library picker contract", () => {
  it("is the approved staged picker for the canonical Knowledge Library route", () => {
    expect(contract.contract_id).toBe("mmg-knowledge-library-picker-v1");
    expect(contract.version).toBe("1.1.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.canonical_route).toBe("/pages/knowledge-library");
    expect(contract.dependencies.entitlement_ownership_persistence).toBe(
      "registry/knowledge-library/mmg-entitlement-ownership-persistence-contract-v1.json",
    );
    expect(contract.storefront_implementation).toEqual({
      liquid_snippet: "shopify/snippets/mmg-knowledge-library-picker.liquid",
      javascript_asset: "shopify/assets/mmg-knowledge-library-picker.js",
      stylesheet_asset: "shopify/assets/mmg-knowledge-library-picker.css",
      page_integration:
        "shopify/knowledge-library/mmg-knowledge-library-picker-integration.liquid",
      provisional_metadata_source:
        "shopify/snippets/mmg-knowledge-library-product-data.liquid",
      progressive_enhancement:
        "Interactive subscription selection requires JavaScript and the authenticated Kairos endpoint. Public catalog links remain available without JavaScript.",
    });
  });

  it("locks first-package selection to two titles after checkout", () => {
    expect(contract.first_package_contract).toEqual({
      headline: "Choose Your First Two Titles",
      target_asset_count: 2,
      total_units: 2,
      selection_occurs_after_checkout: true,
      customer_selects_titles: true,
    });
    expect(liquid).toContain("Choose Your First Two Titles");
    expect(liquid).toContain("Confirm My Two Titles");
  });

  it("defines GET snapshot and POST mutation behavior with concurrency and idempotency", () => {
    expect(contract.command_contract.endpoint).toBe(
      "/api/knowledge-library/picker",
    );
    expect(contract.command_contract.read_method).toBe("GET");
    expect(contract.command_contract.mutation_method).toBe("POST");
    expect(contract.command_contract.actions).toEqual([
      "select",
      "remove",
      "confirm",
    ]);
    expect(contract.command_contract.optimistic_concurrency_field).toBe(
      "expectedWindowVersion",
    );
    expect(contract.command_contract.idempotency_field).toBe("requestId");
    expect(contract.command_contract.credentials_mode).toBe("same-origin");

    expect(runtime).toContain('method: "GET"');
    expect(runtime).toContain('method: "POST"');
    expect(runtime).toContain("expectedWindowVersion");
    expect(runtime).toContain("requestId: randomRequestId()");
    expect(runtime).toContain('credentials: "same-origin"');
  });

  it("never accepts customer, subscription, or window identity from the browser", () => {
    expect(contract.security_contract.customer_identity_source).toBe(
      "authenticated server session",
    );
    expect(contract.security_contract.subscription_identity_source).toBe(
      "Kairos server lookup",
    );
    expect(contract.security_contract.window_identity_source).toBe(
      "Kairos server lookup",
    );
    expect(contract.security_contract.forbidden_client_identity_fields).toEqual([
      "customerId",
      "customer_id",
      "subscriptionId",
      "subscription_id",
      "windowId",
      "window_id",
    ]);

    for (const field of contract.security_contract.forbidden_client_identity_fields) {
      expect(runtime).not.toContain(`${field}:`);
    }
    expect(runtime).toContain('"X-MMG-CSRF-Token"');
    expect(contract.security_contract.mutation_controls.join(" ")).toContain(
      "session-bound CSRF",
    );
  });

  it("locks ownership exclusion, capacity, deduplication, and confirmation rules", () => {
    const rules = contract.selection_rules.join(" ");
    expect(rules).toContain("Owned assets are excluded");
    expect(rules).toContain("Services and subscription products are excluded");
    expect(rules).toContain("Over-selection is prohibited");
    expect(rules).toContain("same asset may appear only once");
    expect(rules).toContain("exactly the target asset count");
    expect(rules).toContain("Confirmed selections are locked");
  });

  it("keeps browser filters presentational rather than authoritative", () => {
    expect(contract.filter_contract.client_side_display_filters).toEqual([
      "search",
      "topic",
      "experienceLevel",
      "format",
    ]);
    expect(contract.filter_contract.authority_rule).toContain(
      "presentation only",
    );
    expect(liquid).toContain("data-mmg-picker-search");
    expect(liquid).toContain("data-mmg-picker-topic");
    expect(liquid).toContain("data-mmg-picker-level");
    expect(liquid).toContain("data-mmg-picker-format");
  });

  it("emits stable picker integration events", () => {
    expect(contract.event_contract.map((event) => event.name)).toEqual([
      "mmg:knowledge-library-picker-ready",
      "mmg:knowledge-library-selection-updated",
      "mmg:knowledge-library-package-confirmed",
      "mmg:knowledge-library-picker-error",
    ]);

    for (const event of contract.event_contract) {
      expect(runtime).toContain(event.name);
    }
  });

  it("preserves accessibility, responsive behavior, and safe DOM rendering", () => {
    expect(contract.accessibility_contract).toEqual({
      live_status_region: true,
      semantic_filter_controls: true,
      keyboard_operable_cards: true,
      visible_focus: true,
      selection_state_text_not_color_only: true,
      disabled_reason_text: true,
      confirm_summary: true,
      reduced_motion_support: true,
      mobile_single_column_support: true,
    });

    expect(liquid).toContain('role="status"');
    expect(liquid).toContain('aria-live="polite"');
    expect(liquid).toContain('role="search"');
    expect(liquid).toContain("<noscript>");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (max-width: 640px)");
    expect(runtime).toContain("textContent");
    expect(runtime).not.toContain("insertAdjacentHTML");
    expect(runtime).not.toContain("document.write");
  });

  it("is Shopify-safe and does not introduce page-shell breakout rules", () => {
    for (const source of [liquid, runtime, styles, integration]) {
      expect(source).not.toContain("100vw");
      expect(source).not.toContain("#MainContent");
      expect(source).not.toContain("document.body.style");
    }
    expect(integration).toContain("collections['frontpage']");
    expect(integration).toContain("mmg-knowledge-library-picker");
  });

  it("keeps live release blocked while advancing to the Delivery Window Controller", () => {
    expect(contract.release_gates).toEqual(
      expect.arrayContaining([
        "The secure HTTP handler is connected to the deployed authenticated API adapter.",
        "The PostgreSQL entitlement and ownership migration is applied.",
        "The entitlement-window repository supports atomic versioned writes.",
        "Confirmation creates delivery grants and ownership grants transactionally and idempotently.",
        "At least two verified subscription-selectable digital assets exist.",
      ]),
    );
    expect(contract.integration_sequence).toEqual({
      previous_component:
        "MMG Knowledge Library eligibility metadata and selection-mode contract",
      current_component: "MMG Knowledge Library Picker",
      completed_dependency:
        "MMG Entitlement Counter and Ownership-Resolution Persistence",
      next_component: "MMG Delivery Window Controller",
      subsequent_components: [
        "Customer Portal subscription dashboard",
        "Thank-you page first-title handoff",
        "Kairos recommendation ranking",
      ],
    });
  });
});
