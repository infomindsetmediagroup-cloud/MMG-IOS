# Operations Index

This directory contains operational-prep standards for MMG IOS / Kairos repository execution.

## Core Documents

- `REPOSITORY_OPERATIONAL_PREP.md` — canonical repository reconciliation and execution standard.

## Validation Gate

Manual build verification is controlled through `.github/workflows/ios-build.yml`.

Current validation posture:

- Manual trigger: `workflow_dispatch`
- XcodeGen project regeneration
- Xcode build against the `MMGIOS` scheme
- Post-build file and wiring assertions for the active vertical slice

## Execution Rules

1. Preserve GitHub Actions minutes during rapid development.
2. Use `[skip ci]` for documentation and low-risk structural commits.
3. Run manual validation only at meaningful gates.
4. Keep workflow assertions aligned with the current production-critical slice.
5. Keep source graph, model-container wiring, and root navigation aligned.

## Backlog Link

Operational reconciliation work is tracked in:

- `backlog/OPERATIONAL_RECONCILIATION_QUEUE.md`
