# Command Center Release Gate Merge Plan

## Plan

1. Open a draft pull request from `agent/command-center-release-ops` into `main`.
2. Run Manual iOS Validation against the branch.
3. If green, mark the PR ready or merge directly depending on executive approval.
4. After merge, validate `main` if a final green gate is required.

## Merge discipline

This branch should remain focused on Command Center release-gate visibility. Additional runtime work should branch separately after this slice is validated.
