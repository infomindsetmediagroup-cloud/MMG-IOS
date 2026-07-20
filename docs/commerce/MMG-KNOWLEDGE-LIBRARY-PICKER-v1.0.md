# MMG Knowledge Library Picker v1.0

**Status:** Approved for staging  
**Approval date:** July 20, 2026  
**Machine-readable authority:** `registry/knowledge-library/mmg-knowledge-library-picker-contract-v1.json`

## 1. Purpose

The MMG Knowledge Library Picker is the authenticated title-selection interface for MMG Knowledge Subscription™ packages.

It sits inside the existing Knowledge Library ecosystem without replacing Public Catalog behavior. The same canonical `mmg.asset_id` connects Shopify products, Kairos eligibility, customer ownership, entitlement windows, confirmed delivery grants, My Library, and future recommendations.

The first customer action remains:

> **Choose Your First Two Titles**

Title selection occurs after checkout. The picker does not participate in subscription billing or checkout creation.

## 2. Authority Boundaries

### Shopify

Shopify remains responsible for:

- Public product publication and availability.
- Product titles, handles, URLs, prices, and media.
- Canonical `mmg` product metafields.
- One-time digital-product purchases.
- The MMG Knowledge Subscription product and recurring billing.

### Kairos

Kairos remains authoritative for:

- Customer authentication.
- Active subscription verification.
- Current entitlement-window resolution.
- Ownership exclusion.
- Remaining-unit accounting.
- Final asset eligibility.
- Select, remove, and confirm mutations.
- Idempotency and optimistic concurrency.
- Delivery-grant creation.

### Storefront picker

The browser may:

- Display the server snapshot.
- Filter visible titles by search, topic, experience level, and format.
- Request a select, remove, or confirm mutation.
- Announce verified results to the customer.

The browser may not determine ownership, remaining capacity, subscription status, or final eligibility.

## 3. First-Package Flow

1. Shopify checkout creates the recurring purchase.
2. Kairos verifies the active subscription and creates the first-package entitlement window.
3. The window contains two units and targets two titles.
4. The customer opens the Knowledge Library or Customer Portal handoff.
5. The picker requests the authoritative server snapshot.
6. Titles already owned by the customer are excluded.
7. The customer selects two eligible one-unit titles.
8. Each mutation is revalidated and saved with optimistic concurrency.
9. The customer confirms the completed two-title package.
10. Kairos locks the selections and creates the delivery-grant inputs transactionally.
11. Confirmed titles move into the organized My Library delivery workflow.

## 4. Future Scheduled-Package Flow

Future packages use the same picker state machine.

- Kairos proposes two titles.
- The package review window remains open for 24–48 hours.
- Proposed titles appear in selected state.
- The customer may accept the package, remove an unconfirmed title, or choose an eligible replacement.
- Confirmation requires exactly two titles and all two package units.
- Confirmed titles are locked and become delivery-grant inputs.

## 5. Picker Snapshot

The server snapshot contains:

- Customer authentication state.
- Active subscription state.
- Entitlement-window identity, status, capacity, dates, and version.
- Eligible display items.
- Current selections.
- Excluded counts for owned, non-catalog, and incomplete products.
- Confirmation readiness.
- Confirmation timestamp where applicable.

Each displayed item includes:

- Stable asset ID.
- Shopify product ID and handle.
- Title and product URL.
- Topic, level, format, series, and series order.
- Portrait and square image URLs.
- Subscription value.
- Eligibility state and reason codes.
- Selection state.
- Server-derived `canSelect` and `canRemove` controls.

## 6. Commands

Logical endpoint:

```text
/api/knowledge-library/picker
```

### Read

```http
GET /api/knowledge-library/picker
Accept: application/json
Credentials: same-origin
```

### Mutation

```http
POST /api/knowledge-library/picker
Content-Type: application/json
X-MMG-CSRF-Token: <session-bound token>
Credentials: same-origin
```

Select example:

```json
{
  "action": "select",
  "assetId": "mmg-dd-ai-image-mastery-001",
  "requestId": "generated-idempotency-id",
  "expectedWindowVersion": 3
}
```

Confirm example:

```json
{
  "action": "confirm",
  "requestId": "generated-idempotency-id",
  "expectedWindowVersion": 5
}
```

The client must never send customer, subscription, or entitlement-window IDs. The server derives those identities from the authenticated session.

## 7. Concurrency and Idempotency

Every mutation includes:

- `requestId` for idempotent replay protection.
- `expectedWindowVersion` for optimistic concurrency.

A stale version returns `WINDOW_VERSION_CONFLICT` with the newest available server snapshot. The customer must review that refreshed state before retrying.

Processed request IDs are retained in a bounded history. Persistence adapters must additionally provide durable idempotency for confirmation and grant creation.

## 8. Selection Rules

- Only active subscription-eligible digital downloads may appear.
- Services and the subscription product are excluded.
- Owned assets are excluded.
- Incomplete media or delivery packages are excluded.
- The entitlement window must be open.
- Subscription values must be positive integers.
- The same asset may appear only once in a window.
- Over-selection is prohibited.
- Only unconfirmed selections may be removed.
- Confirmation requires the exact target title count and complete unit consumption.
- Confirmed selections are locked.

## 9. Shopify Integration

Canonical files:

```text
shopify/snippets/mmg-knowledge-library-picker.liquid
shopify/assets/mmg-knowledge-library-picker.js
shopify/assets/mmg-knowledge-library-picker.css
shopify/knowledge-library/mmg-knowledge-library-picker-integration.liquid
```

The integration assembly uses the canonical Frontpage collection as the provisional public metadata source unless a dedicated Knowledge Library collection is passed explicitly. Provisional Liquid metadata never grants eligibility. The authenticated endpoint replaces it with the authoritative snapshot.

## 10. Customer States

### Loading

The picker requests the current authoritative snapshot and disables mutation controls.

### Unauthenticated

The customer is directed to the Customer Portal sign-in flow.

### Subscription inactive

The picker presents membership discovery without selection controls.

### Window unavailable

The picker explains that the package is scheduled, closed, expired, or otherwise unavailable.

### Ready

The picker displays eligible titles, filters, current capacity, and select/remove controls.

### Selection complete

The confirmation control becomes available only when the exact package requirements are satisfied.

### Confirmed

Selections are locked and the customer is directed toward My Library and the Customer Portal.

### Error

The last verified server snapshot remains visible when possible. Errors are announced through the live region and stable MMG events.

## 11. Integration Events

The custom element emits:

```text
mmg:knowledge-library-picker-ready
mmg:knowledge-library-selection-updated
mmg:knowledge-library-package-confirmed
mmg:knowledge-library-picker-error
```

The upcoming entitlement counter, Customer Portal dashboard, analytics, and delivery-window components may consume these events without owning eligibility decisions.

## 12. Publication Boundary

The picker is implemented and governed in source control but remains blocked from live publication until:

1. The authenticated same-origin endpoint exists.
2. Origin and session-bound CSRF validation are active.
3. The server derives customer, subscription, and window identity from the session.
4. A durable versioned entitlement-window repository exists.
5. Confirmation and delivery-grant creation are atomic and idempotent.
6. At least two fully verified subscriber-selectable digital assets exist.
7. The live Knowledge Library source is captured before integration.
8. Mobile, keyboard, screen-reader, authorization, concurrency, and delivery QA pass.

## 13. Next Dependency

The next build is the **MMG Entitlement Counter and ownership-resolution persistence layer**.

It will provide durable customer ownership grants, entitlement-window storage, versioned selection persistence, package counters, and the repository adapter required by the picker service.
