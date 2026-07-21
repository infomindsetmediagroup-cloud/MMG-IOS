# Canonical Service Product — Production Execution

## Result

**State:** `executed-verified`

**Change set:** `shopify-canonical-service-product-source-20260721`

Professional Cover Design Service™ is now assigned to the governed alternate Shopify product template.

## Authorization

The exact production authorization was received:

`Approve production deployment: shopify-canonical-service-product-source-20260721`

## Theme publication

Shopify’s connected API blocked `themePublish`, so the verified theme was published through the Shopify Admin owner boundary.

The following theme is now MAIN:

- **MMG Service Production Candidate 2026-07-20**
- GID: `gid://shopify/OnlineStoreTheme/155336671386`
- Prefix: `/t/17`
- Processing: complete
- Processing failure: none

The former MAIN theme remains available as the rollback theme:

- **Kairos Staging**
- GID: `gid://shopify/OnlineStoreTheme/155242856602`
- Role: `UNPUBLISHED`
- Prefix: `/t/10`

The stale `/t/16` candidate remains superseded and must not be published.

## Product template assignment

The validated `productUpdate` mutation changed only:

```text
Product: gid://shopify/Product/9024288620698
Template suffix: null → mmg-professional-cover-design
```

The mutation returned zero Shopify user errors. The product `updatedAt` value after assignment is:

`2026-07-21T03:16:38Z`

## Independent verification

The connected Shopify store was read again after mutation. Verification confirmed:

- Product remains `ACTIVE`.
- Product type remains `Publishing Service`.
- Product handle remains `professional-cover-design-service`.
- Template suffix is `mmg-professional-cover-design`.
- Starter remains $97.95 with SKU `MMG-SVC-PCD-STA`.
- Growth remains $197.95 with SKU `MMG-SVC-PCD-GRO`.
- Professional remains $397.95 with SKU `MMG-SVC-PCD-PRO`.
- All three variants remain available for sale.
- Inventory tracking remains disabled.
- Shipping remains disabled.
- Bundle components remain disabled.
- The legacy product `descriptionHtml` remains preserved for rollback and was not replaced.
- Customer Portal and Customer Service remain published.
- All four reserved service redirects remain intact.

## Theme-file verification

| File | MD5 | Bytes |
|---|---|---:|
| `assets/mmg-professional-cover-design.css` | `19a0676ec927c3e649db64a6e11a9c98` | 11,943 |
| `assets/mmg-professional-cover-design.js` | `db464655bddaf9a73906e49df8762a66` | 6,549 |
| `sections/mmg-professional-cover-design.liquid` | `f5090c30a9e202c056cf8c3a40b690ff` | 13,480 |
| `templates/product.mmg-professional-cover-design.json` | `6935d2e46128a36c8d5578ac1e62d50b` | 503 |

The normalized JSON template was semantically verified to contain one `main` section of type `mmg-professional-cover-design`, with `main` as the only ordered section.

## Public-document caveat

An external document reader returned a cached pre-deployment storefront document after Shopify had already verified the new MAIN theme and the product template assignment. That response is classified as `cache-inconclusive`; it is not treated as authoritative evidence of a failed deployment.

The Shopify Admin server state and independent post-mutation readback are the authoritative production record.

## Production change boundary

Changed:

- Owner-published MAIN theme
- Product template suffix for Professional Cover Design Service™

Unchanged:

- Product title
- Handle
- Status
- Product type
- Product description HTML
- Prices
- SKUs
- Inventory configuration
- Shipping configuration
- Media
- Product publication
- Redirects

## Rollback

1. Set the product template suffix back to `null`.
2. Publish former MAIN theme `gid://shopify/OnlineStoreTheme/155242856602` from Shopify Admin.
3. Re-run product, theme-file, route, and storefront verification.

No description restoration is currently required because `descriptionHtml` was not changed.
