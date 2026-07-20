# MMG Thank-You Page First-Title Handoff v1.0

**Status:** Approved for staging  
**Commerce authority:** `registry/products/mmg-commerce-contract-v1.json`  
**Component authority:** `registry/checkout/mmg-thank-you-first-title-handoff-contract-v1.json`

## Purpose

The MMG Thank-You Page First-Title Handoff detects a completed purchase of **MMG Knowledge Subscription™** and gives the buyer the correct next action without asking them to select digital titles during checkout.

The Thank you page is an order-confirmation surface. The order is complete and the extension is read-only. Shopify remains the authority for checkout, payment, the completed order, and recurring billing. Kairos remains the authority for subscription reconciliation, entitlement creation, first-package state, title selection, ownership, and delivery.

## Canonical Flow

```text
Subscription checkout completed
→ Thank you extension obtains order ID + checkout token
→ Extension obtains a fresh Shopify session token
→ POST /api/checkout/thank-you/subscription-handoff
→ Kairos verifies the session token and order server-side
→ Kairos confirms the canonical subscription line
→ Kairos records an idempotent order-link record
→ Shopify webhook reconciliation links the order to the entitlement
→ Kairos resolves the first-package state
→ Buyer receives the correct Customer Portal, Knowledge Library, recovery, or My Library action
```

## Shopify Extension

The extension lives at:

```text
extensions/mmg-thank-you-first-title-handoff/
```

Target:

```text
purchase.thank-you.block.render
```

Recommended placement:

```text
ORDER_STATUS1
```

The extension requires `network_access = true` because it requests private order and entitlement state from Kairos. It uses Shopify's session-token API for backend authentication and sends only:

```json
{
  "orderId": "gid://shopify/Order/...",
  "checkoutToken": "..."
}
```

The checkout token is verified against the Shopify order and persisted only as a SHA-256 hash.

## Handoff States

| State | Customer behavior |
|---|---|
| `not_applicable` | Render nothing because the order does not include the canonical subscription. |
| `sign_in_required` | Direct a guest buyer to the Customer Portal to authenticate with the checkout email. |
| `activation_pending` | Confirm that checkout succeeded while subscription reconciliation or first-window creation finishes. |
| `ready` | Direct the subscriber to **Choose Your First Two Titles**. |
| `selection_in_progress` | Return the subscriber to the open two-title package. |
| `recovery_required` | Direct the subscriber into the governed Customer Service recovery path. |
| `completed` | Direct the subscriber to My Library or membership progress. |

## Subscription Detection

The browser does not decide whether the order is a subscription order. Kairos loads the order through a trusted Shopify Admin API adapter and requires all of the following:

1. The order line matches the canonical subscription product ID or handle.
2. The line has a Shopify selling-plan allocation.
3. The private line property `_mmg_subscription_plan_code` is `monthly`, `biweekly`, or `weekly`.

The line property is a corroborating marker, not a substitute for server-side order verification.

## Guest Buyer Boundary

The Thank you page can be displayed to a guest buyer. A signed Shopify checkout session token proves the shop and checkout-extension context, but it does not always include a customer identity.

Therefore:

- The extension can confirm that the membership order was received.
- The extension must not disclose private entitlement or ownership state to an unauthenticated guest.
- The guest is directed to the Customer Portal to authenticate with the same email used at checkout.
- The first-title picker remains an authenticated customer workflow.

## Order-Link Persistence

Migration:

```text
database/migrations/20260720_003_mmg_thank_you_first_title_handoff.sql
```

Tables:

```text
mmg_subscription_order_links
mmg_thank_you_handoff_events
```

The order-link record is keyed by:

```text
shop_domain + order_id
```

The initial link status is `pending`. The Shopify subscription webhook reconciliation layer later assigns the durable entitlement ID and changes the link to `linked`. The Thank you endpoint must not guess an entitlement from an unrelated historical subscription.

## Endpoint

```text
POST /api/checkout/thank-you/subscription-handoff
```

Required headers:

```text
Authorization: Bearer <Shopify checkout extension session token>
Content-Type: application/json
```

The endpoint also supports `OPTIONS` for CORS preflight.

Responses are private and non-cacheable. The endpoint returns customer-safe state only and excludes customer IDs, provider contract IDs, entitlement IDs, delivery-package references, ownership-grant IDs, raw checkout tokens, and audit payloads.

## Failure Handling

- Delayed Shopify order availability returns a retryable order-not-found state.
- Missing or invalid session tokens return `401`.
- Order, shop, checkout-token, or customer mismatches return `409`.
- Non-subscription orders return `not_applicable` and no visible block.
- Missing endpoint configuration falls back to a Customer Portal handoff only when the extension can see the MMG private cart marker.
- Network errors never imply that checkout failed; the buyer is told that the order is complete and given the Customer Portal route.

## Deployment Sequence

1. Connect the extension to the canonical Shopify app project.
2. Generate the production extension UID with Shopify CLI.
3. Approve checkout-extension network access.
4. Deploy the Kairos endpoint and Shopify order gateway.
5. Apply all three commerce database migrations.
6. Connect subscription webhook reconciliation to the order-link table.
7. Configure the handoff endpoint and fallback routes in the checkout and accounts editor.
8. Add the block to the Thank you page.
9. Test subscription, non-subscription, logged-in, guest, delayed-order, retry, recovery, and completed-package paths.
10. Publish only after the complete flow reaches the Knowledge Library Picker and My Library successfully.

## Next Dependency

**MMG My Library Delivery Interface**

That component will present one customer-facing record per canonical asset ID, activate read/download controls from ownership grants, expose delivery status, and complete the path from first-package confirmation into durable customer access.
