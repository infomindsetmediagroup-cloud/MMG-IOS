# MMG Product Registry — Current Canonical Baseline

**Status:** Active  
**Commerce authority:** `registry/products/mmg-commerce-contract-v1.json`  
**Knowledge Library authority:** `registry/knowledge-library/mmg-knowledge-library-contract-v1.json`  
**Knowledge Library picker authority:** `registry/knowledge-library/mmg-knowledge-library-picker-contract-v1.json`  
**Entitlement and ownership authority:** `registry/knowledge-library/mmg-entitlement-ownership-persistence-contract-v1.json`  
**Delivery window authority:** `registry/knowledge-library/mmg-delivery-window-controller-contract-v1.json`  
**Customer Portal subscription dashboard authority:** `registry/customer-portal/mmg-subscription-dashboard-contract-v1.json`  
**Thank-you first-title handoff authority:** `registry/checkout/mmg-thank-you-first-title-handoff-contract-v1.json`  
**My Library delivery authority:** `registry/customer-portal/mmg-my-library-delivery-contract-v1.json`  
**Shopify subscription reconciliation authority:** `registry/shopify/mmg-subscription-webhook-reconciliation-contract-v1.json`  
**Digital asset registry:** `registry/knowledge-library/digital-asset-registry-v1.json`  
**Live URL authority:** `registry/site-pages/site-url-registry-current.json`

## Canonical Product Types

| Product type | Shopify structure | Primary customer destination | Subscription behavior |
|---|---|---|---|
| Digital download | Individual product | My Library | Eligible only when `mmg.subscription_eligible` is true and every Knowledge Library release and selection gate passes. |
| Service | Product with Starter, Growth, and Professional variants | My Projects | Not included in subscription fulfillment. |
| Subscription | MMG Knowledge Subscription™ with Monthly, Bi-weekly, and Weekly variants | Subscription Dashboard + My Library | Shopify owns recurring billing; Kairos reconciles contracts, entitlements, packages, and delivery. |

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

Every variant is billed monthly. Monthly, Bi-weekly, and Weekly describe the digital-package cadence and entitlement, not separate Shopify billing intervals.

**Provisioning authority:** `shopify/products/mmg-knowledge-subscription/product-contract.json`

The canonical Shopify structure is one product, three cadence variants, and one shared monthly selling plan. Runtime product, variant, selling-plan-group, and selling-plan GIDs remain deployment values and must be verified before live reconciliation.

## Knowledge Library Asset Registry

The permanent cross-system identity is `mmg.asset_id`. Shopify titles and handles are presentation and routing fields; they do not replace the canonical asset identity.

| Asset | Asset ID | Public catalog | Subscription selection | Current gate |
|---|---|---:|---:|---|
| AI Image Mastery™ | `mmg-dd-ai-image-mastery-001` | Active | Blocked pending provisioning | Verify square thumbnail, delivery package, Shopify metafields, runtime IDs, and secure delivery files. |

A product may remain publicly purchasable while subscriber selection is blocked. This prevents the picker from offering a title Kairos cannot yet package and deliver reliably.

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
| MMG Knowledge Subscription™ | Subscription | `/products/mmg-knowledge-subscription` | Approved for provisioning | Canonical recurring product connecting Shopify billing, the Knowledge Library, Customer Portal, My Library, and Kairos entitlements. |

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
- Digital-product pages preserve one-time purchase and add the reusable membership offer below the primary purchase area.
- Service pages keep service conversion primary and place membership in Continue Your Journey.
- The subscription product is subscription-only and must always add a valid selling plan to the cart line.
- Public copy must not expose internal registry names, IDs, or production terminology.
- Product source must be preserved in complete form.

## Knowledge Library and Ownership Rules

The Knowledge Library supports public discovery, authenticated subscriber selection, and customer-owned assets.

- Only active, approved, subscription-eligible digital downloads with complete release metadata may enter subscriber selection.
- Kairos excludes already-owned assets and revalidates the active entitlement window server-side.
- The picker derives customer, subscription, and window identity from the authenticated server session.
- First-package selection requires exactly two titles and two units.
- Mutations use `requestId` idempotency and `expectedWindowVersion` optimistic concurrency.
- Active ownership is resolved from durable `customer_id + asset_id` grants, not browser state or titles.
- My Library presents one item per canonical `asset_id` even when historical grant records are retained.
- Confirmation, delivery grants, ownership grants, cycle counters, and audit events commit or roll back together.

## Delivery Window Rules

- Monthly package opening: day 0.
- Bi-weekly package openings: days 0 and 14.
- Weekly package openings: days 0, 7, 14, and 21.
- Weekly remains four packages and eight assets in five-week calendar months.
- Review windows are 24–48 hours, with 48 hours as the default.
- The first package is customer-selected and never auto-confirmed.
- An expired first package moves to `recovery_required`.
- Future packages may auto-confirm only when the exact two-title package passes server revalidation.
- Confirmed packages progress through `delivery_ready` to `delivered` using an idempotent dispatcher keyed by window ID.

## Customer Portal and My Library Rules

- The canonical portal route remains `/pages/customer-portal`.
- Subscription Dashboard and My Library are additive modules and do not replace projects, uploads, support, authentication, or navigation.
- Private state is loaded through authenticated, non-cacheable server endpoints.
- My Library is available at `/pages/customer-portal#my-library`.
- Subscription-delivered assets remain `preparing` until the linked package window reaches `delivered`.
- Secure read and download actions require active ownership, delivery revalidation, same-origin protection, CSRF validation, and a unique request ID.
- Signed file URLs use HTTPS, expire within 60–600 seconds, and never expose permanent storage URLs or object keys.

## Thank-You First-Title Handoff Rules

- The Thank you page uses `purchase.thank-you.block.render`.
- Kairos reloads and verifies the completed order server-side.
- The canonical line must match the approved product, contain a selling-plan allocation, and carry the approved private plan marker.
- Raw checkout tokens are never persisted; only SHA-256 hashes are stored.
- Pending order links remain activation-pending until Shopify subscription reconciliation assigns a durable entitlement.
- Title selection never occurs in checkout.
- The buyer enters **Choose Your First Two Titles** only after the first package window is available.

## Shopify Subscription Reconciliation Rules

The reconciliation authority is `registry/shopify/mmg-subscription-webhook-reconciliation-contract-v1.json`.

- The app-specific webhook surface uses Shopify API version `2026-07` and requires `read_own_subscription_contracts` plus protected subscription API access.
- Accepted topics are contract create/update and billing-attempt success/failure/challenged.
- The exact raw body is HMAC-verified before JSON parsing.
- Deliveries are deduplicated by `X-Shopify-Webhook-Id`; the same ID with another payload hash is rejected.
- The webhook payload is not the final authority. Kairos reloads the complete `SubscriptionContract` through Admin GraphQL.
- Contract customer, product, variant, selling plan, quantity, currency, billing policy, delivery policy, and current period must pass canonical validation.
- Contract statuses map to `active`, `paused`, `failed`, `canceled`, and `expired`.
- Stale revisions and equal-revision older events are ignored.
- A cycle is unique by entitlement and authoritative current-period start.
- Plan capacity remains exactly 1/2/4 packages and 2/4/8 assets.
- Matching pending Thank-you order links are connected to the durable entitlement.
- Paused and terminal contracts cancel future scheduled cycles without revoking delivered ownership.
- Raw webhook bodies, app secrets, Admin tokens, provider IDs, payload hashes, and billing-attempt internals are never exposed to storefront customers.

## Commerce Component Build State

| Component | Repository status | Live storefront/runtime status | Next dependency |
|---|---|---|---|
| MMG commerce ecosystem contract | Merged and advanced to v1.9 | Governing only | Continue implementation sequence. |
| Subscription product and selling-plan contract | Merged | Not provisioned | Shopify runtime IDs. |
| MMG Three-Plan Selector | Merged | Not installed | Subscription product provisioning. |
| MMG Cart Subscription Controller | Merged | Not installed | Active theme cart integration and product provisioning. |
| Knowledge Library eligibility metadata | Merged | Not installed | Shopify metafields and delivery packages. |
| MMG Knowledge Library Picker | Merged | Not installed | Durable API adapter and verified assets. |
| MMG Entitlement Counter and Ownership Persistence | Merged for staging | Not installed | Production PostgreSQL. |
| MMG Delivery Window Controller | Merged for staging | Not scheduled live | Production scheduler and dispatcher. |
| MMG Customer Portal Subscription Dashboard | Merged for staging | Not installed | Authenticated endpoint routing and portal integration. |
| MMG Thank-You First-Title Handoff | Merged for staging | Not installed | Shopify extension deployment. |
| MMG My Library Delivery Interface | Merged for staging | Not installed | Storage signer and portal insertion. |
| Shopify Subscription Webhook Reconciliation | Implemented for staging | Not registered or routed live | Kairos recommendation and curation ranking. |

## Shopify Product Storage Contract

```text
shopify/products/{product-handle}/source.html
shopify/products/{product-handle}/product-contract.json
shopify/products/{product-handle}/metadata.md
shopify/products/{product-handle}/qa.md
shopify/products/{product-handle}/release-notes.md
```

Canonical product, entitlement, reconciliation, delivery-window, Customer Portal, post-checkout handoff, My Library, and secure-delivery relationships must also be represented in the machine-readable commerce contract and relevant registries.
