# Customer Release Manual Verification

Use this checklist to verify the controlled customer-release gate without exposing intermediate production assets.

## Preconditions

- `CustomerReleaseRecord` is registered in the app SwiftData model container.
- `CustomerReleaseDashboardView` is reachable through the Release tab.
- At least one approved final `DeliverableRecord` exists with non-empty approval metadata.

## Runtime checks

1. Launch the app.
2. Assemble and approve a final deliverable from the Deliver tab.
3. Open the Release tab and create a customer release.
4. Confirm the release enters Internal Review and preserves its deliverable, project, workflow, task, asset, version, controlled location, and gate metadata.
5. Approve the release and confirm approver metadata is recorded.
6. Publish the release and confirm only approved records can reach Published.

## Governance checks

- Draft, review, internal-only, or approval-missing deliverables must not create customer releases.
- Published releases must not expose editable or intermediate production assets.
- Final publication remains controlled by the approved release-gate policy.
