# MMG My Library Delivery Interface v1.0

**Status:** Approved for staging  
**Canonical route:** `/pages/customer-portal#my-library`  
**Contract:** `registry/customer-portal/mmg-my-library-delivery-contract-v1.json`

## Purpose

My Library is the authenticated customer-facing destination for digital products that a customer owns through:

- One-time purchase.
- Subscription delivery.
- Bonus grant.
- Administrative grant.

It displays one item per canonical `mmg.asset_id`, even when multiple historical ownership grants exist.

## Architecture Boundary

My Library does not determine ownership in the browser. Kairos derives the authenticated customer from the server session and resolves ownership from active, non-revoked `mmg_ownership_grants` records.

The browser receives customer-safe presentation fields and capability booleans. It does not receive:

- Customer IDs.
- Ownership or delivery grant IDs.
- Subscription contract IDs.
- Entitlement window IDs.
- Storage providers.
- Storage object keys.
- Delivery package references.
- Permanent file URLs.

## Endpoints

### Library state

```text
GET /api/customer-portal/my-library
```

Returns one customer-facing item per owned asset. The response is authenticated, private, and non-cacheable.

### Secure access

```text
POST /api/customer-portal/my-library/access
```

Request:

```json
{
  "requestId": "unique-client-request-id",
  "assetId": "mmg-dd-example-001",
  "kind": "read"
}
```

`kind` is `read` or `download`.

The endpoint requires:

- Authenticated Customer Portal session.
- Same-origin validation.
- Session-bound CSRF validation.
- Unique request ID.
- Active ownership revalidation.
- Delivered subscription package when subscription delivery is the only ownership source.
- Active primary file for the requested capability.

The storage gateway returns a short-lived HTTPS signed URL. Kairos never stores that URL in the database.

## Delivery States

### Preparing

The customer owns the asset, but subscription delivery or file preparation is incomplete. The asset appears in My Library, while read and download controls remain disabled.

### Ready

A one-time purchase, bonus, or administrative grant has an active primary delivery file.

### Delivered

A subscription-delivered asset is linked to a package window that reached `delivered` and has an active primary delivery file.

## Persistence

Migration:

```text
database/migrations/20260720_004_mmg_my_library_delivery.sql
```

Tables:

- `mmg_asset_delivery_files`
- `mmg_library_access_requests`
- `mmg_library_access_events`

The file table stores storage object references, not public URLs. One active primary file is permitted per asset and access kind.

Access requests are unique by request ID. Replays are rejected with a retryable customer-safe response. Access events record requested, granted, denied, or failed outcomes without storing signed URLs.

## Customer Portal Integration

```liquid
{% render 'mmg-my-library',
  mmg_my_library_instance_id: 'customer-portal-primary',
  mmg_my_library_endpoint: '/api/customer-portal/my-library',
  mmg_my_library_access_endpoint: '/api/customer-portal/my-library/access',
  mmg_my_library_csrf_token: mmg_customer_portal_csrf_token
%}
```

The host runtime must inject a session-bound CSRF token. A blank token keeps the library visible but prevents secure file issuance.

## Customer Experience

The interface includes:

- Owned-asset count.
- Search.
- Topic, format, and source filters.
- Newest-first and title sorting.
- Square thumbnail with portrait fallback.
- Delivery status.
- Ownership source and date added.
- Read-online and download controls when supported.
- Resource detail link.
- Empty, sign-in, loading, error, and preparing states.

## Security Rules

1. Customer identity comes only from the authenticated server session.
2. Ownership is revalidated on every secure access request.
3. Subscription assets remain inaccessible until the linked package is delivered.
4. Access requests require same-origin and CSRF validation.
5. Signed URLs must use HTTPS.
6. Signed URL lifetime is 60–600 seconds, with 300 seconds as the default.
7. Read uses inline disposition; download uses attachment disposition.
8. Storage object keys and permanent URLs never enter storefront JSON.
9. Access responses are private and non-cacheable.
10. The access endpoint is rate-limited by the production runtime.

## Release Sequence

1. Apply all four commerce migrations.
2. Connect production PostgreSQL.
3. Connect authenticated GET and POST routes.
4. Connect same-origin and CSRF validation.
5. Connect the production storage signer.
6. Populate active primary delivery-file records.
7. Verify subscription packages reach `delivered` before access is issued.
8. Capture the complete current Customer Portal source.
9. Insert My Library additively.
10. Test ownership, delivery, access, mobile, accessibility, and failure states.

## Next Dependency

Shopify subscription webhook reconciliation must connect completed orders and recurring contract events to durable MMG subscription entitlements, billing cycles, order links, and delivery-window scheduling.
