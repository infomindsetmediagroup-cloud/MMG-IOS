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

## iOS Integration
Set `KAIROS_API_ENDPOINT` in the iOS app configuration to the deployed web route:

```text
https://<deployment-domain>/api/kairos
```

The iOS client adapter sends the same request contract used by the web runtime.
