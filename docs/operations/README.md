# Operations Index

This directory contains operational standards for MMG IOS / Kairos repository execution.

## Core Documents

- `SOURCE_GRAPH_AUDIT.md` — current runtime source graph, SwiftData model registration, root surface wiring, and validation contract.

## Manual Validation

Manual build verification is controlled through `.github/workflows/ios-build.yml`.

Current validation posture:

- Manual trigger: `workflow_dispatch`
- XcodeGen project regeneration
- Xcode build against the `MMGIOS` scheme
- Post-build assertions for source graph, model registration, runtime surfaces, customer portal value discovery, deliverables, and release wiring

## Execution Rule

Preserve GitHub Actions minutes during active development. Use `[skip ci]` for documentation and low-risk structural commits unless explicitly running a manual validation gate.

## Repository Operating Standard

Use this repository as the canonical operational source of truth for MMG IOS implementation. Keep runtime features, validation gates, and operational documentation aligned so a passing build reflects actual readiness rather than stale assertions.

Recommended sequence for future production slices:

1. Add or update the Swift runtime files.
2. Register the source path in `project.yml` when adding a new feature directory.
3. Register persisted SwiftData records in `MMGIOS/App/MMGIOSApp.swift`.
4. Wire user-facing or operator-facing surfaces through `MMGIOS/App/AppRootView.swift`.
5. Extend `.github/workflows/ios-build.yml` validation assertions.
6. Update the corresponding document in `docs/operations/`.

## Failure Classification

- Compiler, XcodeGen, or simulator build failure: fix Swift/project structure first.
- Post-build assertion failure: fix validation drift, missing registration, or incomplete surface wiring first.
- Documentation-only drift: update operations docs with `[skip ci]` unless a manual validation gate is required.
