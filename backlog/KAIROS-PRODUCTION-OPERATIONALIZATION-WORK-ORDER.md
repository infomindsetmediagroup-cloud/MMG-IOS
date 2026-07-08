# Kairos Production Operationalization Work Order

## Status
Next-phase implementation work order. Begin after the Kairos runtime foundation PR is merged or otherwise accepted as the foundation baseline.

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

## Operationalization Scope

### 1. Production Deployment
Implement a deployable production target.

Requirements:
- Select and configure hosting target.
- Configure build command and output settings.
- Configure required environment variables.
- Add deployment documentation.
- Verify production health route.
- Confirm `/api/kairos` executes server-side only.

Acceptance criteria:
- Production deployment builds successfully.
- `/api/health` returns `ok` in production.
- `/api/kairos` does not expose provider credentials client-side.

### 2. Trusted Authentication
Replace temporary role-header development behavior with trusted session resolution.

Requirements:
- Add customer authentication provider.
- Add admin authentication provider or admin role mapping.
- Protect dashboard routes.
- Protect admin routes.
- Ensure customer/admin mode cannot be requested by unauthenticated clients.
- Preserve local-only development override for controlled testing only.

Acceptance criteria:
- Public users can only use public mode.
- Authenticated customers can use customer mode only for their own account.
- Admin users can access admin routes and admin mode.
- Spoofed client headers cannot elevate access.

### 3. Persistence Layer
Add durable storage for operational state.

Required data domains:
- Conversations.
- Messages and transcripts.
- Customer profile references.
- Audit events.
- Knowledge Event candidates.
- Work orders.
- Approval records.

Acceptance criteria:
- Conversations persist across sessions when authenticated.
- Anonymous conversations are handled according to privacy policy and retention rules.
- Audit events survive server restarts.
- Knowledge candidates are stored without secrets or unsafe raw data.

### 4. Knowledge Grounding
Connect Kairos to approved MMG knowledge sources.

Initial sources:
- Public product/service information.
- Knowledge Library metadata.
- Policies and FAQs.
- Customer-owned resources and purchases.
- Admin-only operational documentation.

Acceptance criteria:
- Public mode uses only public knowledge.
- Customer mode uses only that customer's permissioned context plus approved public knowledge.
- Admin mode can use approved internal operational knowledge.
- Responses should indicate uncertainty rather than invent unsupported business facts.

### 5. Command Center Workflow
Implement the executive operating loop.

Canonical flow:
1. Executive input through text or voice.
2. Transcript normalization.
3. Intent analysis.
4. Execution plan generation.
5. Approval gate.
6. Department execution.
7. QA verification.
8. Final deliverable.
9. Final executive acceptance.

Acceptance criteria:
- No privileged operation executes without approval.
- Every work order has status, owner, timestamps, approval trail, and final output.
- Failed executions return actionable recovery information.

### 6. Text-to-Speech Output
Add optional spoken Kairos responses.

Requirements:
- User-controlled voice output setting.
- Text transcript remains canonical.
- Speech output falls back gracefully to text.
- Future voice profile support remains extensible.

Acceptance criteria:
- Kairos can speak responses when enabled.
- Text transcript is always displayed.
- Disabled or failed audio does not break chat.

### 7. Knowledge Lifecycle Engine
Operationalize governed learning from interactions.

Requirements:
- Convert relevant conversations into Knowledge Event candidates.
- Categorize candidates.
- Store candidates for Trust Layer review.
- Prevent automatic Constitutional Core changes.
- Prevent cross-customer leakage.

Acceptance criteria:
- Knowledge candidates are generated from conversations.
- Candidates require review before becoming institutional knowledge.
- Customer-specific insights remain isolated.

### 8. Production Quality Gate
Every operationalization milestone must pass:
- Type-check.
- Lint.
- Unit tests.
- Production build.
- Route smoke tests.
- Auth boundary tests.
- Data isolation tests.
- Deployment health verification.

## Not Yet Operational Until
Kairos should not be considered operational until all of the following are true:
- Production deployment is live.
- Auth is trusted and route protection is active.
- Persistence exists for conversations, audit, and work orders.
- Knowledge grounding is connected.
- Command Center approval workflow works end-to-end.
- CI and production smoke tests pass.

## Implementation Sequence
1. Merge or accept the runtime foundation baseline.
2. Configure production deployment.
3. Add trusted auth and route protection.
4. Add persistence layer.
5. Add conversation persistence.
6. Add knowledge grounding.
7. Add command center work-order engine.
8. Add text-to-speech output.
9. Add Knowledge Event candidate pipeline.
10. Run production readiness review.
