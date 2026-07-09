# Command Center Release Gate Review Checklist

## Code review

- Confirm `CommandCenterRuntimeSummaryView` still compiles as a single SwiftUI view.
- Confirm no duplicate view declarations were introduced.
- Confirm the Release Gate Operations section uses existing runtime types.
- Confirm blocked, draft/internal-review, publish-ready, and published states remain distinct.

## Product review

- Confirm customer publication is represented as a controlled approval outcome.
- Confirm intermediate production assets are not represented as customer-published releases.
- Confirm blocked releases create executive attention without bypassing approval policy.

## Merge-readiness review

- Run Manual iOS Validation against `agent/command-center-release-ops` when ready.
- If green, merge the PR into `main`.
- After merge, run Manual iOS Validation against `main` if a final post-merge gate is required.
