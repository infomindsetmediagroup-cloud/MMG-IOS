# Shopify Live Baseline — 2026-07-20

## Verification Scope

This snapshot was collected through the connected official Shopify integration using read-only operations. No Shopify resource was created, updated, published, archived, or deleted during this audit.

## Store

| Field | Verified value |
|---|---|
| Store name | Mindset Media Group |
| Primary domain | `themindsetmediagroup.com` |
| Shopify plan | Basic |
| Currency | USD |
| Store timezone | PDT |
| Country | United States |

The connected store is the authoritative MMG store context. Historical or inferred `.myshopify.com` environment mappings must not override the connected-store identity without a fresh Shopify read.

## Live Catalog Summary

| Resource | Count | State |
|---|---:|---|
| Products | 2 | Both active |
| Collections | 1 | Manual collection containing both products |
| Subscription products | 0 | Approved target only; not live |

## Product 1 — Canonical Service Product

| Field | Verified value |
|---|---|
| Title | Professional Cover Design Service™ |
| Product GID | `gid://shopify/Product/9024288620698` |
| Handle | `professional-cover-design-service` |
| Status | Active |
| Vendor | Mindset Media Group |
| Product type | Blank |
| Featured media | Shopify-hosted portrait product image |
| Total media | 4 images |
| Inventory | 0; service product |
| SKU coverage | No variant SKUs |

### Variants

| Tier | Variant GID | Price |
|---|---|---:|
| Starter | `gid://shopify/ProductVariant/48658205376666` | $97.95 |
| Growth | `gid://shopify/ProductVariant/48658205409434` | $197.95 |
| Professional | `gid://shopify/ProductVariant/48658205442202` | $397.95 |

### Verified Delivery Contract

- One purchase covers one service project within the selected tier.
- The immediate post-purchase deliverable is the MMG Project Guide™ Customer Handbook.
- The customer then completes Customer Portal intake and supplies required project information and source files.
- The operating sequence is purchase, onboarding, scope validation, production, review, quality assurance, packaging, and final delivery.
- The final deliverable is the completed organized cover package, not the immediate handbook download.

## Product 2 — Canonical Digital-Download Product

| Field | Verified value |
|---|---|
| Title | AI Image Mastery™ |
| Product GID | `gid://shopify/Product/9022950998170` |
| Handle | `ai-image-mastery` |
| Status | Active |
| Vendor | Mindset Media Group |
| Product type | Blank |
| Featured media | Shopify-hosted 2:3 portrait cover |
| Total media | 1 image |
| Inventory | 0; digital product |
| SKU coverage | No SKU |

### Variant

| Variant | Variant GID | Price |
|---|---|---:|
| Default Title | `gid://shopify/ProductVariant/48655433498778` | $9.95 |

### Verified Delivery Contract

- One-time purchase.
- Digital delivery follows successful checkout.
- The product is positioned for immediate application inside an active creator workflow.
- The page connects the product to the broader MMG learning journey and Knowledge Library.

## Collection — Canonical Live Catalog

| Field | Verified value |
|---|---|
| Title | Catalog |
| Collection GID | `gid://shopify/Collection/361394503834` |
| Handle | `frontpage` |
| Type | Manual |
| Sort order | Best selling |
| Product count | 2 |
| Image | Shopify-hosted collection image |

The collection contains both verified live products.

## Structural Findings

### 1. Executable storefront source is stored in product descriptions

Both live product `descriptionHtml` fields contain complete HTML, CSS, and JavaScript storefront implementations. Treat product descriptions as deployable source code, not ordinary merchandising copy.

Required consequence:

- Never perform a partial description edit.
- Read and preserve the complete current source before replacement.
- Validate HTML, Liquid assumptions, JavaScript behavior, accessibility, links, purchase controls, responsive behavior, and rollback material before approval.
- Store the full approved replacement source in GitHub before any live update.

### 2. Product classification is incomplete

Both products have blank Shopify product-type fields. Tags provide useful classification, but automation should not rely on tags alone as the permanent product contract.

### 3. SKU coverage is incomplete

All live variants have null SKUs. This does not prevent sales, but it weakens deterministic automation, reconciliation, analytics, and cross-system mapping.

### 4. Catalog references exceed the live catalog

The product-page source contains links and fallback cards for additional products and services that are not present in the current two-product catalog. A separate link-validation pass is required before those references are treated as live inventory.

### 5. Subscription contract is not yet implemented

No live subscription product or selling-plan structure was found. The approved subscription contract is documented separately as a target state and must pass validation before creation.

## Baseline Rule

This file is a dated snapshot, not a substitute for a live read. Every operational task must retrieve the current Shopify state before making a decision or proposing a mutation.
