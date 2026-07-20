# MMG Commerce Ecosystem Architecture v1.0

**Status:** Approved and locked  
**Approval date:** July 20, 2026  
**Machine-readable authority:** `registry/products/mmg-commerce-contract-v1.json`

## 1. Operating Model

MMG commerce is one connected ecosystem rather than separate storefront features.

- **Shopify** owns products, variants, selling plans, cart, checkout, payment, and recurring billing.
- **Kairos** owns recommendations, entitlements, title selection, ownership filtering, review windows, fulfillment, and customer progress.
- **The Knowledge Library** is the shared digital catalog connecting public discovery, subscription selection, customer ownership, and delivery.

The canonical customer journey is:

> Homepage → objective-based pathway → Knowledge Library, Services, or Membership → product decision → cart subscription offer → checkout → Customer Portal → title selection or project intake → My Library or My Projects → Continue Your Journey

## 2. Canonical Product Types

### Digital downloads

Digital books, guides, templates, workbooks, and toolkits are individually purchasable products. Approved titles may also be subscription eligible.

Required digital-delivery image assets:

1. Portrait cover master: **2048 × 3072 px**, 2:3.
2. Square thumbnail: **2048 × 2048 px**, 1:1.

The portrait cover is the default storefront product image unless a specific module requires a square asset.

### Services

Each service uses:

- A unique service-specific cover as the default product image.
- Starter, Growth, and Professional variants.
- A reusable tier image assigned to each variant.

Variant-media behavior:

1. Default state shows the unique service cover.
2. Selecting Starter changes the primary media to the blue Starter tier image.
3. Selecting Growth changes the primary media to the purple Growth tier image.
4. Selecting Professional changes the primary media to the gold Professional tier image.
5. The selected tier image carries into the cart and checkout where Shopify supports variant media.
6. The three tier images must not remain permanently visible as redundant gallery thumbnails.

### Subscription

Canonical product:

- **Title:** MMG Knowledge Subscription™
- **Handle:** `mmg-knowledge-subscription`

| Plan | Price | Packages per billing cycle | Assets per package | Assets per billing cycle |
|---|---:|---:|---:|---:|
| Monthly | $14.95/month | 1 | 2 | 2 |
| Bi-weekly | $24.95/month | 2 | 2 | 4 |
| Weekly | $39.95/month | 4 | 2 | 8 |

The Weekly entitlement is fixed at four packages and eight assets per monthly billing cycle. It does not become ten assets during a five-week calendar month.

## 3. Knowledge Library Modes

The same asset registry powers three customer experiences.

### Public Catalog Mode

Shows active digital products, one-time purchase controls, subscription-eligible indicators, and membership discovery.

### Subscription Selection Mode

Available only to authenticated active subscribers. It shows approved subscription-eligible titles the customer does not already own and may select within the current entitlement window.

### My Library Mode

Shows individual purchases, subscription selections, curated deliveries, bonuses, read-online access where supported, and downloads.

An asset must not be copied into disconnected catalogs. One canonical asset record powers the storefront, Knowledge Library, portal, recommendation engine, and delivery package.

## 4. Subscription Customer Flow

1. Customer chooses Monthly, Bi-weekly, or Weekly.
2. Shopify checkout establishes the recurring purchase.
3. Kairos creates the corresponding entitlement.
4. The thank-you page and Customer Portal display **Choose Your First Two Titles**.
5. The customer enters Knowledge Library Subscription Selection Mode.
6. The customer selects two titles for the first package.
7. Kairos curates future two-title packages.
8. Each future package opens a 24–48-hour review and eligible-swap window.
9. Confirmed assets enter My Library and the organized delivery workflow.

Title selection does not occur inside checkout.

## 5. Cart Subscription Offer

The cart drawer and full cart page use one reusable subscription controller.

When no subscription is present, show an unselected invitation:

> **Build Your Knowledge Library**  
> Receive 2, 4, or 8 curated digital assets per monthly billing cycle.  
> Starting at $14.95/month.

Customer action opens the three-plan selector. The subscription is added only after explicit plan selection and confirmation.

Mandatory safeguards:

- Never silently add a subscription.
- Never preselect recurring consent.
- Display the selected plan and recurring price clearly.
- Permit plan change or removal before checkout.
- Do not rely on checkout-stage customization as the primary upsell surface.

## 6. Kairos Offer & Entitlement Engine

The engine is the shared decision layer for:

- Subscription offers
- Digital-product bundles
- Service add-ons
- Related resources
- Cart recommendations
- Ownership checks
- Subscription entitlements
- Delivery limits
- Discount eligibility
- Continuation pathways

Shopify Bundles may support future fixed one-time bundles, but it is not the subscription entitlement foundation.

## 7. Canonical Metadata Namespace

Use the Shopify metafield namespace `mmg`.

| Key | Purpose |
|---|---|
| `product_type` | `digital_download`, `service`, or `subscription` |
| `subscription_eligible` | Whether a digital title may enter the subscriber picker |
| `asset_status` | Draft, approved, active, retired |
| `asset_id` | Permanent Kairos asset identifier |
| `topic` | Primary subject classification |
| `experience_level` | Beginner, intermediate, advanced |
| `format` | Book, guide, template, workbook, toolkit |
| `series` | Series relationship |
| `series_order` | Ordered position within a series |
| `related_assets` | Continuation and recommendation relationships |
| `square_thumbnail` | 2048 × 2048 asset reference |
| `portrait_cover` | 2048 × 3072 master reference |
| `subscription_value` | Entitlement units required |
| `delivery_package` | Customer package reference |
| `customer_destination` | My Library, My Projects, or Subscription Dashboard |

## 8. Sitewide Placement Contract

### Homepage

Present three connected paths: learn through digital resources, build through services, and grow continuously through membership.

### Knowledge Library

Primary membership discovery and title-selection surface. Eligible titles display an **Included with Membership** state.

### Digital-product pages

Retain one-time purchase. Add the reusable Build Your Library membership module beneath the primary purchase area.

### Service-product pages

Keep Starter, Growth, and Professional conversion primary. Introduce membership lower on the page in Continue Your Journey.

### Publishing Services landing page

Lead with service outcomes and connect secondarily to relevant educational assets and membership.

### Membership landing page

Explain plans, entitlements, onboarding, first-title selection, Kairos curation, review windows, and My Library.

### Cart drawer and cart page

Show the subscription invitation only when a subscription is not already present.

### Thank-you page

For new subscribers, direct the customer to choose the first two titles.

### Customer Portal

Display plan, next delivery, current entitlement, review window, selections, recommendations, delivered assets, My Library, and account-management controls.

## 9. Reusable Components

Build and reuse these components rather than creating isolated page widgets:

1. MMG Subscription Offer Module
2. MMG Three-Plan Selector
3. MMG Cart Subscription Controller
4. MMG Knowledge Library Picker
5. MMG Entitlement Counter
6. MMG Related Journey Module
7. MMG Ownership Filter
8. MMG Delivery Window Controller

## 10. Implementation Order

1. Canonical commerce contract and registry foundation.
2. MMG Knowledge Subscription Shopify product and selling-plan mapping.
3. Reusable three-plan selector.
4. Cart subscription controller.
5. Knowledge Library eligibility and ownership metadata.
6. Subscriber title picker and first-delivery workflow.
7. Entitlement counter and delivery-window controller.
8. Sitewide offer and Continue Your Journey placements.
9. Customer Portal subscription dashboard.
10. End-to-end QA across storefront, cart, checkout, portal, and delivery.

No new product page or landing page should introduce a competing commerce architecture.
