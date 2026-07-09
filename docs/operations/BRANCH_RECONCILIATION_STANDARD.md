# Branch Reconciliation Standard

Use this standard when a pull request has accumulated multiple commits or when repository structure needs to be prepared for operational handoff.

## Purpose

Branch reconciliation keeps MMG IOS / Kairos implementation work accurate, reviewable, and efficient without wasting GitHub Actions minutes during active development.

The goal is not to polish history for its own sake. The goal is to make the branch easy to validate, easy to review, and safe to merge.

## Default Reconciliation Order

1. Confirm the PR has one operational purpose.
2. Confirm the branch is mergeable against `main`.
3. Review the changed-file set for accidental scope expansion.
4. Separate failures into build failures, validation-contract failures, and documentation drift.
5. Update operational documentation before moving the PR out of draft.
6. Run the manual release gate only when the branch is ready for a final signal.
7. Move from draft to ready only after the release gate passes or after an explicit executive decision that no new gate is required.

## Efficiency Rules

- Do not trigger automated validation for every documentation or low-risk structure commit.
- Use `[skip ci]` for commits that only reconcile docs, checklists, or operational standards.
- Prefer one intentional manual gate over repeated automatic runs.
- Keep `workflow_dispatch` as the default validation trigger unless the repository enters a dedicated release posture.
- Preserve ref-level concurrency so stale manual runs are canceled.

## Accuracy Rules

A branch is accurate only when these layers agree:

- `project.yml` source registration.
- Swift runtime files.
- SwiftData model registration.
- Root app surface wiring.
- Manual workflow assertions.
- Operations documentation.
- PR body summary and validation notes.

If any layer drifts, fix the drift before treating the branch as release-ready.

## Structure Rules

A reconciled PR should be understandable from the repository alone.

Required structure:

- The PR title names the operational purpose.
- The PR body explains summary, why, validation posture, operational impact, and follow-up gate.
- `docs/operations/` explains any new repository behavior or validation rule.
- The workflow validates runtime-critical surfaces without becoming a broad, noisy grep script.
- The branch remains draft while the implementation batch is still evolving.

## Ready-for-Review Gate

Before marking a reconciled branch ready for review, confirm:

- The latest branch head has the intended changed-file set.
- The branch is mergeable.
- The manual iOS build gate has passed if a final validation signal is required.
- Any post-build validation failure has been corrected at the validation-contract layer, not bypassed.
- The PR body reflects the current state of the branch.

## Merge Preparation

Before merge:

- Prefer a clean squash merge if the branch contains many iterative commits.
- Preserve the operational intent in the squash title and body.
- Do not merge if the PR has unresolved review threads, failed required checks, or stale validation language.
- After merge, start the next production slice from the updated `main` branch rather than stacking unrelated work onto the reconciled PR.
