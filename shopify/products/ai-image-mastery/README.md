# AI Image Mastery™ — Canonical MMG Digital-Download Product

This directory defines the first canonical MMG digital-download product contract.

## Change set

`shopify-canonical-digital-download-ai-image-mastery-20260721`

## Current state

- Theme `/t/18` is MAIN and contains the checksum-verified digital-download files plus the preserved canonical service files.
- Former MAIN `/t/17` remains UNPUBLISHED for rollback.
- The exact production approval was received and recorded.
- AI Image Mastery™ now has `templateSuffix: mmg-ai-image-mastery`.
- Shopify returned zero mutation errors and independently confirmed the assigned suffix.
- Product title, handle, status, type, price, SKU, variant, inventory, shipping, SEO, tags, media, and legacy `descriptionHtml` were preserved.
- The public edge response observed immediately after assignment still contained the pre-assignment shell; this is tracked as cache/template propagation and does not alter the verified Admin deployment state.

## Authoritative product contract

- Product: `gid://shopify/Product/9022950998170`
- Variant: `gid://shopify/ProductVariant/48655433498778`
- Inventory item: `gid://shopify/InventoryItem/50671454027930`
- Price: `$9.95`
- SKU: `MMG-DIG-AIM-STD`
- Inventory policy: `DENY`
- Inventory tracking: disabled
- Shipping: disabled

## Canonical digital-download rules

1. One purchase grants one personal-use license.
2. The digital files are the finished product.
3. No service intake or production queue is implied.
4. No physical shipment is required.
5. Live Shopify product data controls price, variant identity, and availability.
6. Cart writes occur only after a customer click.
7. Missing-delivery and access recovery route through Customer Service.
8. Legacy `descriptionHtml` remains untouched as rollback source.
9. Product title, handle, price, SKU, inventory, shipping, media, SEO, tags, and publication are protected fields.
10. Product rollback sets `templateSuffix` back to `null`.
