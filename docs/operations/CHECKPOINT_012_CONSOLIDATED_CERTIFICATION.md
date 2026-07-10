# MMG/Kairos Checkpoint 012 — Consolidated Certification Harness

**Status:** Static certification passed; ready for review  
**Branch:** `checkpoint-012-consolidated-certification`  
**Certified branch head:** `b42dd4841190bf14a89e5ed7c28f86c43b37dd8e`  
**Certification date:** 2026-07-10  
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

## Certification evidence

A fresh manual workflow dispatch against `checkpoint-012-consolidated-certification` completed successfully in approximately ten seconds after the initial failed run exposed and the branch corrected:

- missing Node and Express type packages
- missing Node compiler type configuration
- Publishing domain metadata/status collisions
- incorrectly narrowed Kairos route mode and surface variables

The successful run proves the selected branch head compiled under strict TypeScript settings and passed the repository certification tests available in this checkpoint.

## Certification boundary

This successful static certification proves the selected ref builds and passes repository tests. It does not replace Checkpoint 007's secret-dependent live session lifecycle validation. Runtime certification remains separately required for session exchange, secure cookie attributes, logout, fallback, and enforcement.

## Merge and post-merge gate

1. Review and merge PR #61.
2. Run `Manual Consolidated Certification` against `main` after merge.
3. Record the post-merge workflow URL and tested `main` SHA.
4. Complete the separate Checkpoint 007 live-session compatibility and enforcement runs.
5. Do not declare the complete runtime frozen until both static and live evidence are recorded.

## Constraints

- manual dispatch only
- no automatic Actions-minute consumption
- no credentials in the repository
- no external side effects
- Checkpoint 006 remains the certified runtime rollback baseline until live certification is complete
