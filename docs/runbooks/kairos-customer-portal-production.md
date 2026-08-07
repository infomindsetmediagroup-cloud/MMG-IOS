# Kairos Customer Portal — Production Runbook

## Purpose

The Mindset Media Group Customer Portal is the customer-safe projection of Kairos. It exposes only the authenticated customer's projects, project status, files, proofs, approvals, notifications, deliverables, member library, subscription preferences, and support surfaces. It never exposes operator controls, internal prompts, deployment controls, commerce mutation authority, publication authority, credentials, or another customer's records.

Canonical storefront entry: `https://themindsetmediagroup.com/pages/customer-portal`

Shopify customer accounts: `https://account.themindsetmediagroup.com`

Kairos customer API: `/api/kairos/customer/projects`

## Security boundary

1. A browser-supplied `x-kairos-customer-id` is not an authentication credential.
2. The public customer API is fail-closed unless a trusted identity bridge authenticates the request.
3. The current server-to-server compatibility path requires `KAIROS_CUSTOMER_ACCESS_TOKEN` plus the customer identifier. The bearer secret must never be sent to storefront JavaScript.
4. The production browser identity bridge must use Shopify Customer Accounts. The bridge must derive the Shopify customer identity from Shopify-authenticated context and map it server-side to the immutable Kairos customer ID.
5. Cross-customer access returns no project data.
6. Customer responses use `Cache-Control: private, no-store`.
7. The Admin Portal remains a separate operator-only surface.

## Current runtime composition

`kairos-production-entry-canonical-publishing-v1.js` registers both:

- `handleKairosCustomerRuntimeProjectionAPI` at the Worker boundary.
- `handleKairosCustomerRuntimeProjectionObjectRequest` at the `KairosProject` Durable Object boundary.

The customer runtime continues to use the canonical `KAIROS_PROJECTS` Durable Object binding and the `mmg-production-project-registry` object.

## Service project onboarding

Official guide: `MMG Project Guide — Golden Master v1.0`

Storefront file:
`https://cdn.shopify.com/s/files/1/0754/4337/2186/files/MMG-Project-Guide-Golden-Master-v1.0.pdf?v=1784667842`

Required intake:

- Shopify order number
- Project files
- Project goals
- References / brand or style examples
- Rights confirmation
- Production notes

Canonical flow:

`Purchase → Portal intake → Review → Production → QA → Delivery → Next`

The guide is onboarding material, not the finished service deliverable. Project production begins after Customer Portal intake is received and validated.

## Subscription member onboarding

Official guide: `MMG Subscription Member Guide — Golden Master v1.0`

Storefront file:
`https://cdn.shopify.com/s/files/1/0754/4337/2186/files/MMG-Subscription-Member-Guide-Golden-Master-v1.0.pdf?v=1784667841`

Required profile:

- Shopify order number
- Primary role
- Goals
- Topics and interests
- Experience level
- Delivery preferences

Canonical flow:

`Join → Profile → Curate → Preview → Delivery → Library → Evolve`

The handbook starts the subscription workflow. The first curated package is prepared after profile completion and subscription verification.

## Portal workspace contract

After authenticated identity is established, the customer workspace should contain:

- Dashboard / active projects
- Project status and progress
- Files and source materials
- Proofs and approvals
- Customer notifications
- Final deliverables
- Member library / prior subscription deliveries
- Subscription preferences
- Account and support

## Verification gates

A Customer Portal release is not complete until all applicable gates pass:

1. Repository tests pass.
2. Worker dry-run bundle succeeds.
3. Exact production SHA is verified by `/api/deployment/identity`.
4. Unauthenticated `/api/kairos/customer/projects` returns `401 CUSTOMER_AUTH_REQUIRED`.
5. A spoofed customer ID without trusted authentication returns 401.
6. Customer A cannot read, enumerate, approve, notify, or download Customer B's project data.
7. Shopify `/pages/customer-portal` is published and contains no fake project data.
8. Main navigation exposes Customer Portal.
9. Both onboarding guide links resolve to ready PDF assets.
10. Personalized project data is not enabled in storefront JavaScript until the Shopify Customer Account identity bridge is configured and verified.
