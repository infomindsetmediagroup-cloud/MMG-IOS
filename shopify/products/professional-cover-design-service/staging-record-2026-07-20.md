# Canonical Service Product Staging Record — 2026-07-20

## Status

**State:** `staged-static-and-server-verified-render-qa-pending`

**Source change set:** `shopify-canonical-service-product-source-20260721`

The Professional Cover Design Service™ candidate has been deployed only to a fresh unpublished duplicate of the current MAIN theme. No production product assignment, product description, price, SKU, inventory, shipping, publication, redirect, or MAIN-theme publication change was made.

Production deployment is not authorized. Any later production action must explicitly name `shopify-canonical-service-product-source-20260721`.

## Staging Theme

- Theme: `MMG Service Staging 2026-07-20`
- Theme GID: `gid://shopify/OnlineStoreTheme/155335557274`
- Role: `UNPUBLISHED`
- Theme prefix: `/t/16`
- Duplicated from: `gid://shopify/OnlineStoreTheme/155242856602`
- Processing: complete
- Processing failure: false

Isolated preview path:

`/t/16/products/professional-cover-design-service?view=mmg-professional-cover-design`

The available browser and download tools rejected the authenticated unpublished-theme route at their URL-safety gate before retrieval. No Shopify route failure was observed. Consequently, browser-rendered acceptance checks remain pending and are not represented as passed.

## Reconciled Preflight

The deployment manifest expected product `updatedAt` value `2026-07-21T00:26:42Z`. The fresh preflight returned `2026-07-21T00:56:35Z`, triggering the required abort-and-investigate path.

A deeper comparison verified that product identity, SEO, prices, SKUs, option structure, publication, collection membership, inventory, shipping, media IDs, and media dimensions were unchanged. The timestamp movement was reconciled to descriptive alt-text and Shopify CDN filename updates on the same three supporting media records:

| Media GID | Reconciled filename | Observed change |
|---|---|---|
| `gid://shopify/MediaImage/37559744790682` | `starter.png` | Descriptive alt text and CDN filename |
| `gid://shopify/MediaImage/37559748755610` | `growth.png` | Descriptive alt text and CDN filename |
| `gid://shopify/MediaImage/37559753310362` | `professional.png` | Descriptive alt text and CDN filename |

The reconciled product baseline is `2026-07-21T00:56:35Z`.

## Staged Files

Only these four files were created or updated in the unpublished staging theme:

| File | Content type | MD5 | Bytes |
|---|---|---|---:|
| `assets/mmg-professional-cover-design.css` | `text/css` | `19a0676ec927c3e649db64a6e11a9c98` | 11,943 |
| `assets/mmg-professional-cover-design.js` | `application/javascript` | `db464655bddaf9a73906e49df8762a66` | 6,549 |
| `sections/mmg-professional-cover-design.liquid` | `application/x-liquid` | `f5090c30a9e202c056cf8c3a40b690ff` | 13,480 |
| `templates/product.mmg-professional-cover-design.json` | `application/json` | `d8804eeb80b0f2aa7a1eb1c373841b21` | 140 |

All writes returned zero Shopify user errors. Readback returned the same four files, checksums, sizes, and content types with zero read errors.

### Staging hardening completed

Static review caught and corrected two staging-only implementation risks before acceptance:

1. Generic MMG class selectors were strengthened so every candidate selector is rooted under `#mmg-professional-cover-design`.
2. Parser-dependent `image_tag` data-attribute syntax was replaced with explicit responsive Liquid image markup, including `srcset`, intrinsic dimensions, contained portrait rendering, eager loading, high fetch priority, and a no-image fallback.

## Product and Commerce Verification

The production product remains:

- Product GID: `gid://shopify/Product/9024288620698`
- Handle: `professional-cover-design-service`
- Status: `ACTIVE`
- Product type: `Publishing Service`
- Template suffix: `null`
- Current live source: legacy `descriptionHtml`

All three variants remain available for sale and preserve the canonical service contract:

| Tier | Variant GID | SKU | Price | Tracked | Shipping |
|---|---|---|---:|---|---|
| Starter | `gid://shopify/ProductVariant/48658205376666` | `MMG-SVC-PCD-STA` | 97.95 USD | false | false |
| Growth | `gid://shopify/ProductVariant/48658205409434` | `MMG-SVC-PCD-GRO` | 197.95 USD | false | false |
| Professional | `gid://shopify/ProductVariant/48658205442202` | `MMG-SVC-PCD-PRO` | 397.95 USD | false | false |

The staging JavaScript reads `/products/professional-cover-design-service.js`, resolves the live numeric variant IDs by exact tier name, starts all purchase controls disabled, and enables a tier only after safe hydration. The `/cart/add.js` write exists only inside a customer click handler.

## Route Verification

Published canonical journey pages were re-read successfully:

- `/pages/customer-portal` — `gid://shopify/Page/127626608794`
- `/pages/customer-service` — `gid://shopify/Page/127629197466`

The four reserved related-service paths retain their verified temporary redirects to `/collections/all`:

| Redirect GID | Reserved path |
|---|---|
| `gid://shopify/UrlRedirect/444925313178` | `/products/publish-ready-book-build-service` |
| `gid://shopify/UrlRedirect/444925345946` | `/products/listing-optimization-service` |
| `gid://shopify/UrlRedirect/444925378714` | `/products/visual-asset-production-service` |
| `gid://shopify/UrlRedirect/444925411482` | `/products/research-content-enhancement-service` |

## QA Matrix

### Passed

- Shopify GraphQL schema validation for every query and mutation
- Fresh MAIN-theme duplication into an unpublished theme
- Theme processing and file-write health
- Exact file readback and checksum verification
- One-H1 and required-section static contract
- Root-scoped CSS after staging hardening
- Responsive breakpoint and reduced-motion static review
- Portrait image containment and Liquid-first image rendering
- Exact live variant IDs, SKUs, prices, availability, inventory, and shipping state
- Customer-click-only cart mutation and unresolved-variant blocking
- Customer Portal and customer-service route verification
- Reserved redirect integrity
- Production product and assignment unchanged
- MAIN theme remains MAIN; staging theme remains UNPUBLISHED

### Pending browser-rendered acceptance

- Horizontal-overflow checks at 320, 375, 768, 1024, and 1440 CSS pixels
- Actual native header and footer rendering
- Browser keyboard traversal and visible focus behavior
- Live client-side hydration in the unpublished preview
- Customer-click cart network request and cart response

These items remain pending because the available browser tooling rejected the unpublished authenticated preview URL before retrieval. They must be completed before production authorization.

## Rollback Boundary

At this stage, rollback is staging-only. It may remove only the four staged files listed above or delete the unpublished staging theme after this evidence is retained. No production rollback is required because production was not changed.

## Next Gate

1. Complete browser-rendered acceptance against the unpublished preview.
2. Record screenshots or equivalent rendered evidence at the required breakpoints.
3. Verify a deliberate customer-click cart addition in an isolated cart session.
4. Re-read the production product, MAIN theme, staging theme, and redirects.
5. Request explicit production approval naming `shopify-canonical-service-product-source-20260721`.

Until those conditions are satisfied, the candidate remains staged and unpublished.
