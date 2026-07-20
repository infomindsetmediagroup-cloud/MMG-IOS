# MMG Cart Subscription Controller — QA Contract

**Version:** 1.0.0  
**Status:** Required before storefront publication

## Preconditions

- Product handle is exactly `mmg-knowledge-subscription`.
- Product ID rendered by Liquid matches the Ajax cart item `product_id`.
- Monthly, Bi-weekly, and Weekly variants exist with exact prices.
- Every variant has an available selling-plan allocation.
- The Three-Plan Selector dependency is present.
- Private line-item properties beginning with `_` are hidden by the cart drawer, cart page, cart notification, and order-summary property loops.
- Active theme section IDs have been confirmed for both cart surfaces.

## Offer-State Tests

1. With no subscription line, the optional offer is visible.
2. No plan is selected automatically.
3. Recurring consent is unchecked.
4. No cart request occurs on component load.
5. Opening the plan selector requires an explicit customer action.
6. Knowledge Library link resolves to `/pages/knowledge-library`.
7. The offer communicates 2, 4, or 8 assets and a starting price of $14.95/month.

## Add Tests

1. Select Monthly and confirm consent.
2. Verify `cart/add.js` receives the Monthly variant ID, quantity 1, and selling-plan ID.
3. Verify the cart contains exactly one subscription line.
4. Verify the line displays Monthly, $14.95/month, and the Shopify selling-plan name.
5. Repeat for Bi-weekly at $24.95/month.
6. Repeat for Weekly at $39.95/month.
7. Verify private properties record plan code, consent, and source context.
8. Verify requested cart sections refresh.
9. Verify the final cart fetch confirms one selected line.

## Same-Plan Tests

1. Add one plan.
2. Open the selector and select the same variant and selling plan.
3. Confirm no additional line is added.
4. Confirm quantity remains 1.
5. Confirm the customer receives an already-present success message.

## Replacement Tests

For each transition below, verify that the final cart contains exactly one subscription line with the new variant and correct selling plan:

- Monthly → Bi-weekly
- Monthly → Weekly
- Bi-weekly → Monthly
- Bi-weekly → Weekly
- Weekly → Monthly
- Weekly → Bi-weekly

For each transition:

1. Snapshot the existing line.
2. Add the replacement line with the private replacement token.
3. Remove all prior subscription keys through one `cart/update.js` request.
4. Verify the selected replacement variant remains.
5. Verify recurring price and selling-plan display update.
6. Verify cart count, subtotal, drawer, and full cart refresh.

## Duplicate-Consolidation Tests

1. Seed two MMG subscription lines in a test cart.
2. Verify the duplicate warning is visible.
3. Verify no automatic removal occurs.
4. Explicitly select and confirm one plan.
5. Verify all prior subscription lines are removed.
6. Verify exactly one selected subscription line remains.

## Rollback Tests

1. Simulate a failure while removing prior subscription lines after the replacement add succeeds.
2. Verify the controller attempts to remove the replacement line through `cart/change.js`.
3. Verify `mmg:cart-subscription-error` fires.
4. Simulate rollback failure and verify `mmg:cart-subscription-critical-error` fires with `REPLACEMENT_ROLLBACK_FAILED`.
5. Verify the error is surfaced in the live status region.

## Explicit Removal Tests

1. Press **Remove Membership**.
2. Verify the cart is unchanged and the inline confirmation appears.
3. Press **Keep Membership** and verify no mutation occurs.
4. Reopen confirmation and press **Confirm Removal**.
5. Verify all MMG subscription lines are removed in one update request.
6. Verify the offer state returns.
7. Verify the notice correctly distinguishes cart removal from canceling an existing subscription contract.

## Section Rendering Tests

- Cart drawer integration requests no more than five sections.
- Full cart integration requests no more than five sections.
- Every returned non-null section wrapper replaces the matching live wrapper once.
- Null or missing section responses do not break the cart mutation success path.
- No duplicate cart rerender occurs after compatibility events.
- Unsupported theme section IDs fail safely and local controller state still updates.

## Event Tests

Successful add, replace, and remove operations emit `mmg:cart-subscription-updated` with:

- `source`
- `context`
- `action`
- `cart`
- `selection`

Compatibility events also fire:

- `cart:updated`
- `cart:refresh`

Errors emit the documented MMG error events and codes.

## Accessibility Tests

- All actions are reachable by keyboard.
- Plan radios retain native arrow-key behavior.
- Visible focus is present on buttons, summary, radio cards, consent, and submit.
- Status changes announce through `role="status"` and `aria-live="polite"`.
- Remove confirmation receives focus when opened.
- Plan selector receives focus when opened.
- Reduced-motion mode suppresses nonessential movement.
- Text and controls remain readable at 200% zoom.

## Responsive Tests

Test at 320, 375, 390, 430, 768, 1024, and 1440 px.

- No horizontal overflow.
- No clipped price, plan title, disclosure, or button text.
- Actions stack cleanly on narrow mobile widths.
- The nested Three-Plan Selector remains one column below its breakpoint.
- No `100vw`, negative-margin breakout, global body mutation, or `#MainContent` override exists.

## No-JavaScript Tests

- With no current subscription, the native details selector opens and the Shopify product form can add one plan.
- With an existing subscription, the customer can use the theme cart-line removal control before selecting a different plan.
- No claim is made that duplicate-safe variant replacement works without JavaScript.

## Checkout Tests

- Product title, cadence variant, monthly recurring price, and selling-plan name appear in cart.
- Recurring terms remain visible before checkout.
- Checkout displays the selling-plan name.
- Completing checkout creates the expected Shopify subscription contract.
- Thank-you and Customer Portal flows point the customer to choose the first two Knowledge Library titles.
