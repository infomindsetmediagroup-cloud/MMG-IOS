# MMG/Kairos Foundation Baseline

## Status
Frozen as the Foundation Baseline after repository workflow validation returned green.

This baseline establishes the first validated Kairos runtime bridge and MMG web scaffold. It is the accepted starting point for the Production Operationalization phase.

## Baseline Scope

### Repository Foundation
- Implementation backlog indexed.
- Kairos OpenAI API Runtime Wiring work order added.
- Kairos Conversational Intelligence constitutional amendment added.
- Kairos Production Operationalization work order added.
- Foundation PR metadata updated to reflect validated scope.

### Web Runtime Foundation
- Next.js app scaffold added under `apps/mmg-web`.
- `/api/kairos` runtime gateway added.
- `/api/health` route added.
- `/api/kairos/audit` route scaffold added.
- Server-side OpenAI provider wrapper added.
- Runtime validation, safe errors, logging, timeout, rate limiting, department routing, and audit buffering added.
- Hardened auth boundary added: sessions default to public, development role headers are local-only, and production header spoofing is blocked.

### Kairos Assistant Foundation
- Bottom-right Kairos assistant badge added.
- Public chat panel added.
- Browser speech-to-text input added where supported.
- Text transcript remains the canonical interaction artifact.

### iOS Foundation
- iOS Kairos runtime request/response models added.
- iOS runtime configuration added.
- iOS runtime client added.
- iOS remains a client surface; intelligence execution and provider credentials remain server-side.

## Validation
The foundation passed the repository workflow gate:
- Install.
- Type-check.
- Lint.
- Tests.
- Production build.
- iOS simulator workflow reported green by executive validation.

## Frozen Baseline Rule
Future implementation should build from this baseline rather than redesigning it.

Allowed next work:
- Production deployment.
- Trusted authentication.
- Persistence.
- Knowledge grounding.
- Command Center work-order engine.
- Text-to-speech output.
- Knowledge Event candidate pipeline.
- Production QA and smoke testing.

Not allowed without explicit executive approval:
- Replacing the baseline architecture wholesale.
- Moving provider calls client-side.
- Weakening the hardened auth boundary.
- Treating role headers as trusted production auth.
- Allowing automatic Constitutional Core modification from conversations.

## Next Phase
Begin `backlog/KAIROS-PRODUCTION-OPERATIONALIZATION-WORK-ORDER.md`.
