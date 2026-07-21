# Canonical Service Product — Local Browser QA

## Classification

**Result:** `supplemental-local-browser-pass-live-preview-acceptance-pending`

**Source change set:** `shopify-canonical-service-product-source-20260721`

**Staging theme:** `gid://shopify/OnlineStoreTheme/155335557274` — `UNPUBLISHED`

This evidence supplements the Shopify server/static staging record. It does **not** replace the required authenticated unpublished-theme preview check and does not authorize production deployment.

## Method

The exact staged stylesheet and storefront behavior asset were re-read from Shopify and executed in headless Chromium. The harness used representative Liquid-rendered page markup with the same root ID, section classes, tier controls, purchase controls, native-shell boundaries, and customer-journey routes.

Shopify product hydration and cart endpoints were intercepted with contract-matching responses. No live cart, order, product, customer, theme, redirect, or production mutation occurred.

## Responsive matrix

| Width | Document width | Root width | Overflow | H1 | Image fit | Enabled tiers | Reveal fail-safe |
|---:|---:|---:|---|---:|---|---:|---|
| 320 | 320 | 320 | No | 1 | contain | 3 | Passed |
| 375 | 375 | 375 | No | 1 | contain | 3 | Passed |
| 768 | 768 | 768 | No | 1 | contain | 3 | Passed |
| 1024 | 1024 | 1024 | No | 1 | contain | 3 | Passed |
| 1440 | 1440 | 1440 | No | 1 | contain | 3 | Passed |

## Functional checks

- Growth remains the default selected tier.
- Product hydration activates exactly three available package buttons.
- Availability changes to `Available now`.
- A keyboard-focused MMG action receives a 3-pixel solid focus outline.
- Growth tier selection responds to Enter.
- The mocked cart request contains exactly `{ "id": 48658205409434, "quantity": 1 }`.
- The success message is `Growth was added to your cart.`
- Reduced-motion mode leaves content visible with no transform dependency.
- The 2.2-second reveal fail-safe leaves zero hidden reveal elements at every tested width.

## Limitations

- The authenticated Shopify unpublished preview was not rendered because the available remote browser rejected the unpublished route and the execution container cannot reach external storefront networking.
- Native Shopify header and footer behavior remains a live-preview acceptance item; local shell elements were used only to verify candidate isolation and non-overlap.
- Product and cart network responses were intercepted mocks. A deliberate isolated live cart-add remains required before production approval.

## Governance boundary

The authoritative staging state remains:

`staged-static-and-server-verified-render-qa-pending`

Production authorization remains false. The remaining gate is authenticated unpublished-preview rendering, including native header/footer verification and one isolated real cart-add. Any later production action must explicitly name:

`shopify-canonical-service-product-source-20260721`
