# MMG Three-Plan Selector v1.0

**Status:** Approved for staging  
**Source:** `shopify/snippets/mmg-three-plan-selector.liquid`  
**Contract:** `shopify/snippets/mmg-three-plan-selector.contract.json`

## Purpose

The MMG Three-Plan Selector is the canonical reusable interface for choosing the Monthly, Bi-weekly, or Weekly MMG Knowledge Subscription™ cadence.

It is designed to be rendered on:

- The subscription product page.
- The Membership landing page.
- The cart subscription-offer flow.
- A future Customer Portal plan-change surface.

The selector owns plan presentation, explicit plan selection, recurring-consent confirmation, native Shopify product-form submission, selection-state communication, and integration events. The separate MMG Cart Subscription Controller owns AJAX cart insertion, duplicate-line prevention, plan replacement, and cart refresh behavior.

## Locked Plans

| Plan | Price | Packages per monthly billing cycle | Assets per package | Assets per billing cycle |
|---|---:|---:|---:|---:|
| Monthly | $14.95 | 1 | 2 | 2 |
| Bi-weekly | $24.95 | 2 | 2 | 4 |
| Weekly | $39.95 | 4 | 2 | 8 |

All three plans bill monthly. Kairos controls the delivery schedule within the billing cycle.

## Canonical Render

On the subscription product template:

```liquid
{% render 'mmg-three-plan-selector',
  mmg_selector_product: product,
  mmg_selector_context: 'subscription-product',
  mmg_selector_heading: 'Choose your membership plan',
  mmg_selector_intro: 'Build your Knowledge Library with recurring digital assets selected for your goals.'
%}
```

On the Membership landing page:

```liquid
{% assign mmg_subscription_product = all_products['mmg-knowledge-subscription'] %}

{% render 'mmg-three-plan-selector',
  mmg_selector_product: mmg_subscription_product,
  mmg_selector_context: 'membership-landing',
  mmg_selector_heading: 'Choose the rhythm that fits your growth',
  mmg_selector_intro: 'Select 2, 4, or 8 digital assets per monthly billing cycle.'
%}
```

## Submission Contract

The selector uses a native Shopify product form.

- Variant radio inputs use `name="id"`.
- The selling plan input uses `name="selling_plan"`.
- Quantity is fixed at `1`.
- No plan is selected by default.
- The recurring-consent checkbox is unchecked and required.
- JavaScript does not replace the native form action.
- Without JavaScript, browser validation still requires plan selection and recurring consent.

## Event Contract

### `mmg:subscription-plan-selected`

Emitted from the selector root whenever the customer selects a plan.

```js
document.addEventListener('mmg:subscription-plan-selected', (event) => {
  const {
    context,
    productHandle,
    planCode,
    planName,
    variantId,
    sellingPlanId,
    price,
    priceCents,
    assetsPerBillingCycle,
    packagesPerBillingCycle
  } = event.detail;
});
```

The MMG Cart Subscription Controller will consume this event in the next build.

### `mmg:subscription-selector-error`

Emitted when the selected variant does not have a valid selling-plan ID at submit time.

## UX and Accessibility Rules

- Present all three plans as one semantic radio group.
- Do not preselect a plan.
- Keep recurring consent explicit and unchecked.
- Use a visible selected-plan summary.
- Preserve keyboard navigation and visible focus.
- Keep all controls operable without pointer input.
- Preserve reduced-motion behavior.
- Stack plans vertically below 880 px.
- Do not use viewport breakout rules, negative-margin wrappers, or page-level theme overrides.

## Failure State

When the subscription product or selling-plan allocation is unavailable, the selector renders a customer-safe status rather than a broken purchase form.

This state is expected before Shopify provisioning is complete and must block publication.

## Release Sequence

1. Provision the subscription product, variants, metafields, selling-plan group, and selling plan.
2. Record verified Shopify runtime GIDs in the product contract.
3. Render and QA the selector on the draft subscription product.
4. Render and QA the selector on the Membership landing page.
5. Build the MMG Cart Subscription Controller.
6. Complete cart, checkout, entitlement, Knowledge Library, and Customer Portal end-to-end QA.
