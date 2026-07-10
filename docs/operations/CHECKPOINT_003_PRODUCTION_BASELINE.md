# Checkpoint 003 Production Baseline

## Status

Checkpoint 003 and the Checkpoint 003A workflow-policy repair are merged into `main`.

Validated gates:

- Manual iOS Validation: passed
- Manual Kairos Backend Validation: passed
- GitHub Pages deployment from `main`: passed

## Current certification

The repository is certified as a coherent, validated code baseline for controlled development through Checkpoint 003A.

It is not yet certified for unrestricted public production use. The current Kairos gateway token is an internal-alpha control and must be replaced with user/device-bound authentication before broad distribution.

## Canonical runtime path

1. `AppRootView` presents Executive Chat.
2. `ExecutiveChatView` delegates objectives to `KairosChatService`.
3. `KairosChatService` applies local department routing and creates a `KairosRuntimeRequest`.
4. `KairosRuntimeClient` sends the authorized request to `/api/kairos`.
5. The backend validates the request and gateway token, calls the OpenAI Responses API, and returns a safe normalized response.
6. The client records successful responses in the Knowledge Vault.

## Remaining production-hardening gates

The following items are required before public production certification:

1. Deploy and smoke-test the live `/api/kairos` endpoint.
2. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and `KAIROS_RUNTIME_TOKEN` only in server-side deployment secrets.
3. Add deterministic Node dependency installation with a committed lockfile and `npm ci`.
4. Add device/user-bound authentication and short-lived credentials.
5. Add server-side rate limiting, quotas, and revocation controls.
6. Persist backend audit records rather than returning correlation identifiers only.
7. Persist Executive Chat conversations.
8. Replace silent SwiftData save failures with explicit operational error handling.
9. Consolidate the top-level application navigation before customer release.
10. Remove merged legacy slice branches after confirming they are fully represented in `main`.

## Change-control rule

Future feature work must branch from the latest validated `main`. No stacked slice branch may be treated as canonical after its checkpoint is merged.
