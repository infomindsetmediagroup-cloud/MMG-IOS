# Command Center Release Gate Operations

## Purpose

The Command Center must expose customer-release readiness as an executive operational signal, not as a hidden deliverables detail.

## Release states surfaced in Command Center

- **Draft / Internal Review**: release record exists but still needs approval or gate completion.
- **Blocked by Gates**: one or more release gates are failing and customer publication must not proceed.
- **Publish Ready**: all release gates pass and the release has not yet been published.
- **Published**: release has cleared gates and has been published to the Customer Portal.

## Production-only asset doctrine enforcement

The Command Center release metrics must preserve the distinction between internal production assets and approved final customer deliverables.

Intermediate assets, editable files, drafts, layered files, reusable components, and in-progress production materials must remain inside MMG/Kairos unless explicitly approved as final customer deliverables.

## Operational signal

Blocked releases should be treated as executive attention items. Publish-ready releases should be treated as controlled handoff candidates. Published releases should be counted separately so the Command Center does not confuse staged assets with customer-visible deliverables.

## Runtime implementation

`CommandCenterRuntimeSummaryView` now includes a Release Gate Operations section that evaluates `CustomerReleaseRecord` items with `CustomerReleaseGatePolicy` and surfaces the first blocking gate detail when publication is not yet allowed.
