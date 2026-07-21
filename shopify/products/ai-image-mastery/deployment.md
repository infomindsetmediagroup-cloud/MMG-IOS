# Deployment

## Production architecture

The verified MAIN theme contains `product.mmg-ai-image-mastery.json`, and AI Image Mastery™ is assigned to that dedicated template.

## Execution

- Approval: `Approve production deployment: shopify-canonical-digital-download-ai-image-mastery-20260721`
- Product: `gid://shopify/Product/9022950998170`
- Mutation: `productUpdate`
- Field changed: `templateSuffix`
- Before: `null`
- After: `mmg-ai-image-mastery`
- Executed: `2026-07-21T04:29:15Z`
- Shopify user errors: none

## Production theme

- Theme: MMG Digital Download Candidate 2026-07-20
- GID: `gid://shopify/OnlineStoreTheme/155338309786`
- Prefix: `/t/18`
- Role: MAIN
- Processing failed: false
- All four digital-download files match their governed checksums.
- Canonical service-product files remain preserved.

## Protected state

The deployment did not change title, handle, status, vendor, product type, variant identity, SKU, price, compare-at price, inventory policy, inventory quantity, tracking, shipping, media, publication, SEO, tags, or `descriptionHtml`.

## Storefront observation

The public edge response observed immediately after assignment still contained the pre-assignment shell. Shopify Admin independently confirmed the assigned template and all production checksums. The observation is classified as cache or template propagation; it did not trigger rollback.

## Rollback

- Product rollback: set `templateSuffix` back to `null`.
- Theme rollback: republish `/t/17` if the current MAIN publication must be reversed.
- Secondary rollback: `/t/10` remains available.
- Existing `descriptionHtml` remains unchanged.
