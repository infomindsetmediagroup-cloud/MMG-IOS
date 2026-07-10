# MMG/Kairos Checkpoint 007 — Authenticated Application Sessions

**Status:** Active implementation branch  
**Branch:** `checkpoint-007-authenticated-sessions`  
**Baseline:** Checkpoint 006 frozen production baseline

## Objective

Replace direct browser use of the long-lived internal gateway token with a short-lived authenticated application session suitable for controlled internal operation and later tenant/role enforcement.

## Implemented in the first slice

- dependency-free HMAC-SHA256 signed session tokens
- minimum 32-character server-side signing secret requirement
- constant-time internal gateway-token comparison
- short-lived session claims with subject, tenant, role, issue time, expiration, and session ID
- Secure, HttpOnly, SameSite=Strict session cookie
- `POST /api/session/exchange` for controlled gateway-to-session exchange
- `GET /api/session` for current-session status
- `DELETE /api/session` for explicit logout and cookie invalidation

## Required environment variable

- `KAIROS_SESSION_SIGNING_SECRET` — server-side secret of at least 32 characters

The existing `KAIROS_GATEWAY_TOKEN` remains the bootstrap credential during this controlled migration.

## Deliberate compatibility boundary

Checkpoint 006 behavior remains intact. The `/api/kairos` endpoint is not yet session-enforced in this first slice. This prevents an unvalidated authentication migration from interrupting the frozen production runtime.

## Next implementation slice

1. Add reusable session-required middleware.
2. Bind session claims to request/audit logging.
3. Update the browser Executive Chat to exchange the bootstrap token once and use cookie credentials thereafter.
4. Validate expiration, malformed-token, bad-signature, logout, and missing-secret paths.
5. Switch `/api/kairos` from direct gateway authorization to application-session authorization with an explicitly documented rollback path.
6. Add revocation persistence before any customer-facing release.

## Security limitations

The current signed token is stateless. Explicit logout clears the browser cookie but does not yet provide server-side revocation of a token copied before logout. Durable revocation and audit persistence remain mandatory before public/customer authentication approval.
