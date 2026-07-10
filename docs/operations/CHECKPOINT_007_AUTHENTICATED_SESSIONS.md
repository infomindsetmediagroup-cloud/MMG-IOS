# MMG/Kairos Checkpoint 007 — Authenticated Application Sessions

**Status:** Active implementation; validation pending  
**Branch:** `checkpoint-007-authenticated-sessions`  
**Baseline:** Checkpoint 006 frozen production baseline under Constitution v1.0

## Objective

Replace direct browser use of the long-lived internal gateway token with a short-lived authenticated application session suitable for controlled internal operation and later tenant/role enforcement.

## Implemented

- dependency-free HMAC-SHA256 signed session tokens
- minimum 32-character server-side signing secret requirement
- constant-time internal gateway-token comparison
- short-lived claims containing subject, tenant, role, issue time, expiration, and session ID
- Secure, HttpOnly, SameSite=Strict session cookie
- `POST /api/session/exchange` for controlled gateway-to-session exchange
- `GET /api/session` for current-session status
- `DELETE /api/session` for explicit logout and cookie invalidation
- centralized Kairos authorization boundary
- session identity bound to runtime logs and response execution context
- Executive Chat migration from browser token storage to cookie-backed sessions
- immediate bootstrap-token discard after exchange
- explicit rollback compatibility using the Checkpoint 006 gateway path

## Required environment variables

- `KAIROS_SESSION_SIGNING_SECRET` — server-side secret of at least 32 characters
- `KAIROS_GATEWAY_TOKEN` — bootstrap credential used only for session exchange and rollback compatibility
- `KAIROS_REQUIRE_SESSION` — set to `true` only after session validation to disable the legacy gateway fallback on `/api/kairos`

## Authorization behavior

The runtime first attempts to authorize requests through the signed application-session cookie.

When `KAIROS_REQUIRE_SESSION` is not `true`, `/api/kairos` may fall back to the Checkpoint 006 gateway bearer token. This is an intentional rollback boundary and must be removed or disabled before customer-facing authentication approval.

When `KAIROS_REQUIRE_SESSION=true`, requests without a valid application session fail with `401 session_required`.

## Browser security behavior

The Executive Chat no longer writes the internal gateway token to `sessionStorage`, `localStorage`, page source, or repository files. The token is held only long enough to call the session-exchange endpoint, then the input is cleared. Subsequent requests use `credentials: include` and the HttpOnly cookie.

## Validation gate still required

Before this checkpoint may be merged or frozen:

1. Configure `KAIROS_SESSION_SIGNING_SECRET` in the preview environment.
2. Run backend TypeScript/build validation.
3. Verify successful exchange, status, Kairos request, and logout paths.
4. Verify missing, malformed, expired, and invalid-signature session behavior.
5. Verify the bootstrap token is absent from browser storage after exchange.
6. Verify the gateway fallback works only while `KAIROS_REQUIRE_SESSION` is disabled.
7. Enable `KAIROS_REQUIRE_SESSION=true` in preview and verify gateway-only requests are rejected.
8. Confirm Checkpoint 006 rollback instructions.
9. Record validation evidence before merge.

## Security limitations

The signed session is currently stateless. Logout clears the browser cookie but cannot revoke a token copied before logout. Durable revocation, durable audit persistence, authenticated user provisioning, and production-grade rate limiting remain mandatory before public or customer authentication approval.
