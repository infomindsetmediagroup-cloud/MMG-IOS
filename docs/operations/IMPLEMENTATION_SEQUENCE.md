# Implementation Sequence

This document defines the standard order of execution for MMG IOS / Kairos production slices.

## Purpose

MMG IOS should advance through disciplined vertical slices. Each slice must preserve the relationship between source graph, persistence, runtime surfaces, validation assertions, and operational documentation.

## Default Slice Order

1. Define the operational purpose of the slice.
2. Add or update Swift source files inside the correct `MMGIOS/Features/` module.
3. Register any new feature directory in `project.yml`.
4. Register new SwiftData models in `MMGIOS/App/MMGIOSApp.swift`.
5. Wire new customer-facing or operator-facing views in `MMGIOS/App/AppRootView.swift`.
6. Add targeted workflow assertions in `.github/workflows/ios-build.yml`.
7. Update `docs/operations/` with any new validation, triage, or release rules.
8. Keep the PR in draft until the slice is stable.
9. Run a manual workflow gate only when the branch needs a final readiness signal.
10. Move the PR to ready only after build, validation, and documentation are aligned.

## Batch Discipline

During active implementation, batch related repository changes before running manual validation. Do not spend GitHub Actions minutes validating every small documentation or assertion adjustment.

Use `[skip ci]` for low-risk commits unless a manual gate is intentionally required.

## Validation Ownership

Every production slice owns its validation contract.

A complete slice includes:

- Source files included by XcodeGen.
- Persisted models registered in the SwiftData model container when applicable.
- Runtime surfaces reachable from the app root when applicable.
- Post-build assertions that prove the slice remains wired.
- Documentation explaining how to triage future failures.

## Merge Readiness

A PR is not operationally ready just because Swift compiles. A PR is ready when:

- The build succeeds.
- The validation contract matches the actual runtime graph.
- The PR body states the current gate posture.
- Documentation reflects any new operating rules.
- The branch remains scoped to one operational purpose.

## Failure Response

When a manual gate fails, classify the failure before changing code:

- Compiler or XcodeGen failure: fix source/project structure first.
- Post-build assertion failure: fix validation drift or missing runtime wiring first.
- Documentation drift: update the operations document with `[skip ci]` unless another manual gate is required.
