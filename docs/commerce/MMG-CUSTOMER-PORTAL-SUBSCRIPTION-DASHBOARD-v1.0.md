# MMG Customer Portal Subscription Dashboard v1.0

## Purpose

The Customer Portal subscription dashboard is the authenticated customer-facing control surface for MMG Knowledge Subscription™. It consolidates plan identity, billing-cycle entitlement, package progress, current review windows, selected titles, delivery status, recovery actions, My Library, membership guidance, and account management.

The dashboard is additive. It must be inserted into the existing Customer Portal without replacing service-project workflows, support routes, authentication boundaries, or existing navigation.

## Canonical endpoint

```text
GET /api/customer-portal/subscription
```

The endpoint is read-only in v1. Customer identity is derived from the authenticated server session. Browser-supplied customer IDs, subscription IDs, cycle capacity, ownership, and package state are ignored.

Responses are private and non-cacheable:

```text
Cache-Control: no-store, private
Vary: Cookie
```

## Customer-visible dashboard

### Membership header

The header displays:

- Membership status
- Monthly, Bi-weekly, or Weekly plan
- Locked monthly price
- Assets and packages per billing cycle
- Current billing-period dates
- The highest-priority customer action

### Progress cards

The dashboard displays:

- Assets remaining
- Assets committed
- Packages completed
- Packages remaining
- Current package selection progress
- Total owned digital assets

The server remains authoritative for every count.

### Current package

The current-package resolver uses this priority:

1. `recovery_required`
2. `open`
3. `delivery_ready`
4. `confirmed`
5. `scheduled`
6. `delivered`
7. `closed`
8. `expired`
9. `canceled`

An open first package directs the customer to **Choose Your First Two Titles**. An open future package directs the customer to review, accept, remove, or replace the proposed titles. A recovery-required package directs the customer to the governed recovery path. Confirmed and delivered packages direct the customer to My Library.

### Package timeline

The timeline shows every package in the current billing cycle in package-sequence order. It displays customer-safe status and dates. Internal dispatch IDs, provider subscription IDs, database row IDs other than opaque package identity, delivery package references, grant IDs, and audit payloads are not exposed.

### Membership resources

The dashboard links to:

- Knowledge Library
- Subscription selection mode
- My Library
- Subscription Member Guide
- Customer Service
- Shopify customer account management

The member-guide link remains anchored inside the Customer Portal until a separately approved live guide route or Shopify file URL is provisioned.

## Backend structure

```text
server/customer-portal/subscription-dashboard.ts
server/customer-portal/subscription-dashboard-repository.ts
server/customer-portal/subscription-dashboard-service.ts
server/customer-portal/subscription-dashboard-http.ts
```

The PostgreSQL repository reads the latest relevant subscription entitlement, current billing cycle, package windows, title selections, product display metadata, and active ownership count.

The builder produces a stable `1.0.0` customer-safe snapshot. The service handles the no-subscription state. The HTTP adapter enforces method, authentication, security headers, and error boundaries.

## Shopify structure

```text
shopify/snippets/mmg-customer-portal-subscription-dashboard.liquid
shopify/assets/mmg-customer-portal-subscription-dashboard.js
shopify/assets/mmg-customer-portal-subscription-dashboard.css
shopify/customer-portal/mmg-subscription-dashboard-integration.liquid
```

The Liquid component contains the semantic shell and configured routes. JavaScript loads the private snapshot, renders title cards and the package timeline with DOM APIs, maintains the review-window countdown, and refreshes after picker and entitlement events. CSS is scoped to the custom element and does not normalize `#MainContent`, replace the page frame, or alter the Shopify header and footer.

## Refresh behavior

The dashboard reloads after:

- `mmg:knowledge-library-selection-updated`
- `mmg:knowledge-library-package-confirmed`
- `mmg:entitlement-counter-ready`

It emits:

- `mmg:customer-portal-subscription-ready`
- `mmg:customer-portal-subscription-error`

## Security boundary

The initial dashboard is read-only. Selection mutations remain in the Knowledge Library Picker. Delivery-window state transitions remain in the protected Delivery Window Controller. Membership billing changes remain in Shopify or the approved subscription-management integration.

Never expose:

- Shopify subscription contract IDs
- Internal dispatch IDs
- Delivery-package references
- Ownership-grant IDs
- Entitlement-event payloads
- Customer identifiers
- Browser-calculated entitlement authority

## Release sequence

1. Apply the entitlement and delivery-window migrations.
2. Connect production PostgreSQL.
3. Reconcile Shopify subscription contracts.
4. Activate the Delivery Window Controller and dispatcher.
5. Route the authenticated dashboard endpoint.
6. Capture the existing live Customer Portal source.
7. Insert the dashboard assembly without removing existing modules.
8. Verify private session behavior, mobile layout, accessibility, countdowns, recovery, and delivery states.
9. Publish only after the release gates in the machine-readable contract pass.

## Next dependency

The next locked build is the **Thank-you page first-title handoff**, which directs newly subscribed customers from the completed order into the first open Knowledge Library selection window.
