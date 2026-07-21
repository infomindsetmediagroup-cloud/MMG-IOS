# Verified Live Baseline — 2026-07-20 PDT

## Product identity

| Field | Verified value |
|---|---|
| Product | Professional Cover Design Service™ |
| Product GID | `gid://shopify/Product/9024288620698` |
| Handle | `professional-cover-design-service` |
| Status | `ACTIVE` |
| Vendor | Mindset Media Group |
| Product type | Publishing Service |
| Published | `2026-07-06T02:53:01Z` |
| Last verified update | `2026-07-21T00:26:42Z` |
| Template suffix | none |
| Inventory tracking | disabled |
| Shipping | disabled |
| Selling plan required | no |

## Commercial tiers

| Tier | Variant GID | SKU | Price |
|---|---|---|---:|
| Starter | `gid://shopify/ProductVariant/48658205376666` | `MMG-SVC-PCD-STA` | $97.95 |
| Growth | `gid://shopify/ProductVariant/48658205409434` | `MMG-SVC-PCD-GRO` | $197.95 |
| Professional | `gid://shopify/ProductVariant/48658205442202` | `MMG-SVC-PCD-PRO` | $397.95 |

## Live implementation

The current customer page is implemented as a complete HTML/CSS/JavaScript application inside Shopify `descriptionHtml`. It currently performs:

- native product-shell suppression and ancestor normalization;
- full-page branded rendering;
- live product JSON hydration;
- tier-to-variant mapping;
- customer-initiated `/cart/add.js` requests;
- Judge.me mounting;
- related-resource carousel loading;
- smooth section navigation and back-to-top behavior;
- reveal animation with reduced-motion fallback;
- temporary links to reserved product handles.

## Risks being corrected by the candidate

1. Presentation, commerce behavior, and shell manipulation are coupled in one database field.
2. The implementation cannot receive ordinary source review or automated testing before a Shopify edit.
3. A description edit can alter cart behavior and page structure simultaneously.
4. Four product media assets currently have blank alt text.
5. Related product routes are not yet backed by live products and depend on temporary redirects.
6. The page uses broad native-shell suppression that requires regression testing against theme changes.

## No-change boundary

This branch does not alter the live description, theme, prices, variants, inventory, publishing status, collection membership, media, SEO, or redirect records.
