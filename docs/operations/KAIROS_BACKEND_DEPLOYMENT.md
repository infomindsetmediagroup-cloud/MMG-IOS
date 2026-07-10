# Kairos Backend Runtime Deployment

## Purpose

Deploy the server-side `/api/kairos` boundary used by the iOS Executive Chat. The iOS app must never receive or store `OPENAI_API_KEY`.

## Required server environment variables

- `OPENAI_API_KEY` — provider credential, server-side only.
- `OPENAI_MODEL` — explicitly selected production model.
- `KAIROS_RUNTIME_TOKEN` — revocable gateway credential required by the iOS client.

Do not commit any of these values to Git.

## iOS build configuration

Supply these values through the deployment/build environment:

- `KAIROS_RUNTIME_URL` — full HTTPS URL ending in `/api/kairos`.
- `KAIROS_RUNTIME_TOKEN` — must match the server gateway token.

The gateway token is not an OpenAI credential. It limits casual public access to the runtime endpoint, but it is still extractable from a distributed mobile binary. Replace it with device-bound authentication such as App Attest before broad public distribution.

## Local verification

```bash
npm install
npm run check
```

Local development may use an HTTP localhost endpoint. Remote production endpoints must use HTTPS.

## Deployment verification

1. Deploy the branch to the serverless provider.
2. Set all three server environment variables.
3. Confirm `GET /api/kairos` returns `405`.
4. Confirm unauthorized `POST /api/kairos` returns `401`.
5. Send an authorized valid request and verify:
   - HTTP 200
   - non-empty `message`
   - matching `department`
   - `requestId`
   - `auditId`
6. Set the iOS `KAIROS_RUNTIME_URL` and `KAIROS_RUNTIME_TOKEN` build settings.
7. Validate Executive Chat end-to-end.

## Security boundaries

- Provider credentials stay server-side.
- Responses are not cached.
- Request fields are bounded and validated.
- Provider failures return safe messages rather than raw provider payloads.
- Request and audit identifiers support operational tracing.
- The runtime does not claim downstream actions were completed without evidence.

## Production hardening backlog

- Replace the shared gateway token with App Attest/device-bound authentication.
- Add durable rate limiting and abuse controls.
- Add structured audit storage with retention policy.
- Add provider request tracing and cost telemetry.
- Add organization/customer authorization boundaries.
