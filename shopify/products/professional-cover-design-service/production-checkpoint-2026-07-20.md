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
- The full legacy `descriptionHtml` was captured as the rollback source.
- The current MAIN theme did not contain the alternate product template or assets.

## Publication boundary

The `themePublish` mutation passed Shopify schema validation but was blocked by the connected host policy:

> Publishing a theme is blocked — making a theme live must be done manually in Shopify admin to prevent accidental storefront changes.

No product template assignment was attempted. Assigning `mmg-professional-cover-design` before its theme becomes MAIN would create an unsafe production dependency.

No fallback `descriptionHtml` replacement was attempted. The approved deployment path uses the governed dedicated-template architecture, and the system will not silently revert to coupled executable source.

## Stale candidate superseded

The original unpublished theme was cloned before newer changes reached the current MAIN theme:

- **Do not publish:** `MMG Service Staging 2026-07-20`
- Theme GID: `gid://shopify/OnlineStoreTheme/155335557274`
- Prefix: `/t/16`

Publishing that older clone could overwrite newer storefront work.

A new production candidate was therefore duplicated from the current MAIN theme and received only the four verified canonical service files.

## Correct manual action

Open Shopify Themes:

`https://admin.shopify.com/store/07kd8e-qw/themes`

Publish exactly:

**MMG Service Production Candidate 2026-07-20**

- Theme GID: `gid://shopify/OnlineStoreTheme/155336671386`
- Prefix: `/t/17`
- Role: `UNPUBLISHED`
- Duplicated from current MAIN: `gid://shopify/OnlineStoreTheme/155242856602`
- Processing complete: yes
- Processing failed: no

Verified candidate files:

| File | MD5 | Bytes |
|---|---|---:|
| `assets/mmg-professional-cover-design.css` | `19a0676ec927c3e649db64a6e11a9c98` | 11,943 |
| `assets/mmg-professional-cover-design.js` | `db464655bddaf9a73906e49df8762a66` | 6,549 |
| `sections/mmg-professional-cover-design.liquid` | `f5090c30a9e202c056cf8c3a40b690ff` | 13,480 |
| `templates/product.mmg-professional-cover-design.json` | `6935d2e46128a36c8d5578ac1e62d50b` | 503 |

Shopify normalized the JSON template serialization during save. Its semantic structure was re-read and verified: one `main` section using `mmg-professional-cover-design`, with `main` as the only ordered section.

After publication, Kairos must:

1. Confirm theme `155336671386` is MAIN.
2. Confirm former MAIN theme `155242856602` remains available for rollback.
3. Re-read and verify all four candidate files from the new MAIN theme.
4. Re-run the product and route preflight.
5. Assign `templateSuffix: mmg-professional-cover-design` only to product `gid://shopify/Product/9024288620698`.
6. Verify the live product and record the exact production result.

## Repository validation

This checkpoint is enforced by the canonical service-product validator. The validation PR executes the repository’s Shopify governance checks against the corrected fresh candidate and does not publish a theme or assign a product template.

## Current production state

No production product, description, template assignment, price, SKU, inventory, shipping, publication, or redirect field was changed by this execution.
