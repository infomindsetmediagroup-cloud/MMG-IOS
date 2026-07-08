# MMG Web Production Runtime Map

## Application Boundary
`apps/mmg-web` is the production web host for the public MMG site, future dashboard surfaces, and Kairos API runtime integration.

## Runtime Surfaces
- Public website
- Customer dashboard
- Admin dashboard
- Kairos API runtime
- Shopify integration layer
- iOS client integration endpoint

## Kairos Runtime Flow
1. Client sends a structured Kairos request.
2. Web runtime validates the request.
3. Runtime resolves mode and surface.
4. Runtime applies server-side guardrails.
5. Runtime calls the provider wrapper server-side.
6. Runtime returns the canonical Kairos response.
7. Runtime logs safe execution metadata.

## Repository Locations
- `apps/mmg-web`: production web host scaffold.
- `apps/mmg-web/src/lib/kairos`: shared web runtime logic.
- `kairos/backend`: standalone backend runtime scaffold.
- `MMGIOS/Services/KairosRuntime`: iOS client bridge.
- `backlog/KAIROS-OPENAI-API-RUNTIME-WIRING.md`: approved P0 work order.

## Required Environment
- `OPENAI_API_KEY`: server-only provider credential.
- `KAIROS_OPENAI_MODEL`: server-side model selection.
- `NEXT_PUBLIC_KAIROS_API_ENDPOINT`: client-facing Kairos endpoint path.

## Next Integration Targets
- Add Next.js route handler for `POST /api/kairos`.
- Add public homepage shell.
- Add customer dashboard shell.
- Add admin dashboard shell.
- Add authentication middleware.
- Add department router.
- Add Trust Layer audit persistence.
