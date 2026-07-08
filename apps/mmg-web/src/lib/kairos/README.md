# Kairos Web Runtime

## Verification
Run from `apps/mmg-web`:

```bash
npm install
npm run verify
```

`npm run verify` executes:
- TypeScript type-checking.
- ESLint.
- Vitest runtime tests.
- Next.js production build.

## Endpoint Exercise
After starting the app with `npm run dev`, exercise the runtime route:

```bash
curl -X POST http://localhost:3000/api/kairos \
  -H 'Content-Type: application/json' \
  -d '{"mode":"public","surface":"website","message":"Hello Kairos","context":{}}'
```

Expected response shape:

```json
{
  "reply": "...",
  "mode": "public",
  "department": "kairos-core",
  "status": "ok"
}
```

The route also returns an `x-kairos-request-id` response header.

## Auth Boundary
Kairos defaults every unauthenticated session to public mode.

The temporary `x-kairos-role` and `x-kairos-subject` headers are ignored unless all of the following are true:
- `NODE_ENV` is not `production`.
- `KAIROS_ENABLE_DEV_ROLE_HEADERS=true` is explicitly configured.

Never enable development role headers in production. Customer and admin mode must eventually be resolved through a trusted authentication/session provider, not client-controlled headers.

## iOS Integration
Set `KAIROS_API_ENDPOINT` in the iOS app configuration to the deployed web route:

```text
https://<deployment-domain>/api/kairos
```

The iOS client adapter sends the same request contract used by the web runtime.
