import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Plan = {
  plan_code: string;
  variant_title: string;
  price: string;
  billing_interval: string;
  assets_per_package: number;
  packages_per_billing_cycle: number;
  assets_per_billing_cycle: number;
  color_identity: string;
};

type SelectorContract = {
  component_id: string;
  version: string;
  status: string;
  source: string;
  product_handle: string;
  supported_contexts: string[];
  plans: Plan[];
  selection_contract: {
    default_plan_selected: boolean;
    explicit_plan_selection_required: boolean;
    explicit_recurring_consent_required: boolean;
    one_time_purchase_available: boolean;
    selling_plan_input_name: string;
    variant_input_name: string;
    natural_product_form_submission: boolean;
    ajax_cart_addition_owned_by: string;
  };
  event_contract: Array<{
    name: string;
    bubbles: boolean;
    detail_fields: string[];
  }>;
  accessibility_contract: {
    semantic_group: string;
    selection_control: string;
    recurring_consent_control: string;
    keyboard_support: boolean;
    focus_visible_support: boolean;
    live_selection_summary: boolean;
    reduced_motion_support: boolean;
  };
  progressive_enhancement: {
    without_javascript: string;
    with_javascript: string;
    missing_product_or_selling_plan: string;
  };
  integration_sequence: {
    current_component: string;
    next_component: string;
  };
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const contractPath = resolve(
  repositoryRoot,
  "shopify/snippets/mmg-three-plan-selector.contract.json",
);
const sourcePath = resolve(
  repositoryRoot,
  "shopify/snippets/mmg-three-plan-selector.liquid",
);

const contract = JSON.parse(
  readFileSync(contractPath, "utf8"),
) as SelectorContract;
const source = readFileSync(sourcePath, "utf8");

describe("MMG Three-Plan Selector", () => {
  it("is the approved staged selector for the canonical subscription product", () => {
    expect(contract.component_id).toBe("mmg-three-plan-selector-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.source).toBe(
      "shopify/snippets/mmg-three-plan-selector.liquid",
    );
    expect(contract.product_handle).toBe("mmg-knowledge-subscription");
    expect(source).toContain(
      "all_products['mmg-knowledge-subscription']",
    );
  });

  it("locks the exact three plans, prices, packages, and asset entitlements", () => {
    expect(contract.plans).toEqual([
      {
        plan_code: "monthly",
        variant_title: "Monthly",
        price: "14.95",
        billing_interval: "MONTH",
        assets_per_package: 2,
        packages_per_billing_cycle: 1,
        assets_per_billing_cycle: 2,
        color_identity: "electric_blue",
      },
      {
        plan_code: "biweekly",
        variant_title: "Bi-weekly",
        price: "24.95",
        billing_interval: "MONTH",
        assets_per_package: 2,
        packages_per_billing_cycle: 2,
        assets_per_billing_cycle: 4,
        color_identity: "purple",
      },
      {
        plan_code: "weekly",
        variant_title: "Weekly",
        price: "39.95",
        billing_interval: "MONTH",
        assets_per_package: 2,
        packages_per_billing_cycle: 4,
        assets_per_billing_cycle: 8,
        color_identity: "gold",
      },
    ]);

    for (const plan of contract.plans) {
      expect(plan.assets_per_billing_cycle).toBe(
        plan.assets_per_package * plan.packages_per_billing_cycle,
      );
    }
  });

  it("requires explicit plan selection and recurring consent", () => {
    expect(contract.selection_contract.default_plan_selected).toBe(false);
    expect(contract.selection_contract.explicit_plan_selection_required).toBe(
      true,
    );
    expect(
      contract.selection_contract.explicit_recurring_consent_required,
    ).toBe(true);
    expect(contract.selection_contract.one_time_purchase_available).toBe(false);

    expect(source).toContain('type="radio"');
    expect(source).toContain('name="id"');
    expect(source).toContain('name="selling_plan"');
    expect(source).toContain("data-mmg-recurring-consent");
    expect(source).toContain("required");

    const preselectedRadio = /type="radio"[^>]*\schecked(?:\s|=|>)/i;
    const preselectedConsent =
      /data-mmg-recurring-consent[^>]*\schecked(?:\s|=|>)/i;

    expect(preselectedRadio.test(source)).toBe(false);
    expect(preselectedConsent.test(source)).toBe(false);
  });

  it("uses native product-form submission and reserves AJAX cart work for the next controller", () => {
    expect(contract.selection_contract.variant_input_name).toBe("id");
    expect(contract.selection_contract.selling_plan_input_name).toBe(
      "selling_plan",
    );
    expect(contract.selection_contract.natural_product_form_submission).toBe(
      true,
    );
    expect(contract.selection_contract.ajax_cart_addition_owned_by).toBe(
      "MMG Cart Subscription Controller",
    );
    expect(contract.integration_sequence.current_component).toBe(
      "MMG Three-Plan Selector",
    );
    expect(contract.integration_sequence.next_component).toBe(
      "MMG Cart Subscription Controller",
    );

    expect(source).toContain("{%- form 'product'");
    expect(source).not.toContain("/cart/add.js");
    expect(source).not.toContain("/cart/change.js");
  });

  it("emits the stable integration events required by downstream components", () => {
    const selectionEvent = contract.event_contract.find(
      (event) => event.name === "mmg:subscription-plan-selected",
    );
    const errorEvent = contract.event_contract.find(
      (event) => event.name === "mmg:subscription-selector-error",
    );

    expect(selectionEvent?.bubbles).toBe(true);
    expect(selectionEvent?.detail_fields).toEqual(
      expect.arrayContaining([
        "context",
        "productHandle",
        "planCode",
        "planName",
        "variantId",
        "sellingPlanId",
        "price",
        "priceCents",
        "assetsPerBillingCycle",
        "packagesPerBillingCycle",
      ]),
    );
    expect(errorEvent?.bubbles).toBe(true);
    expect(source).toContain("mmg:subscription-plan-selected");
    expect(source).toContain("mmg:subscription-selector-error");
  });

  it("preserves accessibility and progressive enhancement", () => {
    expect(contract.accessibility_contract).toEqual({
      semantic_group: "fieldset_and_legend",
      selection_control: "required_radio_inputs",
      recurring_consent_control: "required_checkbox",
      keyboard_support: true,
      focus_visible_support: true,
      live_selection_summary: true,
      reduced_motion_support: true,
    });

    expect(source).toContain("<fieldset");
    expect(source).toContain("<legend");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain(":focus-visible");
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source).toContain("<noscript>");
    expect(contract.progressive_enhancement.without_javascript).toContain(
      "Native required radio and checkbox validation",
    );
  });

  it("is Shopify-safe and does not introduce page-breakout damage", () => {
    expect(source).not.toContain("100vw");
    expect(source).not.toMatch(/margin-(left|right):\s*-\d/);
    expect(source).not.toContain("document.body.style");
    expect(source).not.toContain("#MainContent");
    expect(source).not.toContain("window.location");
  });

  it("supports every approved selector placement", () => {
    expect(contract.supported_contexts).toEqual(
      expect.arrayContaining([
        "subscription_product_page",
        "membership_landing_page",
        "cart_subscription_offer",
        "customer_portal_plan_change",
      ]),
    );
  });
});
