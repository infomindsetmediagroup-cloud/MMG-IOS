# Shopify Production Execution Record — 2026-07-20

## Authorization

Executive instruction: `Push thru`

Interpreted as explicit approval for both independently prepared change sets:

1. `shopify-product-normalization-20260720`
2. `shopify-temporary-dead-link-redirects-20260720`

## Store

- Name: Mindset Media Group
- Primary domain: `themindsetmediagroup.com`
- Execution date: 2026-07-20 PDT / 2026-07-21 UTC

## Preflight

The production preflight matched the prepared snapshot exactly before mutation:

- both products remained ACTIVE;
- product-type fields remained blank;
- all four SKUs remained null;
- handles, product IDs, variant IDs, and inventory-item IDs matched;
- prices remained 97.95, 197.95, 397.95, and 9.95 USD;
- inventory tracking remained disabled;
- shipping remained disabled;
- all six reserved redirect paths had no existing exact-path redirect.

## Executed Change Set A

ID: `shopify-product-normalization-20260720`

### Product types

- `professional-cover-design-service`: `Publishing Service`
- `ai-image-mastery`: `Digital Download`

### SKUs

- Starter: `MMG-SVC-PCD-STA`
- Growth: `MMG-SVC-PCD-GRO`
- Professional: `MMG-SVC-PCD-PRO`
- AI Image Mastery default variant: `MMG-DIG-AIM-STD`

### Result

- Shopify user errors: 0
- Service product updatedAt: `2026-07-21T00:26:42Z`
- Digital product updatedAt: `2026-07-21T00:26:43Z`
- Prices unchanged
- Handles unchanged
- Product statuses remain ACTIVE
- Inventory tracking remains false
- Requires shipping remains false

## Executed Change Set B

ID: `shopify-temporary-dead-link-redirects-20260720`

| Redirect ID | Source path | Target |
|---|---|---|
| `gid://shopify/UrlRedirect/444925313178` | `/products/publish-ready-book-build-service` | `/collections/all` |
| `gid://shopify/UrlRedirect/444925345946` | `/products/listing-optimization-service` | `/collections/all` |
| `gid://shopify/UrlRedirect/444925378714` | `/products/visual-asset-production-service` | `/collections/all` |
| `gid://shopify/UrlRedirect/444925411482` | `/products/research-content-enhancement-service` | `/collections/all` |
| `gid://shopify/UrlRedirect/444925444250` | `/products/the-creators-bible` | `/collections/all` |
| `gid://shopify/UrlRedirect/444925477018` | `/products/ai-prompting-for-beginners` | `/collections/all` |

### Result

- Shopify user errors: 0
- All six redirects were re-read by exact Shopify GID.
- Every source path and target matched the approved operation.

## Post-change Verification

Verification passed for all intended fields and safeguards:

- exact product types present;
- exact four SKUs present and unique;
- original prices preserved;
- handles preserved;
- products remain ACTIVE;
- tracking remains disabled;
- shipping remains disabled;
- six exact redirect records present;
- each redirect targets `/collections/all`.

## Rollback Boundary

Product rollback restores the blank product-type fields and null SKUs captured in the preflight snapshot.

Redirect rollback may delete only the six Shopify redirect GIDs recorded above. Each temporary redirect must be retired before a real product is created at its reserved handle.
