# MMG Three-Plan Selector — QA Contract

**Component:** `shopify/snippets/mmg-three-plan-selector.liquid`  
**Version:** 1.0.0  
**Status:** Staging required before publication

## Data Preconditions

- Product handle is exactly `mmg-knowledge-subscription`.
- Product is subscription-only.
- Variant option is `Delivery cadence`.
- Variants are exactly Monthly, Bi-weekly, and Weekly.
- Prices are exactly $14.95, $24.95, and $39.95 per month.
- Every variant has an available selling-plan allocation.
- Runtime product, variant, selling-plan-group, and selling-plan IDs are recorded in the product contract after provisioning.

## Functional Tests

1. Initial state shows all three plans with no radio selected.
2. Initial recurring-consent checkbox is unchecked.
3. Submit control is unavailable until both a plan and recurring consent are selected.
4. Monthly selection displays 2 assets in 1 package per monthly billing cycle.
5. Bi-weekly selection displays 4 assets in 2 packages per monthly billing cycle.
6. Weekly selection displays 8 assets in 4 packages per monthly billing cycle.
7. Selecting a plan updates the hidden `selling_plan` value from that variant allocation.
8. Product-form submission includes `id`, `selling_plan`, `quantity=1`, and the private recurring-consent property.
9. The first post-purchase instruction points to the Knowledge Library for the first two titles.
10. A missing product or selling-plan allocation renders the safe unavailable state and no broken form.

## Accessibility Tests

- Tab reaches each plan radio in logical order.
- Arrow-key radio navigation works through native browser behavior.
- Visible focus appears on every selectable plan.
- The fieldset and legend expose one coherent plan-selection group.
- The selected-plan summary announces changes through `aria-live="polite"`.
- The consent checkbox has a complete visible label.
- The submit button receives a visible focus ring.
- Reduced-motion mode removes nonessential motion.
- The native required controls still prevent incomplete submission with JavaScript disabled.

## Responsive Tests

- Three columns at desktop widths above 880 px.
- One column at 880 px and below.
- No horizontal overflow at 320 px, 375 px, 390 px, 430 px, 768 px, 1024 px, and 1440 px.
- Prices, titles, disclosures, and calls to action do not clip or overlap.
- No `100vw`, negative-margin breakout, global body mutation, or `#MainContent` override is introduced.

## Integration Event Tests

Selecting a plan emits `mmg:subscription-plan-selected` with:

- `context`
- `productHandle`
- `planCode`
- `planName`
- `variantId`
- `sellingPlanId`
- `price`
- `priceCents`
- `assetsPerBillingCycle`
- `packagesPerBillingCycle`

Submitting without a valid selling-plan ID emits `mmg:subscription-selector-error` with `MISSING_SELLING_PLAN`.

## Publication Gate

Do not publish this component until the subscription product is provisioned, the three variant allocations resolve, recurring terms and cancellation language are approved, and the product page plus cart flow pass end-to-end Shopify checkout QA.
