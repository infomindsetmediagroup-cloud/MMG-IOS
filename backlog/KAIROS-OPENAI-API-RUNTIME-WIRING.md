# Kairos OpenAI API Runtime Wiring

## Status
Approved P0 execution work order. Initial iOS client runtime scaffold committed in PR #9.

## Capability Mapping
- P0: AI Gateway
- P0: Knowledge Platform
- P0: Customer Platform
- P1: Trust Layer

## Constitutional Authority
This work order implements the execution-mode doctrine that Kairos production intelligence must run through a secure backend runtime, not through the consumer ChatGPT application. It preserves MMG/Kairos separation of concerns by keeping the frontend as the user experience layer and the backend as the controlled intelligence gateway.

## Objective
Configure the MMG/Kairos website, app, and future customer portal so production AI intelligence is routed through a secure Kairos backend endpoint that calls the OpenAI API server-side.

The frontend must never expose OpenAI credentials, provider secrets, internal routing rules, department prompts, customer intelligence context, or privileged Kairos system instructions.

## Required Implementation Scope

### 1. Backend API Route
Add a secure backend API route, provisionally named:

```text
/api/kairos
```

The route must:
- Accept authenticated Kairos requests from approved MMG frontend surfaces.
- Validate request method, content type, payload shape, and user/session authority.
- Normalize user input into a controlled Kairos runtime request.
- Route requests to the appropriate Kairos department, workflow, or public assistant mode.
- Call the OpenAI API server-side.
- Return only safe, customer-appropriate output to the frontend.

### 2. Server-Side Secret Handling
Store the OpenAI credential only in server-side environment variables or deployment secrets:

```text
OPENAI_API_KEY
```

Rules:
- Do not place this key in client code.
- Do not commit this key to the repository.
- Do not expose this key through frontend config, public bundles, logs, analytics, browser dev tools, or customer-visible payloads.
- Add `.env.local`, `.env`, and equivalent secret files to `.gitignore` where applicable.

### 3. OpenAI Client Runtime
Create a backend runtime layer that can:
- Initialize the OpenAI API client from server-only configuration.
- Apply a canonical Kairos system instruction baseline.
- Support department-specific routing later without rewriting the public endpoint.
- Accept structured request context for public, authenticated customer, and admin modes.
- Return structured response objects that can support provenance, confidence, approvals, and audit trails in later Trust Layer work.

### 4. Frontend Integration Contract
Frontend surfaces must call the Kairos backend endpoint rather than calling OpenAI directly.

Initial request contract:

```json
{
  "mode": "public|customer|admin",
  "surface": "website|dashboard|ios",
  "message": "string",
  "context": {}
}
```

Initial response contract:

```json
{
  "reply": "string",
  "mode": "public|customer|admin",
  "department": "kairos-core",
  "status": "ok"
}
```

### 5. Runtime Guardrails
The endpoint must enforce:
- No client-supplied system prompt override.
- No direct model/provider selection from the public client unless explicitly allowed.
- Payload size limits.
- Basic rate-limit readiness.
- Structured error responses that do not leak internal secrets or stack traces.
- A future-ready place for customer identity, vault access, and approval-state checks.

### 6. Logging and Trust Readiness
Add lightweight runtime logging hooks suitable for future Trust Layer expansion.

The first implementation should preserve:
- Timestamp.
- Surface.
- Mode.
- Department.
- Request status.
- Error classification, if any.

Do not log sensitive prompts, secrets, payment data, private customer vault content, or full personally identifiable information.

## Initial iOS Runtime Scaffold
PR #9 adds the iOS-side bridge for this contract:
- `MMGIOS/Services/KairosRuntime/KairosRuntimeModels.swift`
- `MMGIOS/Services/KairosRuntime/KairosRuntimeConfiguration.swift`
- `MMGIOS/Services/KairosRuntime/KairosRuntimeClient.swift`
- `MMGIOS/Services/KairosRuntime/README.md`
- `docs/KAIROS-RUNTIME-CONFIGURATION.md`

This establishes the client boundary without introducing direct provider calls into the iOS app.

## Acceptance Criteria
- A server-side Kairos API endpoint exists.
- The endpoint reads `OPENAI_API_KEY` from server-only environment configuration.
- No OpenAI API key or provider secret is exposed to the frontend.
- Frontend integration calls Kairos backend instead of OpenAI directly.
- Request and response payloads are structured and documented.
- Invalid requests return safe structured errors.
- The implementation leaves clear extension points for customer intelligence, department routing, audit history, and approval workflows.
- Repository documentation identifies how the runtime should be configured in development and production.

## Out of Scope for First Pass
- Full customer vault retrieval.
- Multi-agent department orchestration.
- Billing and usage metering.
- Fine-grained admin approval workflows.
- Long-term conversation memory.
- Production-grade rate limiting beyond safe scaffolding.
- Any committed production secrets.

## Engineering Notes
- Treat the backend as the authoritative OpenAI runtime boundary.
- Treat the frontend as an experience layer only.
- Keep the first implementation small, secure, and extensible.
- Prefer explicit interfaces over implicit prompt behavior.
- Preserve compatibility with Shopify, native iOS, and future dashboard surfaces.

## Execution Order
1. Identify the active web/backend runtime target.
2. Add server-side environment variable support.
3. Add `/api/kairos` endpoint.
4. Add OpenAI client wrapper.
5. Add request validation and safe error handling.
6. Add frontend call adapter.
7. Add documentation for development and production configuration.
8. Run available lint/build checks when the runtime target exists.

## Commit Target
`Add Kairos OpenAI API runtime wiring work order`
