# Shopify Product-Page Internal-Link Audit

Status: **verified read-only audit; remediation prepared, not approved, not executed**

Observed: 2026-07-20

## Audit Scope

The audit checked every internal page and product route referenced by the two live executable product-page descriptions against:

1. live Shopify products;
2. live Shopify pages; and
3. current Shopify URL redirects.

## Verified Live Destinations

| Route | Resource | State |
|---|---|---|
| `/` | storefront home | live |
| `/cart` | Shopify cart | live platform route |
| `/collections/all` | catalog route | live |
| `/pages/free-creator-toolkit` | Free Creator Toolkit | published |
| `/pages/capcut-templates` | CapCut Templates | published |

## Non-Live Product Destinations

The following routes are referenced by live product-page source, but no product exists at the handle and no redirect exists from the exact path:

| Route | Referenced from |
|---|---|
| `/products/publish-ready-book-build-service` | Professional Cover Design Service™ |
| `/products/listing-optimization-service` | Professional Cover Design Service™ |
| `/products/visual-asset-production-service` | Professional Cover Design Service™ |
| `/products/research-content-enhancement-service` | Professional Cover Design Service™ |
| `/products/the-creators-bible` | AI Image Mastery™ |
| `/products/ai-prompting-for-beginners` | AI Image Mastery™ |

Existing redirects from older source paths to `/products/the-creators-bible` and `/products/ai-prompting-for-beginners` do not resolve the problem because the redirect targets themselves are not live.

## Remediation Decision

Link remediation is separated from product metadata normalization.

The prepared low-risk interim action is to create six temporary redirects from the non-live product routes to `/collections/all`. This avoids replacing the complete executable `descriptionHtml` source solely to repair links.

The temporary redirects must be removed immediately before a real product is created at any reserved canonical handle.

## Prepared Redirect Batch

Change-set ID: `shopify-temporary-dead-link-redirects-20260720`

- Forward mutation: [`graphql/temporary-dead-link-redirects-forward.graphql`](./graphql/temporary-dead-link-redirects-forward.graphql)
- Rollback mutation: [`graphql/temporary-dead-link-redirects-rollback.graphql`](./graphql/temporary-dead-link-redirects-rollback.graphql)
- Manifest: [`manifests/temporary-dead-link-redirects-2026-07-20.json`](./manifests/temporary-dead-link-redirects-2026-07-20.json)

Both GraphQL documents passed Shopify Admin GraphQL schema validation on 2026-07-20.

## Redirect Execution Controls

1. Separate explicit approval is required for this redirect batch.
2. Immediately before creation, verify that each product handle remains absent and each source redirect remains absent.
3. Abort the entire batch on any pre-existing product or redirect collision.
4. Capture every returned redirect GID in the execution receipt.
5. Verify all six routes return a redirect to `/collections/all` after mutation.
6. Rollback uses the captured redirect GIDs and deletes only the six created records.
7. Before creating a future product at one of these handles, delete and verify removal of the corresponding temporary redirect.

## Long-Term Resolution

The permanent resolution is to publish the referenced canonical products or replace the links during a governed full-source product-page deployment. Temporary redirects must not be treated as substitutes for the product roadmap.
