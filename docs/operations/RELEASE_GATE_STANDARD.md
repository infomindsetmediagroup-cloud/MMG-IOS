# Release Gate Standard

This document defines how MMG IOS / Kairos branches move from active implementation to release-ready status.

## Purpose

The release gate exists to prove that a branch is operationally coherent before merge. It is not a development loop and should not be used for every small commit.

## Gate Timing

Run the manual iOS workflow only when one of the following is true:

- A draft PR is being considered for ready-for-review.
- A branch is being considered for merge.
- A validation contract changed and needs a fresh proof signal.
- A compiler, project, or runtime wiring failure has been fixed and needs confirmation.

Do not run the release gate for documentation-only or low-risk operational-index changes unless the branch is otherwise ready for a final signal.

## Pre-Gate Checklist

Before running the gate, confirm:

1. The PR has one clear operational purpose.
2. `project.yml` includes all required source directories.
3. `MMGIOS/App/MMGIOSApp.swift` registers all required persisted models.
4. `MMGIOS/App/AppRootView.swift` exposes all required runtime surfaces.
5. `.github/workflows/ios-build.yml` validates the current runtime graph.
6. `docs/operations/` reflects the current validation and triage posture.
7. The PR body states build posture and remaining gate requirements.

## Expected Gate Behavior

The manual workflow should perform these checks in order:

1. Checkout.
2. Xcode version visibility.
3. XcodeGen installation.
4. Project generation.
5. Scheme and destination visibility.
6. Package dependency resolution.
7. Simulator build with signing disabled.
8. Post-build validation assertions.

A successful gate must reach `** BUILD SUCCEEDED **` and complete the post-build validation block.

## Failure Classification

Classify failures by where they occur:

- Before `** BUILD SUCCEEDED **`: compiler, XcodeGen, simulator, dependency, or project-structure failure.
- After `** BUILD SUCCEEDED **`: validation contract, missing registration, missing runtime surface, or stale assertion failure.

This classification determines the fix path and prevents unnecessary changes to unrelated Swift files.

## Ready-for-Review Rule

A PR can move from draft to ready only after:

- The branch has a passing release gate or an explicit decision that no new gate is required.
- The PR body accurately reflects the current validation posture.
- Operations documentation matches the workflow and runtime graph.
- The PR remains scoped to one operational purpose.

## Merge Rule

Before merge, preserve the GitHub Actions minutes doctrine:

- Keep manual gates intentional.
- Avoid automatic CI triggers during active batching.
- Use `[skip ci]` on low-risk structural or documentation commits.
- Run the final gate from the exact branch intended for merge.
