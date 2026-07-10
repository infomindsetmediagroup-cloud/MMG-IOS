# MMG/Kairos Checkpoint 012 — Consolidated Certification Harness

**Status:** Active implementation; validation pending  
**Branch:** `checkpoint-012-consolidated-certification`  
**Baseline:** Checkpoints 007–011 merged into `main` under Constitution v1.0

## Objective

Stop validation debt from compounding by establishing one repeatable backend certification command and one manual-only GitHub Actions gate for merged session, orchestration, platform-service, Publishing, and Design Studio foundations.

## Included

- `npm run test` using Node's built-in test runner through the existing `tsx` runtime
- `npm run certify` combining strict TypeScript build and tests
- deterministic orchestration tests
- unknown-objective fallback test
- cross-domain routing test
- planner side-effect prohibition test
- manual-only consolidated certification workflow using native git

## Certification boundary

A successful static certification run proves the selected ref builds and passes repository tests. It does not replace Checkpoint 007's secret-dependent live session lifecycle validation. Runtime certification remains separately required for session exchange, secure cookie attributes, logout, fallback, and enforcement.

## Merge gate

1. Run `Manual Consolidated Certification` against this branch.
2. Record the workflow URL and tested commit SHA.
3. Correct all failures before merge.
4. After merge, run the same gate against `main`.
5. Do not declare Checkpoints 007–011 frozen until the applicable static and live evidence is recorded.

## Constraints

- manual dispatch only
- no automatic Actions-minute consumption
- no credentials in the repository
- no external side effects
- Checkpoint 006 remains the certified rollback baseline
