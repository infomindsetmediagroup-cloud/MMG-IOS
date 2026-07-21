# Canonical Service Product — Production Checkpoint

## Status

**State:** `approved-preflight-passed-theme-publish-blocked-manual-action-required`

**Change set:** `shopify-canonical-service-product-source-20260721`

The exact production authorization was received and accepted:

`Approve production deployment: shopify-canonical-service-product-source-20260721`

## Fresh preflight

The production preflight passed before any mutation attempt:

- Product identity, handle, type, status, template suffix, SEO, options, variants, media, prices, SKUs, inventory, and shipping matched the governed baseline.
- Customer Portal and Customer Service remained published.
- All four reserved service redirects remained intact.
- The unpublished candidate theme remained healthy and contained the exact four staged files and checksums.
- The current MAIN theme did not contain the alternate product template or its assets.
- The full legacy `descriptionHtml` was captured as the rollback source.

## Publication boundary

The `themePublish` mutation passed Shopify schema validation but was blocked by the connected host policy:

> Publishing a theme is blocked — making a theme live must be done manually in Shopify admin to prevent accidental storefront changes.

No product template assignment was attempted. Assigning `mmg-professional-cover-design` while the verified theme remains unpublished would make the live product depend on files absent from the current MAIN theme.

No fallback `descriptionHtml` replacement was attempted. The approved deployment path uses the governed dedicated-template architecture, and the system will not silently revert to coupled executable source.

## Required manual action

Open Shopify Themes:

`https://admin.shopify.com/store/07kd8e-qw/themes`

Publish:

**MMG Service Staging 2026-07-20**

Theme GID: `gid://shopify/OnlineStoreTheme/155335557274`

After publication, Kairos must:

1. Confirm that theme `155335557274` is MAIN.
2. Confirm the former MAIN theme remains available for rollback.
3. Re-read and verify all four candidate file checksums from the new MAIN theme.
4. Re-run the product and route preflight.
5. Assign `templateSuffix: mmg-professional-cover-design` only to product `gid://shopify/Product/9024288620698`.
6. Verify the live product and record the exact production result.

## Current production state

No production product, description, template assignment, price, SKU, inventory, shipping, publication, or redirect field was changed by this execution.
