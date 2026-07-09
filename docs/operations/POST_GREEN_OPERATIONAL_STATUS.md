# Post-Green Operational Status

## Status

The `main` branch has cleared the manual iOS validation gate after the PR13 reconciliation merge.

## Current validation gate

The canonical native iOS validation path is:

1. Open GitHub Actions.
2. Select **Manual iOS Validation**.
3. Run the workflow against `main` unless validating a specific branch or SHA.
4. Keep the default simulator destination unless a focused device target is required.
5. Treat green as the current repository health gate for the native iOS scaffold.

## Operational baseline

The current `main` branch is suitable for continued execution work because it has:

- a generated Xcode project path through XcodeGen;
- a manual macOS build gate that does not run on every push;
- a SwiftUI runtime shell wired through `AppRootView`;
- SwiftData model registration for workflow, task, queue, design studio, asset, deliverable, customer release, customer portal, value discovery, and knowledge vault records;
- Command Center runtime summary wiring;
- Customer Portal, Design Studio, Asset Management, Deliverables, Release, Workflow Runtime, Production Queue, and Task Engine source slices;
- repository-level preservation of the Kairos backend and MMG web runtime scaffold restored through PR13.

## Execution rule from this point

Continue in small production slices. Each slice should:

1. branch from the latest green `main`;
2. make one coherent runtime or documentation improvement;
3. avoid push-triggered validation during active development;
4. open a pull request for review and merge discipline;
5. run Manual iOS Validation only at the merge-readiness gate or after merge to confirm `main` remains green.

## Next recommended production slice

The next highest-leverage slice is **Command Center Live Operations Integration**:

- surface live release-gate state more clearly in the Command Center;
- add status language that separates draft, review, blocked, publish-ready, and published releases;
- preserve the production-only asset doctrine by keeping intermediate assets out of customer-published release counts;
- keep the source graph aligned with `project.yml` and the manual validation assertions.
