# Customer Release Gate Detail Slice

## Purpose

Add a focused drill-down view for customer release gate state so operators can inspect exactly why a release is blocked or cleared before customer publication.

## Runtime changes

- Adds `CustomerReleaseGateDetailView`.
- Routes release queue rows in `CustomerReleaseDashboardView` into the gate detail screen.
- Shows each `CustomerReleaseGatePolicy` result with a pass/fail marker and detail text.
- Adds blocked-release count to the Customer Release runtime summary.

## Doctrine preserved

The detail view reinforces that only approved final deliverables may be released to controlled Customer Portal access. Intermediate production assets, editable files, layered files, drafts, and reusable source materials remain internal unless explicitly approved as final customer deliverables.

## Validation plan

Run **Manual iOS Validation** against `agent/customer-release-gate-detail` before merge.

Recommended inputs:

- Branch, tag, or SHA to validate: `agent/customer-release-gate-detail`
- xcodebuild destination for simulator build: `generic/platform=iOS Simulator`
