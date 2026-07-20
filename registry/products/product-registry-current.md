# MMG Product Registry — Current Canonical Baseline

**Status:** Active  
**Commerce authority:** `registry/products/mmg-commerce-contract-v1.json`  
**Knowledge Library authority:** `registry/knowledge-library/mmg-knowledge-library-contract-v1.json`  
**Knowledge Library picker authority:** `registry/knowledge-library/mmg-knowledge-library-picker-contract-v1.json`  
**Entitlement and ownership authority:** `registry/knowledge-library/mmg-entitlement-ownership-persistence-contract-v1.json`  
**Delivery window authority:** `registry/knowledge-library/mmg-delivery-window-controller-contract-v1.json`  
**Customer Portal subscription dashboard authority:** `registry/customer-portal/mmg-subscription-dashboard-contract-v1.json`  
**Thank-you first-title handoff authority:** `registry/checkout/mmg-thank-you-first-title-handoff-contract-v1.json`  
**Digital asset registry:** `registry/knowledge-library/digital-asset-registry-v1.json`  
**Live URL authority:** `registry/site-pages/site-url-registry-current.json`

## Canonical Product Types

| Product type | Shopify structure | Primary customer destination | Subscription behavior |
|---|---|---|---|
| Digital download | Individual product | My Library | Eligible only when `mmg.subscription_eligible` is true and every Knowledge Library selection gate passes. |
| Service | Product with Starter, Growth, and Professional variants | My Projects | Not included in subscription fulfillment. |
| Subscription | MMG Knowledge Subscription™ with Monthly, Bi-weekly, and Weekly variants | Subscription Dashboard + My Library | Creates recurring digital-asset entitlements. |

## Active Live Products

| Product | Type | Canonical path | Status | Canonical role |
|---|---|---|---|---|
| AI Image Mastery™ | Digital download | `/products/ai-image-mastery` | Active | Current digital-product storefront reference and first canonical Knowledge Library asset. |
| Professional Cover Design Service™ | Service | `/products/professional-cover-design-service` | Active | Current multi-variant service-product storefront reference. |

## Subscription Product

| Product | Handle | Variant | Price | Packages per billing cycle | Assets per package | Assets per billing cycle |
|---|---|---|---:|---:|---:|---:|
| MMG Knowledge Subscription™ | `mmg-knowledge-subscription` | Monthly | $14.95/month | 1 | 2 | 2 |
| MMG Knowledge Subscription™ | `mmg-knowledge-subscription` | Bi-weekly | $24.95/month | 2 | 2 | 4 |
| MMG Knowledge Subscription™ | `mmg-knowledge-subscription` | Weekly | $39.95/month | 4 | 2 | 8 |

Every variant is billed monthly. Monthly, Bi-weekly, and Weekly describe the digital-package cadence and entitlement, not separate billing intervals.

**Provisioning authority:** `shopify/products/mmg-knowledge-subscription/product-contract.json`

## Knowledge Library Asset Registry

The canonical cross-system identity is `mmg.asset_id`. Shopify titles and handles are presentation and routing fields; they do not replace the permanent asset identity.

| Asset | Asset ID | Public catalog | Subscription selection | Current gate |
|---|---|---:|---:|---|
| AI Image Mastery™ | `mmg-dd-ai-image-mastery-001` | Active | Blocked pending provisioning | Verify square thumbnail, delivery package, Shopify metafields, and runtime IDs. |

A product may remain publicly purchasable while subscriber selection is blocked. This prevents the picker from offering a title that Kairos cannot yet package and deliver reliably.

## Live or Planned Product Families

| Product / Series | Type | Known Path / Handle | Status | Notes |
|---|---|---|---|---|
| AI Image Mastery™ | Digital guide | `/products/ai-image-mastery` | Active | AI Mastery Series title; canonical asset ID `mmg-dd-ai-image-mastery-001`. |
| Professional Cover Design Service™ | Service | `/products/professional-cover-design-service` | Active | Current service-product reference with Starter, Growth, and Professional variants. |
| The Creator's Bible | Digital book | `/products/the-creators-bible` | Planned / prior reference | Creator education title; subscription eligibility must be explicitly assigned. |
| AI Prompting for Beginners | Digital education | `/products/ai-prompting-for-beginners` | Planned / prior reference | Standard single-variant product-page source base. |
| The Failure Advantage | Digital book | `/products/the-failure-advantage` | Planned / prior reference | Mindset and recovery-aligned title. |
| Go Viral This Week | Digital book | TBD | Planned | Ebook and future physical-format options previously discussed. |
| Reset 365 | Digital book series | TBD | Planned | 365-day reset and mindset product family. |
| AI Mastery Series | Digital book series | `/products/ai-image-mastery` and future handles | Active / expanding | Includes AI Image Mastery and planned continuation titles. |
| Micro-Packs | Digital short books | TBD | Planned | Compact creator-education product family. |
| Publish-Ready Book Build Service™ | Service | TBD | Planned | Canonical multi-variant service-product pattern. |
| MMG Knowledge Subscription™ | Subscription | `/products/mmg-knowledge-subscription` | Approved for provisioning | Canonical recurring product connecting the Knowledge Library, cart, Customer Portal, and Kairos entitlement system. |

## Product-Image Rules

### Digital downloads

- Use the portrait cover as the default storefront image.
- Preferred portrait master: **2048 × 3072 px**, 2:3.
- Required square companion thumbnail: **2048 × 2048 px**, 1:1.
- Digital-delivery packages include both portrait and square assets.

### Services

- Use the unique service cover as the default product image.
- Starter selection switches primary media to the reusable blue Starter image.
- Growth selection switches primary media to the reusable purple Growth image.
- Professional selection switches primary media to the reusable gold Professional image.
- The selected tier image carries into cart and checkout where Shopify supports variant media.
- Do not expose all three tier images as permanent redundant gallery thumbnails.

## Product-Page Rules

- Single-variant products use the normalized standard product-page base.
- Multi-variant service products use the approved editorial premium UX framework.
- Variant cards expose live purchase behavior inside the page body.
- Digital-product pages preserve one-time purchase and add the reusable membership offer below the primary purchase area.
- Service pages keep service conversion primary and place membership in Continue Your Journey.
- The subscription product is subscription-only and must always add a valid selling plan to the cart line.
- Public copy must not expose internal registry names, IDs, or production terminology.
- Product source must be preserved in complete form.

## Knowledge Library Rules

The Knowledge Library is the shared digital catalog for:

1. Public discovery and individual purchase.
2. Authenticated subscriber title selection.
3. Customer-owned assets and downloads.

Only active, approved, subscription-eligible digital downloads with complete verified selection metadata may enter subscriber selection. Kairos must exclude assets already owned by the customer and revalidate the active entitlement window server-side.

The canonical Shopify metadata definitions are stored in:

`shopify/metafields/mmg-knowledge-library-product-metafields.json`

The public storefront may expose provisional eligibility hints, but it must not expose private ownership grants, subscription contract identifiers, or authoritative remaining-unit totals.

The picker uses:

- Server-derived customer, subscription, and window identity.
- A two-title, two-unit first-package target.
- `requestId` idempotency.
- `expectedWindowVersion` optimistic concurrency.
- Exact-capacity confirmation.
- Locked confirmed selections.

## Durable Entitlement and Ownership Rules

- PostgreSQL-compatible persistence is defined by `database/migrations/20260720_001_mmg_knowledge_entitlements.sql`.
- Subscription contracts, billing cycles, package windows, selections, request IDs, delivery grants, ownership grants, and audit events have separate durable records.
- Active ownership is resolved from `customer_id + asset_id`, not from browser state or product titles.
- The customer-facing My Library presents one asset per canonical `asset_id` even when historical grant records are retained.
- Package confirmation uses one transaction for the window update, selections, request ID, delivery grants, ownership grants, cycle counters, and audit event.
- Any failed version, capacity, ownership, delivery-package, or eligibility check rolls back the entire confirmation.
- The reusable entitlement counter shows plan, billing cycle, package completion, asset capacity, current-window progress, and owned-asset count.

## Delivery Window Rules

- Controller persistence is extended by `database/migrations/20260720_002_mmg_delivery_window_controller.sql`.
- Monthly package openings: day 0.
- Bi-weekly package openings: days 0 and 14.
- Weekly package openings: days 0, 7, 14, and 21.
- Weekly remains four packages and eight assets even in a five-week calendar month.
- Review windows are 24–48 hours, with 48 hours as the default.
- The first package is customer-selected and is never auto-confirmed.
- An expired first package moves to `recovery_required`.
- Future packages are proposed by Kairos and may auto-confirm at expiry only when the exact two-title package passes server revalidation.
- Incomplete, invalid, or uncuratable packages move to recovery without consuming entitlement incorrectly.
- Confirmed packages progress through `delivery_ready` to `delivered` using an idempotent dispatcher keyed by window ID.

## Customer Portal Subscription Dashboard Rules

- The canonical route remains `/pages/customer-portal`.
- The dashboard is added to the existing portal and must not replace service-project, support, navigation, authentication, or other established portal modules.
- The dashboard reads private customer state from `GET /api/customer-portal/subscription`.
- Customer identity is derived from the authenticated server session.
- The response is private, non-cacheable, and read-only.
- The dashboard displays plan, price, billing dates, assets and packages remaining, current review window, selected or proposed titles, package timeline, recovery actions, My Library, the Subscription Member Guide, and account controls.
- Package priority is `recovery_required`, `open`, `delivery_ready`, `confirmed`, `scheduled`, `delivered`, `closed`, `expired`, then `canceled`.
- Internal provider contract IDs, dispatch IDs, delivery-package references, ownership-grant IDs, and audit payloads are never exposed.
- Subscription selection remains owned by the Knowledge Library Picker; delivery lifecycle mutations remain owned by the Delivery Window Controller.

## Thank-You First-Title Handoff Rules

- The Thank you page uses the checkout UI extension target `purchase.thank-you.block.render`; it does not use legacy checkout scripts.
- The extension obtains the completed order ID, checkout token, and a fresh Shopify extension session token.
- Kairos reloads and verifies the order server-side before treating it as a subscription purchase.
- The canonical subscription line must match the verified product identity, contain a selling-plan allocation, and include an approved `_mmg_subscription_plan_code` marker.
- The raw checkout token is never persisted; only a SHA-256 hash is stored.
- Order links are idempotent by `shop_domain + order_id` and remain pending until Shopify subscription webhook reconciliation assigns the durable entitlement.
- Title selection never occurs inside checkout. The successful buyer is directed into **Choose Your First Two Titles** only after the first package window is available.
- Guest buyers must authenticate in the Customer Portal before private entitlement, ownership, or selection state is disclosed.
- Delayed order creation, subscription reconciliation, cycle creation, and window creation produce an activation-pending state rather than implying checkout failure.
- Non-subscription orders render no MMG subscription handoff.
- A recovery-required first package routes to Customer Service; a confirmed or delivered first package routes to My Library.

## Commerce Component Build State

| Component | Repository status | Live storefront status | Next dependency |
|---|---|---|---|
| MMG commerce ecosystem contract | Merged | Governing only | Continue implementation sequence. |
| Subscription product and selling-plan contract | Merged | Not provisioned | Shopify runtime IDs. |
| MMG Three-Plan Selector | Merged | Not installed | Subscription product provisioning. |
| MMG Cart Subscription Controller | Merged | Not installed | Active theme cart integration and product provisioning. |
| Knowledge Library eligibility metadata | Merged | Not installed | Shopify metafields and delivery packages. |
| MMG Knowledge Library Picker | Merged | Not installed | Durable API adapter and verified assets. |
| MMG Entitlement Counter and Ownership Persistence | Merged for staging | Not installed | Production PostgreSQL and Shopify contract reconciliation. |
| MMG Delivery Window Controller | Merged for staging | Not scheduled live | Production scheduler, dispatcher, and reconciliation. |
| MMG Customer Portal Subscription Dashboard | Merged for staging | Not installed | Authenticated endpoint routing and portal integration. |
| MMG Thank-You First-Title Handoff | Implemented for staging | Not installed | My Library delivery interface. |

## Shopify Storage Contract

```text
shopify/products/{product-handle}/source.html
shopify/products/{product-handle}/product-contract.json
shopify/products/{product-handle}/metadata.md
shopify/products/{product-handle}/qa.md
shopify/products/{product-handle}/release-notes.md
```

Canonical product, entitlement, delivery-window, Customer Portal, and post-checkout handoff relationships must also be represented in the machine-readable commerce contract and relevant registries.
