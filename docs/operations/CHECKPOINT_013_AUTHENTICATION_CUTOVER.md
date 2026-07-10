# MMG/Kairos Checkpoint 013 — Authentication Completion and Same-Origin Cutover

**Status:** Active implementation; preview validation required  
**Branch:** `checkpoint-013-authentication-cutover`  
**Canonical origin:** `https://mmg-ios.vercel.app`

## Objective

Replace the name-only local browser shell and duplicate Live Kairos token prompt with one server-verified operator login that issues a short-lived signed HttpOnly session for the Vercel-hosted Command Center.

## Implemented

- serverless `/api/session` endpoint supporting login, status, and logout
- constant-time verification of the existing `KAIROS_RUNTIME_TOKEN`
- domain-separated HMAC signing key derived server-side from the configured runtime credential
- Secure, HttpOnly, SameSite=Strict, 30-minute operator-session cookie
- signed claims containing operator, subject, tenant, role, issue time, expiry, and session ID
- `/api/kairos` authorization through the signed operator session
- gateway bearer fallback retained only for the GitHub Pages recovery surface
- replacement of the fake local name-only login with server authentication
- automatic Live Kairos session reuse after operator login
- removal of the second token prompt from the canonical Vercel dashboard
- explicit logout and session-cookie clearing
- cache-busted dashboard assets for the cutover

## Security boundary

The operator access key is never written to localStorage, sessionStorage, page source, or repository files. Only the non-secret operator display name may be retained locally. The credential is submitted to the same-origin session endpoint and discarded after the response.

The existing `KAIROS_RUNTIME_TOKEN` remains the bootstrap credential for this internal phase. A dedicated identity provider, account provisioning, durable revocation, rate limiting, and multi-factor authentication remain future production-hardening requirements.

## Canonical operating model

- Vercel is the canonical authenticated Command Center and runtime origin.
- GitHub Pages is recovery-only and directs operators to Vercel by default.
- GitHub Pages may use the gateway token only in memory for deliberate recovery.
- Routine Live Kairos operation uses only the signed HttpOnly session.

## Preview validation gate

Before merge:

1. Confirm the Vercel preview builds successfully.
2. Open the preview dashboard with no existing cookie and verify the secure Operator Login appears.
3. Verify an invalid access key is rejected.
4. Verify the configured runtime credential establishes a session.
5. Confirm the access key is absent from localStorage and sessionStorage.
6. Open Live Kairos and confirm no second token prompt appears.
7. Send one Kairos request and confirm `authorizationMode=session` in execution metadata.
8. Refresh the page and confirm the session remains active until expiry.
9. End the session and confirm access is revoked in the browser.
10. Confirm GitHub Pages remains labeled as recovery-only and retains in-memory gateway authorization.

## Freeze boundary

Checkpoint 013 must not be declared certified or frozen until the preview validation passes and the same checks pass again on production after merge.
