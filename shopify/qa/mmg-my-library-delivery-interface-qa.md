# MMG My Library Delivery Interface — QA Contract

**Component:** `shopify/snippets/mmg-my-library.liquid`  
**Version:** 1.0.0  
**Status:** Staging required before publication

## Data Preconditions

- All entitlement, delivery-window, Thank you handoff, and My Library migrations are applied.
- Production PostgreSQL is connected.
- Every deliverable asset has one canonical `mmg.asset_id`.
- Every accessible asset has an active primary delivery file for each supported capability.
- Subscription-delivered assets are linked to delivered package windows before access is enabled.
- The Customer Portal runtime injects a session-bound CSRF token.
- The secure storage signer returns short-lived HTTPS URLs only.

## Library-State Tests

1. Unauthenticated requests return the sign-in state.
2. An authenticated customer with no ownership grants sees the empty state.
3. One active ownership grant produces one library card.
4. Multiple active grants for the same asset produce one card with aggregated sources.
5. Revoked grants do not create access.
6. One-time purchase, bonus, and administrative grants may become ready immediately when files exist.
7. Subscription-delivered assets remain preparing until the package window reaches `delivered`.
8. Delivered subscription assets expose supported read and download controls.
9. Assets without active delivery files remain visible with unavailable controls.
10. The newest-first order uses the latest active grant date.

## Secure-Access Tests

- GET library state is private and non-cacheable.
- POST access requires authentication.
- POST access rejects cross-origin requests.
- POST access rejects missing or invalid CSRF tokens.
- POST access rejects malformed, oversized, or unsupported payloads.
- Every request requires a unique request ID.
- Replayed request IDs return a retryable conflict.
- Ownership is revalidated for every access request.
- Subscription delivery completion is revalidated for subscription-only ownership.
- Read requests use inline disposition.
- Download requests use attachment disposition.
- Signed URLs use HTTPS and expire within 60–600 seconds.
- Storage providers, object keys, permanent URLs, grant IDs, and delivery references never appear in customer-facing JSON.
- Signer failures return a customer-safe retryable error.
- Signed URLs are not persisted in access-request or access-event tables.

## Interface Tests

- Search matches title, summary, topic, format, and series.
- Topic, format, and ownership-source filters work independently and together.
- Clear filters restores the complete library.
- Sorting supports newest first and title A–Z.
- Preparing cards show disabled read and download controls.
- Ready and delivered cards enable only the capabilities present in the server response.
- Clicking an enabled action requests a signed link and opens it only after success.
- Missing CSRF configuration blocks file issuance without hiding the owned library.
- Loading, sign-in, empty, no-results, network-error, and access-error states are readable.
- External `mmg:my-library-refresh` and `mmg:package-delivered` events refresh the library.

## Accessibility Tests

- The section has a visible heading and semantic landmarks.
- Search and every filter have visible labels.
- Buttons and links have visible focus indicators.
- Disabled access controls communicate unavailable state through labels and titles.
- Result counts and secure-access status use live regions.
- Cards remain understandable without relying on color alone.
- Keyboard-only users can search, filter, sort, read, download, and clear filters.
- Reduced-motion mode removes nonessential animation.

## Responsive Tests

- No horizontal overflow at 320 px, 375 px, 390 px, 430 px, 768 px, 1024 px, and 1440 px.
- Three columns are used on wide screens, two on medium screens, and one on small screens.
- Card images remain uncropped through `object-fit: contain`.
- Titles, status pills, controls, and actions do not overlap.
- The component introduces no `100vw`, negative-margin breakout, global body mutation, or `#MainContent` override.

## Portal Integration Tests

- My Library is inserted additively into the current Customer Portal.
- Existing dashboard, service-project, upload, messaging, support, navigation, and authentication modules remain intact.
- The subscription dashboard My Library links reach the new section.
- The Thank you completed state reaches My Library.
- Package delivery refreshes My Library without a full page rebuild where supported.

## Publication Gate

Do not publish until production database migrations, authenticated routes, CSRF validation, storage signing, delivery-file provisioning, subscription delivery gating, portal insertion, mobile QA, accessibility QA, authorization testing, expired-link testing, and operational monitoring all pass.
