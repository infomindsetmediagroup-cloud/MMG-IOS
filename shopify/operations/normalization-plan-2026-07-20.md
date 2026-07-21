# Shopify Product Metadata Normalization Plan

Status: **prepared, validated, not approved, not executed**

Change-set ID: `shopify-product-normalization-20260720`

This plan normalizes only the blank Shopify product-type fields and missing live variant SKUs identified during the verified 2026-07-20 baseline. It does not alter customer-facing copy, pricing, handles, tags, options, media, inventory tracking, shipping requirements, publication state, collections, selling plans, or executable product-page source.

## Exact Proposed Changes

| Product | Current product type | Proposed product type |
|---|---:|---|
| Professional Cover Design Service™ | blank | `Publishing Service` |
| AI Image Mastery™ | blank | `Digital Download` |

| Product | Variant | Current SKU | Proposed SKU |
|---|---|---:|---|
| Professional Cover Design Service™ | Starter | null | `MMG-SVC-PCD-STA` |
| Professional Cover Design Service™ | Growth | null | `MMG-SVC-PCD-GRO` |
| Professional Cover Design Service™ | Professional | null | `MMG-SVC-PCD-PRO` |
| AI Image Mastery™ | Default Title | null | `MMG-DIG-AIM-STD` |

## SKU Contract

Canonical structure:

```text
MMG-{ARCHETYPE}-{PRODUCT_CODE}-{VARIANT_CODE}
```

Codes used in this change set:

- `SVC` — service product
- `DIG` — digital-download product
- `PCD` — Professional Cover Design
- `AIM` — AI Image Mastery
- `STA`, `GRO`, `PRO`, `STD` — Starter, Growth, Professional, Standard

SKU rules:

1. Uppercase ASCII letters, numbers, and hyphens only.
2. No price, date, customer, channel, or mutable marketing language.
3. A SKU is immutable after assignment unless collision repair is required.
4. Every live variant must have one unique SKU.
5. Future subscription SKUs should use `MMG-SUB-{PRODUCT_CODE}-{CADENCE_CODE}` with `MON`, `BI`, and `WEE` cadence codes after the subscription architecture is finalized.

## Verified Preconditions

The preflight read returned:

- Professional Cover Design Service™
  - product GID: `gid://shopify/Product/9024288620698`
  - expected handle: `professional-cover-design-service`
  - expected `updatedAt`: `2026-07-20T18:15:29Z`
  - expected product type: blank
  - all three expected variant SKUs: null
  - inventory tracking: false
  - requires shipping: false
- AI Image Mastery™
  - product GID: `gid://shopify/Product/9022950998170`
  - expected handle: `ai-image-mastery`
  - expected `updatedAt`: `2026-07-20T17:49:52Z`
  - expected product type: blank
  - expected variant SKU: null
  - inventory tracking: false
  - requires shipping: false

The executor must abort before mutation if any product timestamp, handle, product type, variant ID, price, SKU, inventory tracking flag, or shipping flag differs from the manifest.

## Validated GraphQL Artifacts

- [`graphql/product-normalization-preflight.graphql`](./graphql/product-normalization-preflight.graphql)
- [`graphql/product-normalization-forward.graphql`](./graphql/product-normalization-forward.graphql)
- [`graphql/product-normalization-rollback.graphql`](./graphql/product-normalization-rollback.graphql)
- [`manifests/product-normalization-2026-07-20.json`](./manifests/product-normalization-2026-07-20.json)

All three GraphQL documents passed Shopify Admin GraphQL schema validation on 2026-07-20.

## Controlled Execution Sequence

1. Obtain explicit approval for change-set `shopify-product-normalization-20260720`.
2. Run the preflight query immediately before mutation.
3. Compare every returned field against the manifest; abort on any mismatch.
4. Run the forward mutation once.
5. Reject the deployment if any top-level GraphQL error or Shopify `userErrors` value is returned.
6. Read both products again and verify exact product types, SKUs, prices, inventory tracking, shipping requirements, handles, and active status.
7. Record returned product and inventory-item state in the change receipt.
8. If verification fails, run the rollback mutation and verify restoration to blank product types and null SKUs.

## Approval Boundary

This document is not approval. The mutations remain prohibited until the user explicitly authorizes the exact change-set ID. Approval of product metadata normalization does not authorize link redirects, product-page source replacement, subscription creation, price changes, or any other Shopify mutation.
