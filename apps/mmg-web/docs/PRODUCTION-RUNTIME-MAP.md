# MMG Web Production Runtime Map

## Application Boundary
`apps/mmg-web` is the production web host for the public MMG site, future dashboard surfaces, and Kairos API runtime integration.

## Runtime Surfaces
- Public website
- Customer dashboard
- Admin dashboard
- Command Center live operations
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

## Command Center Runtime Flow
1. MMG/Kairos systems emit structured operational events.
2. Runtime adapters aggregate events into the Command Center telemetry contract.
3. The Command Center renders parent collections, focused views, activity streams, health metrics, and release-gate signals.
4. Customer release gate signals identify blocked, reviewing, or ready customer-facing deliverables.
5. Production telemetry replaces the development adapter before operational status.

## Customer Release Gate Boundary
Customer release gate telemetry must not expose internal drafts, layered source files, reusable production components, AI generations, or intermediate assets as downloadable customer deliverables.

A customer release may be represented as ready only when the underlying release gate has passed:

- Production-only asset check.
- Approval metadata check.
- Final deliverable scope check.
- Customer publication check.

## Repository Locations
- `apps/mmg-web`: production web host scaffold.
- `apps/mmg-web/src/lib/kairos`: shared web runtime logic.
- `apps/mmg-web/src/lib/command-center`: Command Center telemetry contracts and adapters.
- `apps/mmg-web/src/components/command-center`: Command Center runtime UI components.
- `kairos/backend`: standalone backend runtime scaffold.
- `MMGIOS/Services/KairosRuntime`: iOS client bridge.
- `backlog/KAIROS-OPENAI-API-RUNTIME-WIRING.md`: approved P0 work order.
- `backlog/COMMAND-CENTER-LIVE-OPERATIONS-REFACTOR.md`: Command Center live operations work order.

## Required Environment
- `OPENAI_API_KEY`: server-only provider credential.
- `KAIROS_OPENAI_MODEL`: server-side model selection.
- `NEXT_PUBLIC_KAIROS_API_ENDPOINT`: client-facing Kairos endpoint path.

## Next Integration Targets
- Add production telemetry source for Command Center live operations.
- Connect customer release gate signals to persisted customer-release records.
- Add authentication middleware.
- Add department router.
- Add Trust Layer audit persistence.
- Replace development Command Center telemetry adapter with real runtime events.
