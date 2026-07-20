# MMG Thank-You First-Title Handoff — QA Contract

**Component:** `extensions/mmg-thank-you-first-title-handoff`  
**Endpoint:** `POST /api/checkout/thank-you/subscription-handoff`  
**Status:** Staging required before publication

## Provisioning Preconditions

- The canonical subscription product exists with verified Shopify runtime IDs.
- Monthly, Bi-weekly, and Weekly variants use the shared monthly selling plan.
- Cart subscription lines include `_mmg_subscription_plan_code` and `_mmg_recurring_consent` private properties.
- The checkout UI extension is attached to the canonical Shopify app project.
- Shopify CLI has assigned the production extension UID.
- Network access has been approved for the checkout UI extension.
- The absolute HTTPS handoff endpoint is configured in the checkout and accounts editor.
- All entitlement, delivery-window, and thank-you handoff migrations are applied.
- Subscription webhook reconciliation can link the completed order to the durable entitlement.

## Subscription Checkout Tests

1. Monthly checkout displays the Monthly plan and directs to the first two-title workflow.
2. Bi-weekly checkout displays the Bi-weekly plan and directs to the same two-title first package.
3. Weekly checkout displays the Weekly plan and does not imply a fifth package in five-week months.
4. No title-selection control appears before payment completes.
5. The Thank you page extension is read-only and never attempts to mutate the completed order.
6. The extension obtains a fresh session token for each backend request.
7. The request includes only the verified Thank you order ID and checkout token.
8. The backend reloads the order through the Shopify Admin API adapter.
9. The order line must match the canonical subscription product, selling plan, and private plan marker.
10. A duplicate page refresh does not create a second order-link record.

## Non-Subscription Tests

- AI Image Mastery one-time purchase: no subscription handoff block.
- Professional Cover Design Service purchase: no subscription handoff block.
- Mixed cart without the canonical subscription: no subscription handoff block.
- Another app's subscription product: no MMG handoff block.
- A forged private line property on a noncanonical product: rejected by server-side product verification.

## Logged-In Customer Tests

- Signed session-token customer ID matches the order customer ID.
- Active linked entitlement with open untouched first window returns `ready`.
- Open first window with one selected title returns `selection_in_progress`.
- Scheduled or not-yet-created first window returns `activation_pending`.
- Recovery-required first window routes to Customer Service.
- Confirmed or delivery-ready first window routes to My Library and membership progress.
- Delivered first package routes to My Library.

## Guest Customer Tests

- A guest checkout can receive order-confirmation messaging.
- Private entitlement, ownership, and selection details are not disclosed.
- The primary action is Customer Portal authentication.
- The customer must authenticate using the checkout email before entering the private picker.
- A later authenticated portal visit resolves the linked entitlement correctly.

## Delayed Reconciliation Tests

- Thank you extension loads before Shopify order creation is complete.
- `ORDER_NOT_FOUND` is treated as retryable and does not imply payment failure.
- Retrying after order creation succeeds.
- A verified order-link record remains `pending` until webhook reconciliation links an entitlement.
- The endpoint never guesses an entitlement from another active or historical subscription.
- Once linked, the same order resolves the first package without creating another link.

## Security Tests

- Missing `Authorization` header returns `401`.
- Invalid, expired, wrong-audience, wrong-shop, or replayed session tokens are rejected by the runtime adapter.
- Browser-supplied customer IDs, plan codes, product IDs, entitlement IDs, and ownership totals are ignored.
- Shop-domain mismatch returns `409`.
- Order-ID mismatch returns `409`.
- Checkout-token mismatch returns `409`.
- Signed-in customer/order customer mismatch returns `409`.
- Raw checkout tokens are not stored.
- Database stores only a 64-character lowercase SHA-256 token hash.
- Provider contract IDs, entitlement IDs, grant IDs, customer IDs, and delivery-package references are absent from responses.
- Responses use `Cache-Control: no-store, private`.
- CORS preflight succeeds with `Access-Control-Allow-Origin: *` and bearer-token authorization remains mandatory.
- Request bodies above 4096 bytes are rejected.

## Accessibility and UX Tests

- The block inherits Shopify checkout branding.
- Heading hierarchy is valid in every placement.
- Loading state includes an accessible spinner label.
- Warning, recovery, and completed states use appropriate semantic banners.
- Primary and secondary actions remain keyboard accessible.
- Link labels describe the destination and required action.
- Internal IDs, registry terms, and production terminology never appear.
- The block renders correctly at ORDER_STATUS1, ORDER_STATUS2, and ORDER_STATUS3 preview placements.
- The block does not crowd the order confirmation or misrepresent the order as incomplete.

## Resilience Tests

- Missing endpoint setting uses the safe Customer Portal fallback only when an MMG subscription marker is visible.
- Network failure keeps the order-confirmation message intact and provides Customer Portal access.
- Invalid JSON response produces the safe error state.
- Repeated retries are idempotent.
- Refreshing the Thank you page after first-package confirmation returns the completed state.

## Publication Gate

Do not publish until the extension is deployed through the canonical Shopify app, network access is approved, runtime authentication and Admin API order verification are active, all migrations are applied, webhook reconciliation links the order to the entitlement, the Customer Portal and Knowledge Library Picker are authenticated and operational, and every test above passes on desktop and mobile.
