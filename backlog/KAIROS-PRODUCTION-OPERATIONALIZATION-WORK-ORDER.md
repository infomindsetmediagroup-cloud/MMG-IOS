# Kairos Production Operationalization Work Order

## Status
Active. Foundation baseline accepted and frozen. Production operationalization has started.

## Immediate Priority
P0 next work is Command Center Live Operations.

The next implementation pass must align the Command Center with `docs/COMMAND-CENTER-LIVE-OPERATIONS-DOCTRINE.md` before broad Command Center expansion continues.

Required first pass:
- Main Control Panel with five primary parent cards.
- Parent selection that switches the lower content area into that parent only.
- Return action from every focused parent view back to the Main Control Panel.
- Live-state contracts for status, workflow progress, queues, processing states, and activity streams.
- Replaceable development adapter where production telemetry is not yet available.
- Reusable live-status components.

## Objective
Move Kairos from validated runtime scaffold to operational production system. This phase turns the current web/iOS runtime bridge into a deployed, authenticated, persistent, knowledge-grounded, approval-gated platform foundation.

## Current Foundation Baseline
The foundation PR establishes:
- Next.js MMG web app scaffold.
- Server-side `/api/kairos` runtime boundary.
- OpenAI provider wrapper on the server side.
- Public Kairos assistant badge.
- Browser speech-to-text input path.
- iOS Kairos runtime adapter.
- Basic validation, safe errors, logging, timeout handling, rate limiting, and audit buffer.
- Hardened temporary auth boundary that defaults to public and ignores role headers in production.
- CI verification for install, type-check, lint, tests, and build.

## Operationalization Progress
- Production readiness health contract started.
- Trusted-auth session resolver seam started.
- Persistence domain models and repository interfaces started.
- In-memory persistence adapter added for development and tests only.
- Command Center Live Operations doctrine added and elevated as next immediate work.

## Operationalization Scope

### 1. Command Center Live Operations
Establish the live Command Center architecture before further Command Center expansion.

Acceptance criteria:
- Command Center supports home to focused parent view to home.
- Dynamic visuals are connected to a state contract or isolated development adapter.
- No visual activity is treated as production truth unless backed by real state.

### 2. Production Deployment
Implement a deployable production target.

### 3. Trusted Authentication
Replace temporary role-header development behavior with trusted session resolution.

### 4. Persistence Layer
Add durable storage for conversations, messages, audit events, knowledge candidates, work orders, and approvals.

### 5. Knowledge Grounding
Connect Kairos to approved MMG knowledge sources.

### 6. Command Center Work Loop
Implement the executive operating loop with approval-gated work.

### 7. Text-to-Speech Output
Add optional spoken Kairos responses while preserving text transcripts.

### 8. Knowledge Lifecycle Engine
Operationalize governed learning from interactions.

### 9. Production Quality Gate
Every operationalization milestone must pass type-check, lint, tests, production build, route smoke tests, auth boundary tests, data isolation tests, and deployment health verification.

## Not Yet Operational Until
Kairos should not be considered operational until all of the following are true:
- Command Center dynamic views are backed by live-state contracts or isolated replaceable adapters.
- Production deployment is live.
- Auth is trusted and route protection is active.
- Durable persistence exists for conversations, audit, and work orders.
- Knowledge grounding is connected.
- Command Center approval workflow works end-to-end.
- CI and production smoke tests pass.

## Implementation Sequence
1. Implement Command Center Live Operations.
2. Configure production deployment.
3. Add trusted auth and route protection.
4. Add persistence layer.
5. Add conversation persistence.
6. Add knowledge grounding.
7. Add command center work-order engine.
8. Add text-to-speech output.
9. Add Knowledge Event candidate pipeline.
10. Run production readiness review.
