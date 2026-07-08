# MMG Web Deployment Map

## Runtime Target
The production web app is expected to run as a server-capable Next.js application. The Kairos route requires a server runtime because provider calls and secret handling cannot happen in a static-only deployment.

## Required Deployment Secrets
- `OPENAI_API_KEY`
- `KAIROS_OPENAI_MODEL`

## Public Runtime Variables
- `NEXT_PUBLIC_KAIROS_API_ENDPOINT`

## Local-Only Variables
- `KAIROS_ENABLE_DEV_ROLE_HEADERS`

This variable must never be enabled in production. It exists only to support controlled local testing before trusted authentication is installed.

## Deployment Responsibilities
- Install web dependencies.
- Build the Next.js app.
- Configure server-side secrets.
- Confirm the health route reports the Kairos runtime configuration state.
- Confirm the Kairos route is reachable.
- Confirm no provider credentials appear in client bundles.
- Confirm customer and admin routes are protected before connecting private data.

## Health Readiness Contract
`GET /api/health` returns:
- `status: ok` when the server has required Kairos runtime configuration.
- `status: degraded` when required runtime configuration is missing.
- `kairos.runtimeConfigured` as the explicit runtime readiness flag.
- `kairos.checks` with required and optional environment checks.

A degraded health response is acceptable for local scaffolding, but not acceptable for production launch.

## Validation Checklist
- Web build passes.
- Health route responds.
- Health route reports `ok` in production.
- Kairos route rejects malformed requests.
- Kairos route returns safe structured errors.
- Kairos route returns a valid response when server secrets are configured.
- iOS client points to the deployed Kairos route.
