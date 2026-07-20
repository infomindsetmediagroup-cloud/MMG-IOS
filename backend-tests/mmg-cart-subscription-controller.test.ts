import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ControllerContract = {
  component_id: string;
  version: string;
  status: string;
  product_handle: string;
  supported_surfaces: string[];
  consent_contract: {
    silent_insertion_allowed: boolean;
    preselected_plan_allowed: boolean;
    prechecked_recurring_consent_allowed: boolean;
    explicit_open_action_required: boolean;
    explicit_plan_selection_required: boolean;
    explicit_recurring_consent_required: boolean;
    explicit_remove_confirmation_required: boolean;
  };
  cart_api_contract: {
    transport: string;
    locale_aware_root: string;
    read_endpoint: string;
    add_endpoint: string;
    replace_removal_endpoint: string;
    single_line_rollback_endpoint: string;
    add_payload_fields: string[];
    private_properties: string[];
    bundled_section_rendering: boolean;
    maximum_requested_sections: number;
  };
  duplicate_prevention_contract: {
    identity_field: string;
    add_behavior_when_existing_line_found: string;
    replacement_sequence: string[];
    same_plan_behavior: string;
  };
  removal_contract: {
    first_action: string;
    confirmed_action: string;
  };
  section_refresh_contract: {
    default_sections: string[];
    fallback_events: string[];
  };
  event_contract: Array<{
    name: string;
    bubbles: boolean;
    actions?: string[];
    codes?: string[];
  }>;
  accessibility_contract: {
    live_status_region: boolean;
    keyboard_operable_controls: boolean;
    visible_focus: boolean;
    inline_remove_confirmation: boolean;
    reduced_motion_support: boolean;
    responsive_single_column_mobile: boolean;
    native_details_fallback: boolean;
  };
  integration_sequence: {
    current_component: string;
    previous_component: string;
    next_component: string;
  };
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");

const contract = JSON.parse(
  readFileSync(
    resolve(
      repositoryRoot,
      "shopify/snippets/mmg-cart-subscription-controller.contract.json",
    ),
    "utf8",
  ),
) as ControllerContract;

const liquid = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/snippets/mmg-cart-subscription-controller.liquid",
  ),
  "utf8",
);

const runtime = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/assets/mmg-cart-subscription-controller.js",
  ),
  "utf8",
);

const stylesheet = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/assets/mmg-cart-subscription-controller.css",
  ),
  "utf8",
);

const drawerIntegration = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/cart/mmg-cart-drawer-subscription-integration.liquid",
  ),
  "utf8",
);

const cartPageIntegration = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/cart/mmg-cart-page-subscription-integration.liquid",
  ),
  "utf8",
);

describe("MMG Cart Subscription Controller", () => {
  it("is the approved staged controller for the canonical subscription product", () => {
    expect(contract.component_id).toBe("mmg-cart-subscription-controller-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.product_handle).toBe("mmg-knowledge-subscription");
    expect(contract.supported_surfaces).toEqual([
      "cart_drawer",
      "full_cart_page",
    ]);

    expect(liquid).toContain(
      "all_products['mmg-knowledge-subscription']",
    );
    expect(liquid).toContain("<mmg-cart-subscription-controller");
    expect(runtime).toContain(
      "customElements.define(COMPONENT_TAG, MMGCartSubscriptionController)",
    );
  });

  it("forbids silent insertion, default plan selection, and prechecked consent", () => {
    expect(contract.consent_contract).toEqual({
      silent_insertion_allowed: false,
      preselected_plan_allowed: false,
      prechecked_recurring_consent_allowed: false,
      explicit_open_action_required: true,
      explicit_plan_selection_required: true,
      explicit_recurring_consent_required: true,
      explicit_remove_confirmation_required: true,
    });

    expect(liquid).toContain("data-mmg-open-plans");
    expect(liquid).toContain("data-mmg-request-remove");
    expect(liquid).toContain("data-mmg-confirm-remove");
    expect(runtime).not.toMatch(/connectedCallback\(\)[\s\S]{0,1200}addSubscription\(/);
  });

  it("uses locale-aware Shopify Ajax Cart API endpoints with selling plans", () => {
    expect(contract.cart_api_contract.transport).toBe(
      "Shopify Ajax Cart API",
    );
    expect(contract.cart_api_contract.locale_aware_root).toBe(
      "window.Shopify.routes.root",
    );
    expect(contract.cart_api_contract.read_endpoint).toBe("cart.js");
    expect(contract.cart_api_contract.add_endpoint).toBe("cart/add.js");
    expect(contract.cart_api_contract.replace_removal_endpoint).toBe(
      "cart/update.js",
    );
    expect(contract.cart_api_contract.single_line_rollback_endpoint).toBe(
      "cart/change.js",
    );

    expect(runtime).toContain("window.Shopify?.routes?.root");
    expect(runtime).toContain("cart.js");
    expect(runtime).toContain("cart/add.js");
    expect(runtime).toContain("cart/update.js");
    expect(runtime).toContain("cart/change.js");
    expect(runtime).toContain("selling_plan: selection.sellingPlanId");
    expect(runtime).toContain("quantity: 1");
  });

  it("records only private MMG operational line properties", () => {
    expect(contract.cart_api_contract.private_properties).toEqual([
      "_mmg_subscription_plan_code",
      "_mmg_recurring_consent",
      "_mmg_cart_offer_context",
      "_mmg_replacement_token",
    ]);

    for (const property of contract.cart_api_contract.private_properties) {
      expect(property.startsWith("_")).toBe(true);
      expect(runtime).toContain(property);
    }
  });

  it("detects existing subscriptions by product ID and prevents persistent duplicates", () => {
    expect(contract.duplicate_prevention_contract.identity_field).toContain(
      "product_id",
    );
    expect(
      contract.duplicate_prevention_contract.add_behavior_when_existing_line_found,
    ).toContain("replacement path");
    expect(contract.duplicate_prevention_contract.replacement_sequence).toHaveLength(
      5,
    );

    expect(runtime).toContain(
      ".filter((item) => Number(item.product_id) === this.productId)",
    );
    expect(runtime).toContain("if (existingLines.length === 0)");
    expect(runtime).toContain("await this.replaceSubscription(existingLines, selection)");
    expect(runtime).toContain("if (line.key) updates[line.key] = 0");
    expect(runtime).toContain("rollbackReplacement(replacementToken)");
    expect(runtime).toContain("verifiedLines.length !== 1");
  });

  it("performs a no-op when the exact selected plan is already present", () => {
    expect(contract.duplicate_prevention_contract.same_plan_behavior).toContain(
      "perform no mutation",
    );
    expect(runtime).toContain("existingLines.length === 1");
    expect(runtime).toContain(
      "Number(currentLine.variant_id) === selection.variantId",
    );
    expect(runtime).toContain(
      "currentSellingPlanId === selection.sellingPlanId",
    );
    expect(runtime).toContain("is already in your cart");
  });

  it("requires inline confirmation before removing subscription lines", () => {
    expect(contract.removal_contract.first_action).toContain(
      "inline confirmation",
    );
    expect(contract.removal_contract.confirmed_action).toContain(
      "cart/update.js",
    );

    expect(liquid).toContain("data-mmg-remove-confirmation");
    expect(liquid).toContain("data-mmg-confirm-remove");
    expect(liquid).toContain("data-mmg-cancel-remove");
    expect(runtime).toContain("showRemoveConfirmation()");
    expect(runtime).toContain("removeSubscription()");
  });

  it("uses bundled section rendering without exceeding Shopify's five-section limit", () => {
    expect(contract.cart_api_contract.bundled_section_rendering).toBe(true);
    expect(contract.cart_api_contract.maximum_requested_sections).toBe(5);
    expect(contract.section_refresh_contract.default_sections).toHaveLength(5);
    expect(runtime).toContain(".slice(0, 5)");
    expect(runtime).toContain("payload.sections = this.sections");
    expect(runtime).toContain("payload.sections_url");
    expect(runtime).toContain("applyRenderedSections(result.sections)");

    const drawerSections = drawerIntegration
      .match(/mmg_cart_sections:\s*'([^']+)'/)?.[1]
      ?.split(",")
      .filter(Boolean);
    const pageSections = cartPageIntegration
      .match(/mmg_cart_sections:\s*'([^']+)'/)?.[1]
      ?.split(",")
      .filter(Boolean);

    expect(drawerSections?.length).toBeLessThanOrEqual(5);
    expect(pageSections?.length).toBeLessThanOrEqual(5);
  });

  it("emits stable MMG and cart compatibility events", () => {
    const updateEvent = contract.event_contract.find(
      (event) => event.name === "mmg:cart-subscription-updated",
    );
    const errorEvent = contract.event_contract.find(
      (event) => event.name === "mmg:cart-subscription-error",
    );
    const criticalEvent = contract.event_contract.find(
      (event) => event.name === "mmg:cart-subscription-critical-error",
    );

    expect(updateEvent?.actions).toEqual(["add", "replace", "remove"]);
    expect(errorEvent?.codes).toEqual(
      expect.arrayContaining([
        "MISSING_VARIANT_OR_SELLING_PLAN",
        "CART_MUTATION_FAILED",
      ]),
    );
    expect(criticalEvent?.codes).toContain("REPLACEMENT_ROLLBACK_FAILED");

    expect(runtime).toContain("mmg:cart-subscription-updated");
    expect(runtime).toContain("mmg:cart-subscription-error");
    expect(runtime).toContain("mmg:cart-subscription-critical-error");
    expect(runtime).toContain("cart:updated");
    expect(runtime).toContain("cart:refresh");
  });

  it("preserves accessibility, responsive behavior, and Shopify-safe scoping", () => {
    expect(contract.accessibility_contract).toEqual({
      live_status_region: true,
      keyboard_operable_controls: true,
      visible_focus: true,
      inline_remove_confirmation: true,
      reduced_motion_support: true,
      responsive_single_column_mobile: true,
      native_details_fallback: true,
    });

    expect(liquid).toContain('role="status"');
    expect(liquid).toContain('aria-live="polite"');
    expect(liquid).toContain("<details");
    expect(liquid).toContain("<summary>");
    expect(stylesheet).toContain(":focus-visible");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain("@media (max-width: 620px)");

    for (const source of [liquid, runtime, stylesheet]) {
      expect(source).not.toContain("100vw");
      expect(source).not.toContain("#MainContent");
      expect(source).not.toContain("document.body.style");
    }
  });

  it("connects the build sequence to Knowledge Library eligibility metadata", () => {
    expect(contract.integration_sequence.previous_component).toBe(
      "MMG Three-Plan Selector",
    );
    expect(contract.integration_sequence.current_component).toBe(
      "MMG Cart Subscription Controller",
    );
    expect(contract.integration_sequence.next_component).toBe(
      "MMG Knowledge Library eligibility metadata and selection-mode contract",
    );
  });
});
