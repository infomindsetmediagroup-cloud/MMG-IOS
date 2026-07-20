# MMG Knowledge Subscription™ — Shopify Provisioning v1.0

**Status:** Approved implementation contract  
**Product authority:** `product-contract.json`  
**Commerce authority:** `registry/products/mmg-commerce-contract-v1.json`

## Objective

Provision one subscription-only Shopify product that exposes three customer-facing cadence variants while billing every customer monthly.

## Canonical Product

- **Title:** MMG Knowledge Subscription™
- **Handle:** `mmg-knowledge-subscription`
- **Vendor:** Mindset Media Group™
- **Product type:** Subscription
- **Shipping:** Not required
- **Inventory tracking:** Disabled
- **Purchase mode:** Selling plan required
- **Initial publication state:** Draft

## Canonical Variants

| Position | Variant | SKU | Monthly price | Packages per billing cycle | Assets per package | Assets per billing cycle |
|---:|---|---|---:|---:|---:|---:|
| 1 | Monthly | `MMG-KS-MONTHLY` | $14.95 | 1 | 2 | 2 |
| 2 | Bi-weekly | `MMG-KS-BIWEEKLY` | $24.95 | 2 | 2 | 4 |
| 3 | Weekly | `MMG-KS-WEEKLY` | $39.95 | 4 | 2 | 8 |

The variant option name is **Delivery cadence**.

## Selling-Plan Architecture

Use one shared selling-plan group and one shared monthly selling plan across all three variants.

- **Group name:** MMG Knowledge Subscription
- **Merchant code:** `mmg-knowledge-subscription-monthly-billing`
- **Selling-plan name:** Billed monthly
- **Category:** Subscription
- **Billing interval:** One month
- **Shopify delivery interval:** One month
- **Pricing adjustment:** None; exact recurring prices live on the variants

This deliberately separates two concepts:

1. Shopify bills once per month and maintains the subscription contract.
2. Kairos schedules one, two, or four digital packages within that monthly billing cycle according to the selected variant.

Do not create separate weekly or bi-weekly billing policies. The approved prices are monthly recurring prices.

## Provisioning Sequence

### 1. Create or reconcile the product

Create the product as draft with the exact title and handle. Set `requiresSellingPlan` to true so the product cannot be purchased as a one-time item.

### 2. Create the product option and variants

Create the **Delivery cadence** option with Monthly, Bi-weekly, and Weekly values. Apply the exact SKUs and prices from `product-contract.json`.

For all variants:

- Disable shipping requirements.
- Disable inventory tracking.
- Do not apply a compare-at price unless separately approved.
- Do not use automatic discounts to manufacture the approved base price.

### 3. Apply product and variant metafields

Apply the canonical `mmg` product metafields and generate each variant's entitlement metafields from the template in `product-contract.json`.

The variant plan code is the Kairos entitlement key.

### 4. Create the selling-plan group

Create one subscription selling-plan group and one monthly recurring selling plan. Associate all three cadence variants with that group.

Store the returned Shopify GIDs in the product contract's runtime mapping only after successful verification.

### 5. Connect storefront behavior

The product page and reusable plan selector must always add:

- the selected variant ID, and
- the valid monthly selling-plan ID.

Never submit the subscription variant without the selling plan.

### 6. Connect Kairos activation

After Shopify confirms a subscription contract:

1. Resolve the selected variant plan code.
2. Create the corresponding entitlement for 2, 4, or 8 assets.
3. Send the customer to the Customer Portal.
4. Present **Choose Your First Two Titles**.
5. Open the Knowledge Library in subscription-selection mode.

### 7. Keep the product unpublished until all release gates pass

Do not publish until the following are complete:

- Product-page source and responsive QA
- Three-plan selector
- Cart subscription controller
- Customer consent and recurring-price disclosure
- Customer Portal handoff
- Knowledge Library title picker
- Ownership and eligibility filtering
- Entitlement creation
- Subscription policy and cancellation language
- End-to-end purchase, renewal, plan-change, cancellation, and delivery tests

## Cart Rules

- No silent subscription insertion
- No preselected consent
- No duplicate MMG subscription lines
- An existing subscription line may be changed to another cadence rather than duplicated
- The cart must show the cadence, monthly price, selling-plan name, and recurring nature of the charge

## Runtime Record

The following IDs are mutable deployment output and begin as `null`:

- Shopify product GID
- Monthly variant GID
- Bi-weekly variant GID
- Weekly variant GID
- Selling-plan-group GID
- Selling-plan GID

Kairos must not infer or hard-code these IDs before Shopify provisioning returns them.

## Next Implementation Dependency

After provisioning data exists, build the reusable **MMG Three-Plan Selector** against this contract. It must work on the membership page, subscription product page, cart offer, and future portal plan-change surface without duplicating plan data.
