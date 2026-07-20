# MMG Product Registry — Current Canonical Baseline

**Status:** Active  
**Commerce authority:** `registry/products/mmg-commerce-contract-v1.json`

## Canonical Product Types

| Product type | Shopify structure | Primary customer destination | Subscription behavior |
|---|---|---|---|
| Digital download | Individual product | My Library | Eligible only when `mmg.subscription_eligible` is true |
| Service | Product with Starter, Growth, and Professional variants | My Projects | Not included in subscription fulfillment |
| Subscription | MMG Knowledge Subscription™ with Monthly, Bi-weekly, and Weekly plans | Subscription Dashboard + My Library | Creates recurring digital-asset entitlements |

## Subscription Product

| Product | Handle | Plan | Price | Assets per billing cycle |
|---|---|---|---:|---:|
| MMG Knowledge Subscription™ | `mmg-knowledge-subscription` | Monthly | $14.95/month | 2 |
| MMG Knowledge Subscription™ | `mmg-knowledge-subscription` | Bi-weekly | $24.95/month | 4 |
| MMG Knowledge Subscription™ | `mmg-knowledge-subscription` | Weekly | $39.95/month | 8 |

Every scheduled package contains two digital assets. Monthly receives one package, Bi-weekly receives two packages, and Weekly receives four packages per monthly billing cycle.

## Live or Planned Product Families

| Product / Series | Type | Known Path / Handle | Notes |
|---|---|---|---|
| The Creator's Bible | Digital book | `/products/the-creators-bible` | Creator education title; subscription eligibility must be explicitly assigned. |
| AI Prompting for Beginners | Digital education | `/products/ai-prompting-for-beginners` | Standard single-variant product-page source base. |
| The Failure Advantage | Digital book | `/products/the-failure-advantage` | Mindset and recovery-aligned title. |
| Go Viral This Week | Digital book | TBD | Ebook and future physical-format options previously discussed. |
| Reset 365 | Digital book series | TBD | 365-day reset and mindset product family. |
| AI Mastery Series | Digital book series | TBD | Includes AI Prompt Mastery, AI Image Mastery, and planned continuation titles. |
| Micro-Packs | Digital short books | TBD | Compact creator-education product family. |
| Publish-Ready Book Build Service™ | Service | TBD | Canonical multi-variant service-product pattern. |
| MMG Knowledge Subscription™ | Subscription | `/products/mmg-knowledge-subscription` | Canonical recurring product connecting the Knowledge Library, cart, Customer Portal, and Kairos entitlement system. |

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
- Public copy must not expose internal registry names, IDs, or production terminology.
- Product source must be preserved in complete form.

## Knowledge Library Rules

The Knowledge Library is the shared digital catalog for:

1. Public discovery and individual purchase.
2. Authenticated subscriber title selection.
3. Customer-owned assets and downloads.

Only active, approved, subscription-eligible digital downloads may enter subscriber selection. Kairos must exclude assets already owned by the customer.

## Shopify Storage Contract

```text
shopify/products/{product-handle}/source.html
shopify/products/{product-handle}/metadata.md
shopify/products/{product-handle}/qa.md
shopify/products/{product-handle}/release-notes.md
```

Canonical product and entitlement relationships must also be represented in the machine-readable commerce contract and relevant asset registries.
