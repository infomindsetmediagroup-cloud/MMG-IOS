# MMG Cart Subscription Controller v1.0

**Status:** Approved for staging  
**Liquid:** `shopify/snippets/mmg-cart-subscription-controller.liquid`  
**Runtime:** `shopify/assets/mmg-cart-subscription-controller.js`  
**Styles:** `shopify/assets/mmg-cart-subscription-controller.css`  
**Contract:** `shopify/snippets/mmg-cart-subscription-controller.contract.json`

## Purpose

The MMG Cart Subscription Controller is the canonical optional cart offer for MMG Knowledge Subscription™. It connects the reusable Three-Plan Selector to the Shopify cart without silently enrolling the customer or allowing multiple persistent MMG subscription lines.

The component is designed for two placements:

1. Cart drawer, after the cart items and before the primary checkout controls.
2. Full cart page, after the cart items and before the order summary or checkout controls.

## Locked Customer Flow

### No subscription in cart

1. Show an optional **Build Your Knowledge Library** invitation.
2. Do not open the selector automatically.
3. Do not select a plan automatically.
4. Customer explicitly opens the plan selector.
5. Customer selects Monthly, Bi-weekly, or Weekly.
6. Customer explicitly confirms recurring monthly billing.
7. Controller adds the selected variant with its required selling plan.
8. Cart sections, totals, and recurring disclosures refresh.

### Subscription already in cart

1. Show the current cadence, recurring price, selling-plan name, and entitlement.
2. Offer **Change Plan** and **Remove Membership** actions.
3. A plan change adds the selected replacement line first, then removes every prior MMG subscription line in one cart update.
4. If prior-line removal fails, the controller attempts to roll back the replacement line.
5. The controller verifies that exactly one selected subscription line remains.

### Multiple subscription lines detected

The component warns the customer. It does not silently alter the cart. When the customer explicitly selects and confirms a plan, the replacement workflow consolidates all prior MMG subscription lines into one selected line.

## Shopify Ajax Cart API Use

The controller uses locale-aware URLs derived from `window.Shopify.routes.root`.

| Operation | Endpoint | Purpose |
|---|---|---|
| Read cart | `cart.js` | Detect current MMG subscription lines and verify final state. |
| Add plan | `cart/add.js` | Add the selected variant with `selling_plan`, quantity, and private MMG properties. |
| Consolidate/remove | `cart/update.js` | Remove one or more existing subscription lines by line-item key. |
| Rollback | `cart/change.js` | Remove a newly added replacement line when consolidation fails. |

The add request contains:

```json
{
  "items": [
    {
      "id": "<variant-id>",
      "quantity": 1,
      "selling_plan": "<selling-plan-id>",
      "properties": {
        "_mmg_subscription_plan_code": "weekly",
        "_mmg_recurring_consent": "confirmed",
        "_mmg_cart_offer_context": "cart-drawer"
      }
    }
  ]
}
```

All underscore-prefixed MMG properties are private operational metadata. Theme line-item property loops must continue to suppress properties beginning with `_`.

## Bundled Section Rendering

The controller can request up to five section IDs in each final cart mutation. Default coverage is:

- `cart-drawer`
- `cart-icon-bubble`
- `main-cart-items`
- `main-cart-footer`
- `cart-live-region-text`

The exact section list should be narrowed for each placement. Returned section wrappers are replaced in place when matching live wrappers exist.

The controller also emits the following compatibility events after a successful final mutation:

- `mmg:cart-subscription-updated`
- `cart:updated`
- `cart:refresh`

## Cart Drawer Integration

Use the assembly in:

`shopify/cart/mmg-cart-drawer-subscription-integration.liquid`

Canonical render:

```liquid
{% render 'mmg-cart-subscription-controller',
  mmg_cart_context: 'cart-drawer',
  mmg_cart_instance_id: 'mmg-cart-drawer-membership',
  mmg_cart_sections: 'cart-drawer,cart-icon-bubble,cart-live-region-text',
  mmg_cart_sections_url: request.path
%}
```

Place it inside the cart drawer section after line items and before the primary checkout button. Do not place it inside a repeated cart-line loop.

## Full Cart Integration

Use the assembly in:

`shopify/cart/mmg-cart-page-subscription-integration.liquid`

Canonical render:

```liquid
{% render 'mmg-cart-subscription-controller',
  mmg_cart_context: 'cart-page',
  mmg_cart_instance_id: 'mmg-full-cart-membership',
  mmg_cart_sections: 'main-cart-items,main-cart-footer,cart-icon-bubble,cart-live-region-text',
  mmg_cart_sections_url: '/cart'
%}
```

Place it after cart items and before the checkout/order-summary controls.

## Explicit Removal

The first remove action only reveals an inline confirmation panel. The controller does not mutate the cart until the customer presses **Confirm Removal**.

The notice distinguishes cart removal from cancellation of an existing subscription contract created by a prior completed order.

## Progressive Enhancement

With JavaScript enabled, the component provides duplicate prevention, replacement, rollback, bundled section rendering, local state updates, and compatibility events.

Without JavaScript:

- A customer with no current subscription can open the native `<details>` selector and submit the Shopify product form.
- A customer with an existing subscription must use the theme cart-line removal control before selecting a different plan. The JavaScript replacement path is required to change variants without leaving duplicate subscription lines.

## Staging Requirements

Before theme publication:

1. Provision the canonical subscription product and verified selling-plan allocations.
2. Copy the Liquid snippet and both assets into the active theme.
3. Insert the drawer and full-cart assemblies at the approved positions.
4. Confirm the active theme section IDs.
5. Confirm private line-item properties are hidden.
6. Run the QA contract.
7. Complete checkout and subscription-contract verification.
8. Confirm the post-purchase Knowledge Library handoff for the first two titles.
