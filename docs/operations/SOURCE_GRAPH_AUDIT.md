# Source Graph Audit

## Scope

This audit records the current MMG IOS runtime source graph and the validation expectations that protect it.

## XcodeGen Source Paths

The canonical compiled source graph is defined in `project.yml` under `targets.MMGIOS.sources`.

Current runtime source paths:

- `MMGIOS/App`
- `MMGIOS/Config`
- `MMGIOS/Features/AssetManagement`
- `MMGIOS/Features/CommandCenter`
- `MMGIOS/Features/CustomerPortal`
- `MMGIOS/Features/Deliverables`
- `MMGIOS/Features/DesignStudio`
- `MMGIOS/Features/KnowledgeVault`
- `MMGIOS/Features/ProductionQueue`
- `MMGIOS/Features/TaskEngine`
- `MMGIOS/Features/WorkflowRuntime`

The `WorkflowRuntimeSpec.md` document is intentionally excluded from compilation through `project.yml`.

## Runtime Surface Wiring

Current root shell surfaces expected in `MMGIOS/App/AppRootView.swift`:

- `CommandCenterRuntimeSummaryView`
- `WorkflowRuntimeDashboardView`
- `CustomerPortalView`
- `DesignStudioWorkflowView`
- `AssetManagementDashboardView`
- `DeliverablesDashboardView`
- `CustomerReleaseDashboardView`

## SwiftData Model Registration

Current persisted runtime models expected in `MMGIOS/App/MMGIOSApp.swift`:

- `WorkflowRecord`
- `WorkflowTransitionRecord`
- `TaskRecord`
- `TaskDependencyRecord`
- `ProductionQueueRecord`
- `DesignStudioProjectRecord`
- `ProductionAssetRecord`
- `DeliverableRecord`
- `CustomerReleaseRecord`
- `CustomerPortalNotificationRecord`
- `PersistedCustomerRequestRecord`
- `PersistedValueDiscoveryProfile`
- `KnowledgeVaultRecord`

## Validation Contract

`.github/workflows/ios-build.yml` validates five separate layers:

1. Xcode project generation and simulator build.
2. XcodeGen source-path registration.
3. SwiftData model-container registration.
4. Runtime surface wiring.
5. Vertical-slice assertions for customer portal value discovery, deliverables, and release workflows.

## Triage Standard

When the workflow fails:

- Failure before `** BUILD SUCCEEDED **` = build/compiler/project failure.
- Failure after `** BUILD SUCCEEDED **` = validation contract or runtime wiring assertion failure.

This distinction prevents wasting time debugging Swift compilation when the actual problem is stale or incomplete repository assertions.

## Operational Gate Rules

- Any new feature directory must be added to `project.yml` and the source graph validation step.
- Any new persisted SwiftData model must be registered in `MMGIOSApp.swift` and the model-registration validation step.
- Any new top-level operator/customer surface must be wired in `AppRootView.swift` and the runtime-surface validation step.
- Any new production slice must add a targeted post-build validation block instead of overloading a generic grep check.

## Next Audit Targets

- Add a generated source inventory check if the repository gains script support.
- Add a model-registration checklist when new SwiftData records are introduced.
- Add a vertical-slice checklist for each new customer-facing or operator-facing surface.
