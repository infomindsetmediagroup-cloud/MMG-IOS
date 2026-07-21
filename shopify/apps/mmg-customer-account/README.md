# MMG Customer Account App

Canonical Shopify Customer Account extensions for Mindset Media Group.

## My Downloads

`extensions/mmg-my-downloads` provides a full-page **My Downloads** library that:

- reads the authenticated customer's complete paginated Shopify order history;
- includes only active paid or partially refunded orders;
- includes only non-shipping products classified as `Digital Download` or using the canonical `MMG-DIG-` SKU prefix;
- aggregates eligible purchases across every order;
- opens the order's secure Shopify `statusPageUrl`, where the existing Digital Products app renders its protected download entitlement;
- stores no public asset URL, duplicate PDF, customer database, or Admin API credential.

## Shopify integration boundary

Customer Account extensions are deployed through a Shopify Dev Dashboard app, not through Online Store theme files or the Admin GraphQL theme API.

1. In this directory, run `shopify app config link` and select the MMG Shopify app connected to `07kd8e-qw.myshopify.com`.
2. Confirm the linked app has `customer_read_customers,customer_read_orders` protected-customer-data access.
3. Run `npm install`, `npm run check`, and `npm run deploy`.
4. In **Settings → Checkout → Customize customer accounts**, add **My Downloads** to the customer-account navigation and publish the account configuration.
5. Sign in with a customer that owns a paid digital order and verify the cross-order library and Digital Products handoff.

The repository intentionally contains `shopify.app.toml.example` rather than fabricated app credentials.
