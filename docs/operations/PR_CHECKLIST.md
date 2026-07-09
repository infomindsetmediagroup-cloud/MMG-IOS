# Pull Request Checklist

Use this checklist before moving an MMG IOS / Kairos pull request from draft to ready.

## Scope Control

- The PR has one clear operational purpose.
- Runtime changes, validation changes, and documentation changes are separated in the summary.
- The PR does not mix unrelated product slices.
- The PR remains draft while implementation is still being batched.

## Build Contract

- `project.yml` includes every required source directory.
- `xcodegen generate` remains the project-generation authority.
- The manual iOS workflow remains `workflow_dispatch` unless explicitly changed for a release gate.
- Commits that should not consume GitHub Actions minutes use `[skip ci]`.
- Workflow changes preserve `contents: read` permissions unless a stronger permission is explicitly required.
- Workflow changes preserve ref-level concurrency so stale manual runs are canceled.

## Runtime Registration

- New SwiftData records are registered in `MMGIOS/App/MMGIOSApp.swift`.
- New root surfaces are wired in `MMGIOS/App/AppRootView.swift`.
- New feature directories are covered by workflow validation assertions.
- New vertical slices have targeted validation blocks instead of generic grep expansion only.

## Operational Documentation

- `docs/operations/` is updated when repository behavior, validation contracts, or triage rules change.
- Build failures are classified as compiler/project failures or post-build validation failures.
- The PR body explains operational impact, not only code changes.
- The PR body states whether a final manual build gate is still required.
- `IMPLEMENTATION_SEQUENCE.md` is updated when the standard production-slice order changes.
- `RELEASE_GATE_STANDARD.md` is updated when release-gate timing, readiness, or merge rules change.

## Release Readiness

- Draft PRs may remain unmerged while implementation is still being batched.
- Ready PRs should be mergeable, scoped, and aligned with the current validation contract.
- Merge commits or squash commits should preserve `[skip ci]` when avoiding unnecessary Actions minutes is the priority.
- Final release-gate runs should be intentional, manual, and attached to the branch that will be merged.
- A PR should not leave draft unless the branch has a passing release gate or an explicit decision that no new gate is required.
