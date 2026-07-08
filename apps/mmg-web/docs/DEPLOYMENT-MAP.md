# MMG Web Deployment Map

## Runtime Target
The production web app is expected to run as a server-capable Next.js application. The Kairos route requires a server runtime because provider calls and secret handling cannot happen in a static-only deployment.

## Required Deployment Secrets
- `OPENAI_API_KEY`
- `KAIROS_OPENAI_MODEL`

## Public Runtime Variables
- `NEXT_PUBLIC_KAIROS_API_ENDPOINT`

## Deployment Responsibilities
- Install web dependencies.
- Build the Next.js app.
- Configure server-side secrets.
- Confirm the Kairos route is reachable.
- Confirm no provider credentials appear in client bundles.
- Confirm customer and admin routes are protected before connecting private data.

## Validation Checklist
- Web build passes.
- Health route responds.
- Kairos route rejects malformed requests.
- Kairos route returns safe structured errors.
- Kairos route returns a valid response when server secrets are configured.
- iOS client points to the deployed Kairos route.
