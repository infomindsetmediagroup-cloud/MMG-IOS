# Customer Release Manual Verification Checks

This checklist verifies the customer release gate without spending GitHub Actions minutes.

## Preconditions

- `CustomerReleaseRecord` is registered in `MMGIOSApp` SwiftData model container.
- `CustomerReleaseDashboardView` is reachable from `AppRootView` through the Release tab.
- At least one `DeliverableRecord` exists with:
  - `status == DeliverableStatus.approved.rawValue`
  - `releaseScope == DeliverableReleaseScope.approvedFinal.rawValue`
  - non-empty `approvedBy`

## Manual Runtime Checks

1. Launch the app locally in Xcode.
2. Open the Deliver tab.
3. Assemble and approve a final deliverable.
4. Open the Release tab.
5. Tap Create.
6. Confirm one customer release enters Internal Review.
7. Confirm the release contains:
   - original deliverable ID
   - project ID
   - workflow ID
   - task ID
   - asset ID
   - version
   - controlled release location
   - production-only gate summary
8. Tap Approve.
9. Confirm the release moves to Approved and records approver metadata.
10. Tap Publish.
11. Confirm only approved releases can move to Published.

## Governance Checks

- Draft or review deliverables must not create customer releases.
- Internal-only deliverables must not create customer releases.
- Deliverables without approval metadata must not create customer releases.
- Published releases must preserve the doctrine that intermediate assets remain inside MMG/Kairos production control.

## Expected Result

The Customer Release tab provides a controlled final-publication gate after deliverables are approved, without exposing intermediate production assets by default.
