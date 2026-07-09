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
