# Deployment

## Current architecture

The verified theme containing `product.mmg-ai-image-mastery.json` is now MAIN. The product remains deliberately unassigned so the legacy `descriptionHtml` continues to render until the governed product-specific mutation is approved.

## Production theme

- Theme: MMG Digital Download Candidate 2026-07-20
- GID: `gid://shopify/OnlineStoreTheme/155338309786`
- Prefix: `/t/18`
- Role: MAIN
- Processing failed: false
- All four digital-download files match their expected checksums.
- All four canonical service-product files remain present.

## Remaining approval boundary

Send exactly:

`Approve production deployment: shopify-canonical-digital-download-ai-image-mastery-20260721`

After that approval:

1. Re-read product identity, variant identity, MAIN role, and all checksums.
2. Assign `templateSuffix: mmg-ai-image-mastery` only to `gid://shopify/Product/9022950998170`.
3. Verify the product timestamp and unchanged commercial fields.
4. Verify the public product page, responsive layout, cart hydration, and customer routes.
5. Record and merge the immutable production-execution evidence.

## Rollback

- Product rollback: set `templateSuffix` back to `null`.
- Theme rollback: republish `/t/17` if the current MAIN publication must be reversed.
- Secondary rollback: `/t/10` remains available.
- Existing `descriptionHtml` remains unchanged.
