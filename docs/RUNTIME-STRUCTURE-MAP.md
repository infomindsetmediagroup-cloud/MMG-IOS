# Runtime Structure Map

## Layer order

1. App Shell
2. Customer Portal
3. Command Runtime Summary
4. Workflow Runtime
5. Task Engine
6. Production Queue
7. Design Studio Project Runtime
8. Knowledge Vault Context
9. Future Asset / Deliverable / Approval Layer

## App Shell

Files:

- `MMGIOS/App/MMGIOSApp.swift`
- `MMGIOS/App/AppRootView.swift`

Responsibilities:

- Register SwiftData models.
- Expose internal runtime validation tabs.
- Preserve app entry without triggering CI-heavy validation.

## Workflow Runtime

Files:

- `WorkflowEnums.swift`
- `WorkflowRecord.swift`
- `WorkflowTransitionRecord.swift`
- `WorkflowStagePolicy.swift`
- `WorkflowStageProgress.swift`
- `WorkflowRuntimeService.swift`
- `WorkflowRuntimeDashboardView.swift`

Responsibilities:

- Own workflow lifecycle.
- Validate stage transitions.
- Track progress.
- Persist transition history.

## Task Engine

Files:

- `TaskEnums.swift`
- `TaskRecord.swift`
- `TaskDependencyRecord.swift`
- `TaskRuntimeService.swift`

Responsibilities:

- Create tasks from workflows.
- Track department ownership.
- Validate dependencies.
- Support start, block, and completion states.

## Production Queue

Files:

- `ProductionQueueEnums.swift`
- `ProductionQueueRecord.swift`
- `ProductionQueueService.swift`

Responsibilities:

- Convert task work into operational queue items.
- Group work by lane.
- Track blocked and completed queue states.

## Command Runtime Summary

Files:

- `CommandCenterRuntimeSummaryView.swift`

Responsibilities:

- Surface workflow totals.
- Surface queue depth.
- Surface blocked queue count.
- Show lane-level queue metrics.

## Design Studio Runtime

Files:

- `DesignStudioProjectRecord.swift`
- `DesignStudioProjectFactory.swift`
- `DesignStudioWorkflowView.swift`

Responsibilities:

- Create production projects.
- Generate workflow, task, queue, and knowledge records from one factory path.
- Preserve IDs across related runtime records.

## Knowledge Vault Context

Files:

- `KnowledgeVaultRecord.swift`

Responsibilities:

- Store project context.
- Store brand profile context.
- Preserve decision history for future Kairos context assembly.

## Next approved layer

After local build validation, build on top of this structure in this order:

1. Asset Management Foundation.
2. Deliverables Engine.
3. Approval Engine.
4. Notification Runtime.
5. Production Timeline.
