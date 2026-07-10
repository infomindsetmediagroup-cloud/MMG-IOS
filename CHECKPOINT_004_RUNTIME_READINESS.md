# Checkpoint 004 — Kairos Runtime Readiness

## Objective

Establish an observable deployment gate for the live Kairos backend before any customer-facing client is configured to use it.

## Endpoints

- `GET /api/health` — reports whether required runtime configuration is present.
- `POST /api/kairos` — executes an authorized Kairos request through the server-side OpenAI runtime.

## Health contract

A ready deployment returns HTTP `200`:

```json
{
  "service": "kairos-runtime",
  "status": "ready",
  "configured": {
    "providerCredential": true,
    "providerModel": true,
    "gatewayCredential": true
  },
  "timestamp": "<ISO-8601>"
}
```

An incomplete deployment returns HTTP `503` with `status: "degraded"`. The endpoint exposes only booleans and never returns credential values.

## Required server environment

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `KAIROS_RUNTIME_TOKEN`

## Validation sequence

1. Run Manual Kairos Backend Validation against the checkpoint branch.
2. Deploy the branch to the serverless host.
3. Request `GET /api/health` and require HTTP 200 with `status: ready`.
4. Send one authorized non-destructive smoke request to `POST /api/kairos`.
5. Confirm the response includes `message`, `department`, `requestId`, and `auditId`.
6. Only then configure the trusted iOS build with the production runtime URL and gateway credential.

## Security boundary

The health endpoint does not call OpenAI and does not expose secrets. `OPENAI_API_KEY` remains server-only. The current gateway credential is suitable for controlled internal testing, not broad public distribution; device-bound authentication and rate limiting remain required before public release.
