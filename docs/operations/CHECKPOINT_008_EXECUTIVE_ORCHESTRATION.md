# MMG/Kairos Checkpoint 008 — Executive Orchestration Foundation

**Status:** Active implementation  
**Branch:** `checkpoint-008-executive-orchestration`  
**Authority:** Constitution v1.0  
**Authentication dependency:** Checkpoint 007 code on `main`; Checkpoint 006 remains certified rollback baseline until Checkpoint 007 certification is recorded

## Objective

Create the governed orchestration layer that converts a user objective into a traceable routing decision and execution plan without performing autonomous external side effects.

## First-slice scope

1. Canonical objective intake contract.
2. Execution-context contract bound to request, audit, subject, tenant, role, and surface.
3. Department identity and capability contract.
4. Deterministic executive router.
5. Planning contract containing ordered steps, dependencies, risks, approvals, and completion criteria.
6. Explicit command/event distinction.
7. Route-confidence and rationale fields.
8. No external execution, publishing, deployment, financial action, or customer mutation.

## Governing invariants

- Begin with the objective, not the tool.
- Load context before planning.
- Kairos orchestrates; departments specialize; platform services implement.
- Commands request work. Events describe completed facts.
- Every routing decision must be explainable and auditable.
- Department selection must be deterministic for the same normalized input and registry version.
- Unknown or cross-domain objectives route to the Executive Office for clarification or decomposition.
- Authentication and tenant context may not be weakened or bypassed.
- Existing iOS routing concepts must converge on these canonical backend contracts rather than becoming a parallel source of truth.

## Initial canonical departments

- `executive-office`
- `publishing`
- `marketing`
- `design-studio`
- `knowledge`
- `customer-success`
- `engineering`
- `security`
- `commerce`
- `analytics`

The registry is intentionally limited. New departments require demonstrated domain ownership and explicit contract registration.

## Acceptance criteria for the first slice

- Objective input is normalized and validated.
- Router returns one primary department and zero or more supporting departments.
- Decision includes confidence, rationale, matched capabilities, and registry version.
- Planner contract can represent dependencies, risks, approvals, and completion criteria.
- Contracts contain no provider-specific AI assumptions.
- No side effects occur during routing or planning.
- TypeScript build passes before merge.
- Unit coverage is added before Checkpoint 008 certification.

## Deliberate exclusions

- Autonomous department execution
- Durable workflow persistence
- Event-bus delivery
- Customer-facing department marketplace
- Billing and usage accounting
- Production approval automation
- External integrations

Those belong to later vertical slices after the orchestration contracts are validated.

## Checkpoint relationship

Checkpoint 008 may be implemented while Checkpoint 007 certification evidence is pending because its first slice is additive and side-effect free. It may not remove the Checkpoint 006 rollback path or declare the authenticated runtime certified.