# MMG Shopify Money Normalization v1.0

## Incident

Two live MMG product pages displayed prices 100 times too high in custom purchase modules:

- AI Image Mastery™ rendered `$995.00` instead of `$9.95`.
- The Professional tier of Professional Cover Design Service™ rendered `$39795.00` instead of `$397.95`.

The Shopify variant prices remained correct. The defect was caused by ambiguous client-side formatting that attempted to infer whether a value represented cents or major currency units from its JavaScript type, digit shape, or magnitude.

## Doctrine

Money units are determined by the trusted source contract, never guessed from the value.

| Source | Unit | Formatter |
|---|---|---|
| `/products/<handle>.js` | integer cents | `formatShopifyCents` |
| `/products.json` | decimal major units | `formatShopifyDecimal` |
| Admin GraphQL `Money`/`MoneyV2.amount` | decimal major units | `formatShopifyDecimal` |

Examples:

```text
995 cents       → $9.95
"995" cents     → $9.95
"9.95" decimal  → $9.95
39795 cents     → $397.95
"397.95" decimal → $397.95
```

`995` is intentionally interpreted differently under the two explicit source contracts. The formatter must not guess which contract applies.

## Fail-closed behavior

The source-aware normalizers reject malformed, negative, fractional-cent, and source-incompatible values. Callers may provide a customer-safe fallback such as `Unavailable`. A rejected value must not be silently transformed into another price.

## Live repair sequence

1. Confirm the authoritative Shopify variants and prices.
2. Refresh the affected product records without changing the price values.
3. Verify native Shopify and custom purchase surfaces.
4. Replace ambiguous page-level and carousel formatters with the shared source-aware implementation.
5. Run regression tests for `$4.95`, `$9.95`, `$14.95`, `$97.95`, `$197.95`, and `$397.95`.
6. Verify cart and checkout against the selected variant.

## Scope boundary

This repair changes display normalization only. It does not authorize a catalog-price change, product-status change, variant replacement, discount, compare-at-price update, or Shopify publication change.
