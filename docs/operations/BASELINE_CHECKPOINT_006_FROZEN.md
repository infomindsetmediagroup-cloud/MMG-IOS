# MMG/Kairos Frozen Baseline — Checkpoint 006

**Status:** Frozen production baseline  
**Date:** 2026-07-10  
**Canonical branch:** `main`

## Certified capability

Checkpoint 006 establishes the first browser-facing Kairos Executive Chat connected to the validated Vercel production runtime.

The frozen baseline includes:

- Checkpoint 005 live production runtime validation
- Vercel production deployment at `https://mmg-ios.vercel.app`
- server-side OpenAI provider access
- gateway-token authorization for controlled internal runtime requests
- live browser health checks
- browser-to-runtime Executive Chat requests
- request and audit identifier visibility
- no provider credential or gateway token committed to the browser bundle

## Security boundary

This baseline is approved for controlled internal operation only. It is not yet approved as a public customer authentication layer.

Before customer-facing release, the system still requires:

1. authenticated application sessions
2. tenant and role authorization
3. production-grade rate limiting
4. durable audit persistence
5. explicit session expiration and revocation behavior

## Change-control rule

Future work must branch from this baseline. Changes to the runtime contract, security boundary, or deployment architecture require explicit justification and validation. Main must remain deployable and recoverable.

## Workflow discipline

- batch meaningful work before running GitHub Actions
- use manual validation gates intentionally
- avoid repeated deploy-triggering pushes for trivial edits
- preserve Checkpoint 005 and Checkpoint 006 behavior unless a documented replacement is validated
