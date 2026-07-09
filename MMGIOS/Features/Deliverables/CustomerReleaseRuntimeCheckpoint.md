# Customer Release Runtime Checkpoint

## Status

Customer Release Runtime is now wired as the controlled publication layer after approved deliverables.

## Implemented

- `CustomerReleaseStatus`, `CustomerReleaseChannel`, and `CustomerReleaseGate` enums.
- `CustomerReleaseRecord` SwiftData persistence model.
- `ReleaseApprovalService` for create, approve, publish, archive, and eligibility gating.
- `CustomerReleaseDashboardView` with runtime counts, release queue, and blocked deliverable visibility.
- `CustomerReleaseRecord` registered in the app SwiftData model container.
- Release tab added to the app shell.
- Manual verification checklist for local validation without GitHub Actions minutes.

## Governance Locked

- Only approved final deliverables can create customer release records.
- Internal-only, draft, review, or approval-missing deliverables are blocked from customer publication.
- Customer release records preserve version, source deliverable linkage, asset linkage, approval metadata, gate summary, and controlled workspace location.
- Intermediate assets remain inside MMG/Kairos production control unless explicitly approved as final deliverables.

## Next Gate

Build the Customer Portal Value Delivery layer so published releases can be surfaced to customers as controlled portal items without exposing editable production assets.
