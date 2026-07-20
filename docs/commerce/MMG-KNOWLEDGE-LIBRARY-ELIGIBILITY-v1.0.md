# MMG Knowledge Library Eligibility and Selection Modes v1.0

**Status:** Approved for staging  
**Machine-readable authority:** `registry/knowledge-library/mmg-knowledge-library-contract-v1.json`  
**Digital asset registry:** `registry/knowledge-library/digital-asset-registry-v1.json`  
**Shopify metafield manifest:** `shopify/metafields/mmg-knowledge-library-product-metafields.json`

## Purpose

The Knowledge Library is one shared digital-asset system with three modes:

1. **Public Catalog** for product discovery and one-time purchase.
2. **Subscription Selection** for authenticated active subscribers choosing eligible titles inside an open entitlement window.
3. **My Library** for assets already purchased, delivered, or granted to the customer.

The three modes use the same canonical `mmg.asset_id`. Products must not be copied into disconnected catalogs or assigned different identities across Shopify, Kairos, the Customer Portal, and delivery records.

## Canonical Eligibility Predicate

A product may appear in the public digital catalog when:

- It is published and available in Shopify.
- `mmg.product_type` is `digital_download`.
- `mmg.asset_status` is `active`.
- `mmg.asset_id` is present and unique.
- A portrait cover is present.
- `mmg.customer_destination` is `my_library`.

A product may display **Included with Membership** and enter provisional subscription discovery only when the public predicate passes and:

- `mmg.subscription_eligible` is `true`.
- A square thumbnail is present.
- `mmg.subscription_value` is an integer of at least `1`.
- A verified `mmg.delivery_package` reference is present.

Customer-specific subscription selection requires additional Kairos validation:

- Customer is authenticated.
- MMG Knowledge Subscription contract is active.
- Customer does not already own the asset.
- Current entitlement window is open.
- Sufficient units remain.
- The asset is not already selected in the current package.

Liquid and browser JavaScript only expose a provisional metadata hint. They never grant ownership or make the authoritative entitlement decision.

## Metadata Fields

| Namespace and key | Required role |
|---|---|
| `mmg.product_type` | Separates digital downloads, services, and subscriptions. |
| `mmg.subscription_eligible` | Explicit opt-in to subscriber selection. |
| `mmg.asset_status` | Controls draft, approved, active, and retired lifecycle. |
| `mmg.asset_id` | Permanent cross-system identity. |
| `mmg.topic` | Primary recommendation and discovery classification. |
| `mmg.experience_level` | Beginner, intermediate, advanced, or all levels. |
| `mmg.format` | Book, guide, template, workbook, toolkit, prompt pack, or resource pack. |
| `mmg.series` | Optional series relationship. |
| `mmg.series_order` | Optional one-based order within a series. |
| `mmg.related_assets` | Related canonical asset IDs. |
| `mmg.square_thumbnail` | 2048 × 2048 subscriber and portal image. |
| `mmg.portrait_cover` | 2048 × 3072 storefront cover. |
| `mmg.subscription_value` | Entitlement units consumed by selection. |
| `mmg.delivery_package` | Verified Kairos customer-package reference. |
| `mmg.customer_destination` | `my_library`, `my_projects`, or `subscription_dashboard`. |

## Ownership Contract

Ownership is resolved by `customer_id + asset_id`.

Qualifying sources are:

- Completed one-time purchase grant.
- Confirmed subscription delivery grant.
- Approved bonus grant.
- Approved administrative grant.

The customer-facing library renders one asset per `asset_id`, even when several valid grants exist for audit history. An owned asset is excluded from new subscription selection and consumes no additional entitlement units.

## Entitlement Windows

### First package

- Begins after subscription checkout and entitlement creation.
- Customer action: **Choose Your First Two Titles**.
- Total units: `2`.
- Target title count: `2`.
- Selection is not performed inside checkout.

### Scheduled package review

- Kairos proposes two titles.
- Customer receives a 24–48-hour review window.
- Customer may accept, swap an eligible title, or confirm the package.
- Confirmed titles receive subscription delivery grants and enter My Library.

## Current Seed Asset

`AI Image Mastery™` is registered as:

- Asset ID: `mmg-dd-ai-image-mastery-001`
- Type: digital download
- Topic: AI image generation
- Level: beginner
- Format: guide
- Series: AI Mastery Series, position 1
- Subscription value: 1 unit

The live product remains publicly active. Subscriber selection is intentionally blocked until the square thumbnail, delivery package, Shopify metafield writes, and runtime IDs are verified. This prevents a customer from selecting an asset that Kairos cannot yet deliver reliably.

## Shopify Integration

Include the metadata stylesheet once on the Knowledge Library page or its section:

```liquid
{% render 'mmg-knowledge-library-metadata-assets' %}
```

Inside each digital product card, after the card's title or media block:

```liquid
{% render 'mmg-subscription-eligibility-badge',
  mmg_badge_product: card_product
%}

{% render 'mmg-knowledge-library-product-data',
  mmg_library_product: card_product
%}
```

The prepared assembly is:

`shopify/knowledge-library/mmg-knowledge-library-card-integration.liquid`

The data snippet emits a JSON script record with public product metadata and two provisional booleans:

- `publicCatalogHint`
- `subscriptionSelectionHint`

Both remain non-authoritative. The upcoming Knowledge Library Picker must request the Kairos decision before enabling customer selection.

## Security and Privacy Boundary

Public page source must not contain:

- Customer ownership grants.
- Subscription contract identifiers.
- Remaining entitlement totals treated as authoritative.
- Delivery download URLs that require authentication.

All selection acceptance and grant creation occur server-side through Kairos.

## Release Sequence

1. Provision Shopify metafield definitions.
2. Verify current digital products and assign stable asset IDs.
3. Complete required portrait, square, and delivery-package references.
4. Write product metafields.
5. Add the metadata stylesheet and card integration to the draft Knowledge Library page.
6. Build the MMG Knowledge Library Picker.
7. Connect authenticated Kairos ownership and entitlement APIs.
8. Run public, subscriber, and My Library authorization QA.
