# Deployment and Rollback Procedure

## Change-set ID

`shopify-canonical-service-product-source-20260721`

## Current state

`prepared-not-approved-not-executed`

## Preferred target architecture

Deploy the governed source through a dedicated Shopify product template or theme section on an unpublished theme, then preview and QA it before publication. Do not use the live product description as the long-term application runtime.

## Preflight

1. Re-read product `gid://shopify/Product/9024288620698`.
2. Abort unless title, handle, status, product type, `updatedAt`, variants, SKUs, prices, tracking, shipping, and publication state match `contract.json`.
3. Re-read the current `descriptionHtml` and store it as the rollback payload.
4. Verify all four reserved routes still resolve through the recorded temporary redirects.
5. Validate the candidate HTML, CSS, JavaScript, and any Admin GraphQL with Shopify AI Toolkit.

## Staging rollout

1. Add the candidate to an unpublished theme/template.
2. Bind it only to a preview or staging product context.
3. Test responsive layout, native header/footer, product hydration, all tier mappings, cart addition, Judge.me fallback, keyboard flow, reduced motion, and route behavior.
4. Record screenshots and a QA result.

## Production approval boundary

Production deployment requires explicit approval naming:

`shopify-canonical-service-product-source-20260721`

Approval must identify whether the operation will:

- update `descriptionHtml`; or
- assign/publish a dedicated product template or theme section.

## Post-deployment verification

- Product remains ACTIVE.
- Product type, variants, SKUs, prices, shipping, and tracking are unchanged.
- Exactly one H1 is visible.
- All three tier buttons map to the intended live variants.
- A customer-initiated cart test succeeds for the selected tier.
- Header, footer, mobile layout, reduced motion, reviews, and recommendations remain functional.
- All temporary redirects remain intact.

## Rollback

- For a description deployment: restore the exact preflight `descriptionHtml` snapshot.
- For a template deployment: reassign the prior template and unpublish the candidate theme/template.
- Re-run the complete post-change verification against the restored state.

## Prohibited shortcuts

- No direct live-theme file write.
- No deployment without a captured rollback source.
- No changes to prices, inventory, media, product status, publication, or redirect records in this change set.
