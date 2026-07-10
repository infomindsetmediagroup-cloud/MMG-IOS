# Checkpoint 006 — Browser Executive Chat

## Objective

Expose the validated Kairos production runtime inside the live browser dashboard without embedding provider credentials or gateway secrets in repository source.

## Browser behavior

- Adds a persistent **Live Kairos** launcher to the dashboard.
- Checks `GET /api/health` when the panel opens.
- Uses the Vercel origin when running on Vercel.
- Uses `https://mmg-ios.vercel.app` when opened from the GitHub Pages dashboard.
- Sends governed requests to `POST /api/kairos`.
- Displays returned department, request ID, and audit ID.
- Handles runtime, authorization, provider, and network failures without fabricating a response.

## Credential boundary

The browser bundle does not contain `KAIROS_RUNTIME_TOKEN`.

For controlled internal operation, the operator pastes the gateway token into the browser panel. The token is stored only in `sessionStorage`, remains limited to the current browser tab, and can be cleared from the panel.

This mechanism is appropriate only for controlled internal validation. It is not public customer authentication.

## Validation gate

1. Run `MMG Web Verify` against `checkpoint-006-browser-executive-chat` if available.
2. Confirm the Vercel preview or production deployment is ready.
3. Open the dashboard and launch **Live Kairos**.
4. Confirm the runtime status becomes **Production runtime ready**.
5. Load the current internal gateway token.
6. Send a non-destructive executive objective.
7. Confirm a real Kairos response appears with request and audit identifiers.
8. Confirm clearing the token prevents further authorized requests.

## Production boundary

Before customer-facing release, replace the shared operator token with authenticated sessions, tenant authorization, CSRF protections where applicable, durable rate limiting, and server-side audit persistence.
