# Checkpoint 005 — Live Kairos Runtime Validation

## Purpose

Establish repeatable proof that a deployed Kairos backend is configured, reachable, authorized, and capable of completing a real provider-backed request.

## Validation path

1. `GET /api/health` must return HTTP 200 with `status: ready`.
2. `POST /api/kairos` must accept the configured bearer token.
3. The response must contain a non-empty message, request identifier, and audit identifier.
4. The workflow must not print or expose the runtime token.

## Required repository configuration

Create the GitHub Actions repository secret:

- `KAIROS_RUNTIME_TOKEN`

Its value must match the token configured in the deployed Kairos backend.

## Running the workflow

Open **Manual Live Kairos Validation** and provide the deployed base URL, for example:

```text
https://your-kairos-runtime.example.com
```

Do not include `/api/kairos` or a trailing slash.

## Certification boundary

A green run proves the deployed backend health and authorized request path. It does not yet certify public customer authentication, device attestation, rate limiting, durable server-side auditing, or production billing controls.
