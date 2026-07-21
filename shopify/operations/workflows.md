# MMG Shopify Operating Workflows

## Workflow 1 — Read-Only Store Inspection

Use for inventory, catalog, product, collection, order, customer, analytics, metafield, publication, and configuration questions.

1. Read the connected shop identity.
2. Identify the exact resource using Shopify search or a known GID.
3. Retrieve the full live resource before interpreting it.
4. Use a built-in read tool when available.
5. For unsupported reads:
   - inspect the Admin GraphQL schema or official Shopify documentation;
   - construct the smallest read-only query;
   - include pagination information;
   - validate the operation with Shopify AI Toolkit;
   - execute the query;
   - summarize without exposing sensitive data.
6. Mark the result with the read timestamp when it will become a baseline or decision input.
7. Do not treat a dated repository snapshot as current live state.

## Workflow 2 — Product or Collection Audit

1. Read shop identity.
2. Search all matching products or collections.
3. Retrieve each target by GID.
4. Record:
   - title, handle, status, vendor, product type;
   - variants, prices, SKUs, inventory policy;
   - tags, media, alt text, and publication state;
   - collection membership and sorting;
   - delivery and portal contract;
   - executable content stored in descriptions;
   - internal links and dependencies.
5. Classify findings as:
   - verified live state;
   - approved target state;
   - gap;
   - risk;
   - recommended action.
6. Make no mutation unless the user separately approves the exact change.

## Workflow 3 — Shopify GraphQL Read

1. Confirm the request is read-only.
2. Inspect `QueryRoot` and the relevant object types.
3. Search Shopify documentation for current examples when needed.
4. Construct the query with explicit fields and pagination.
5. Validate using `validate_graphql_codeblocks`.
6. Correct every validation error.
7. Execute with `graphql_query`.
8. Verify that returned shop/resource identity matches the intended target.
9. Present the result in operational language, not raw JSON.

## Workflow 4 — Governed Shopify Mutation

1. Read the connected store identity.
2. Read the exact target resource.
3. Capture current values and a rollback payload.
4. Determine whether a dedicated Shopify tool exists.
5. If custom GraphQL is required:
   - inspect `Mutation`;
   - inspect the exact input type;
   - search official docs for current requirements;
   - construct the smallest mutation;
   - validate it with Shopify AI Toolkit.
6. Present the exact proposed change, impact, and rollback.
7. Obtain explicit approval.
8. Execute one bounded mutation.
9. Read the target again.
10. Validate storefront, cart, delivery, or portal behavior as applicable.
11. Record success, partial failure, or rollback.

## Workflow 5 — Complete Product-Page Source Replacement

Use when a product description contains the full customer-facing HTML, CSS, and JavaScript implementation.

1. Retrieve the full current `descriptionHtml`.
2. Save it as the rollback source.
3. Store the complete proposed replacement in `shopify/products/`.
4. Validate:
   - one clear H1 and logical heading hierarchy;
   - valid semantic HTML;
   - scoped CSS;
   - no accidental global theme damage;
   - no horizontal overflow;
   - mobile and desktop layouts;
   - reduced-motion safety;
   - hard reveal fallback;
   - product and variant data loading;
   - cart controls and failure fallback;
   - image containment and alt text;
   - current routes and related-product availability;
   - native Shopify header and footer preservation;
   - title suppression and wrapper normalization where required.
5. Compare the replacement with the live source and document intentional differences.
6. Obtain explicit approval for the complete replacement.
7. Update the full source in one governed operation.
8. Verify live rendering and checkout behavior.
9. Restore the previous complete source if verification fails.

## Workflow 6 — Product Creation

1. Select the canonical product contract: service, digital download, or subscription.
2. Generate the complete commercial and delivery package.
3. Validate title, handle, vendor, product type, tags, identifiers, variants, prices, media, alt text, SEO, delivery, portal path, and support boundaries.
4. Upload media to Shopify and record resulting CDN URLs.
5. Create the product as `DRAFT` unless activation was explicitly approved.
6. Read the created product and record its GID and variant GIDs.
7. Attach collections and publications only after validation.
8. Test checkout and delivery in the approved environment.
9. Obtain activation approval.
10. Activate and verify.

## Workflow 7 — Subscription Creation

1. Confirm the subscription app or selling-plan architecture.
2. Verify plan compatibility, app cost, billing behavior, and customer portal capability.
3. Define the product and variants or purchase options.
4. Define selling-plan groups for monthly, bi-weekly, and weekly cadence.
5. Define entitlement counts, billing anchors, delivery schedule, failed-payment behavior, pause, cancellation, renewal, and customer notifications.
6. Define the MMG Subscription Member Guide and required profile workflow.
7. Define Kairos event handling and idempotency.
8. Validate Shopify GraphQL and app configuration.
9. Create draft resources only.
10. Perform end-to-end test purchases and event replay tests.
11. Obtain explicit activation approval.
12. Publish and verify the full subscriber lifecycle.

## Workflow 8 — Link Validation

1. Extract every internal route from the complete page source.
2. Classify each route as product, collection, page, cart, account, portal, or external dependency.
3. Compare product and collection routes against live Shopify inventory.
4. Test page routes against the storefront.
5. Flag references to planned products separately from broken links.
6. Do not silently remove strategic future links; recommend whether to hide, redirect, create, or retain them.
7. Obtain approval before changing any live route.

## Workflow 9 — Release Record

Every approved Shopify release record should include:

- release ID and date;
- connected store identity;
- affected GIDs and handles;
- source commit and pull request;
- validation results;
- approval reference;
- pre-change snapshot;
- executed operation;
- post-change verification;
- rollback source and status.
