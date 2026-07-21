# MMG Customer Account — My Downloads

## Change set

`shopify-customer-account-my-downloads-library-20260721`

## Purpose

This Shopify Customer Account UI extension creates a cross-order **My Downloads** library for Mindset Media Group customers.

The library reads the authenticated customer's Shopify order history, identifies eligible digital line items, and presents every active entitlement in one page. Each **Access download** action opens the secure Shopify order-status page where Shopify Digital Products renders the file controls for that order.

## Security model

- Shopify Customer Accounts provides authentication.
- Shopify's Customer Account API provides the customer's own orders.
- Paid order history is the entitlement source.
- Shopify Digital Products remains the delivery authority.
- The extension never stores, duplicates, or exposes a direct file URL.
- No customer-specific order token is committed to source.
- No external network access or separate customer database is required.

## Digital eligibility

A line item appears when all of the following are true:

1. The order is `PAID` or `PARTIALLY_REFUNDED`.
2. The order is not cancelled.
3. The order has a secure `statusPageUrl`.
4. The line item does not require shipping.
5. The line item is not a gift card.
6. The product type is `Digital Download`, or its SKU begins with `MMG-DIG-`.
7. The purchased line has not been fully refunded.

Every qualifying purchase is preserved as its own entitlement. Repeat purchases are not collapsed.

## Local verification

```bash
cd shopify/apps/mmg-customer-account
npm install
npm run check
```

## Shopify deployment boundary

Shopify does not register Customer Account extensions through the Admin GraphQL API. The source must be linked to an MMG Shopify Dev Dashboard app and deployed with Shopify CLI.

```bash
cd shopify/apps/mmg-customer-account
shopify app config link
shopify app deploy
```

During linking, select the MMG app associated with `07kd8e-qw.myshopify.com`. The linked app must request:

- `customer_read_customers`
- `customer_read_orders`

Protected customer data access must be approved before production use.

## Post-deployment integration

After Shopify registers the extension:

1. Query `customerAccountPages`.
2. Locate the `CustomerAccountAppExtensionPage` titled **My Downloads** with handle `mmg-my-downloads`.
3. Update menu `gid://shopify/Menu/248455561370`.
4. Replace the temporary **Orders & Downloads** native Orders entry with:
   - title: `My Downloads`
   - type: `CUSTOMER_ACCOUNT_PAGE`
   - resource ID: the deployed extension page GID
5. Keep a separate native **Orders** entry.
6. Sign in as the customer who placed order `#1001`.
7. Confirm AI Image Mastery™ appears.
8. Confirm **Access download** opens the order's Shopify Digital Products file block.

Until those steps pass, the source is complete but the storefront integration is not production-complete.
