# MMG Shopify Money Normalization QA

## Authoritative catalog state

- [ ] AI Image Mastery™ variant remains exactly `$9.95`.
- [ ] Professional Cover Design Service™ Starter remains exactly `$97.95`.
- [ ] Growth remains exactly `$197.95`.
- [ ] Professional remains exactly `$397.95`.
- [ ] Product, variant, SKU, status, and selling configuration remain unchanged.

## Unit contracts

- [ ] `/products/<handle>.js` values are passed only to `formatShopifyCents`.
- [ ] `/products.json` values are passed only to `formatShopifyDecimal`.
- [ ] Admin GraphQL amounts are passed only to `formatShopifyDecimal`.
- [ ] No formatter guesses units from JavaScript type.
- [ ] No formatter guesses units from digit-only strings.
- [ ] No formatter guesses units from amount magnitude.

## Regression matrix

- [ ] `495` cents renders `$4.95`.
- [ ] `995` cents renders `$9.95`.
- [ ] `1495` cents renders `$14.95`.
- [ ] `9795` cents renders `$97.95`.
- [ ] `19795` cents renders `$197.95`.
- [ ] `39795` cents renders `$397.95`.
- [ ] Decimal strings `4.95`, `9.95`, `14.95`, `97.95`, `197.95`, and `397.95` preserve their decimal values.
- [ ] Malformed or source-incompatible inputs return the configured fallback.

## Product-page verification

- [ ] AI Image Mastery hero CTA shows `$9.95`.
- [ ] AI Image Mastery purchase price shows `$9.95`.
- [ ] AI Image Mastery add-to-cart controls show `$9.95`.
- [ ] Cover Design Starter card shows `$97.95`.
- [ ] Cover Design Growth card shows `$197.95`.
- [ ] Cover Design Professional card shows `$397.95`.
- [ ] Cover Design final CTA follows the selected tier price.
- [ ] Mobile Safari and desktop render the same values.
- [ ] Catalog carousel values do not gain or lose a factor of 100.

## Transaction verification

- [ ] The selected Shopify variant ID is correct.
- [ ] Cart line price matches the product-page display.
- [ ] Checkout price matches the cart and variant.
- [ ] No discount or compare-at-price mutation was introduced.
