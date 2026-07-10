# Checkpoint 007 — Session Security Boundary

## Objective

Replace the browser's direct use of the long-lived runtime gateway token with a short-lived, server-issued internal session credential while preserving the validated Checkpoint 006 runtime contract.

## Why this is next

Checkpoint 006 proved browser-to-runtime operation, but the browser currently retains the long-lived gateway token in `sessionStorage`. That is acceptable for controlled validation, not for a durable operating interface.

Checkpoint 007 reduces that exposure without redesigning Kairos or introducing public customer authentication prematurely.

## Batch scope

### 1. Session exchange endpoint

Add `POST /api/session`:

- accepts the existing internal gateway token only for session establishment
- issues a short-lived signed session token
- includes issued-at, expiration, session ID, role, and audience claims
- never returns or logs the gateway token
- applies `Cache-Control: no-store`

### 2. Runtime authorization compatibility

Update `/api/kairos` authorization so it accepts either:

- the existing gateway token for automation and emergency access, or
- a valid short-lived Kairos session token for browser operation

The existing GitHub live validation must continue to pass unchanged.

### 3. Browser session behavior

Update Executive Chat so it:

- exchanges the gateway token for a short-lived session
- removes the gateway token from browser storage immediately after exchange
- stores only the short-lived session token in `sessionStorage`
- displays session expiration state
- clears expired or rejected sessions automatically
- requires explicit reauthentication after expiration

### 4. Audit metadata

Attach the session ID and operator role to runtime request metadata and return the session ID with the runtime response envelope where safe.

### 5. Tests

Add tests for:

- valid session issuance
- invalid gateway token rejection
- expired session rejection
- malformed session rejection
- runtime acceptance of valid session credentials
- continued runtime acceptance of the gateway token for automation
- browser code containing no committed credential

## Explicitly out of scope

- public account registration
- customer login
- tenant provisioning
- OAuth provider selection
- billing entitlements
- durable multi-region rate limiting
- customer-facing release certification

Those require later checkpoints and explicit architecture decisions.

## Acceptance criteria

1. Checkpoint 005 live validation remains green.
2. Browser chat completes a live request without retaining the long-lived gateway token.
3. Session expiration and rejection are visible and recoverable.
4. No credential is committed to repository source.
5. Main remains unchanged until the full batch is reviewed and manually validated.

## Workflow policy

Build the complete checkpoint on `checkpoint-007-session-security` using `[skip ci]` commits. Run one deliberate validation batch only after implementation and tests are complete.
