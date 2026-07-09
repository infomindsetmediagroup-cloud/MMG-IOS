# Workflow Runtime Validation

## Scope

This checklist validates the first Workflow Runtime foundation slice.

## Runtime files

- `MMGIOS/Features/WorkflowRuntime/WorkflowEnums.swift`
- `MMGIOS/Features/WorkflowRuntime/WorkflowStagePolicy.swift`
- `MMGIOS/Features/WorkflowRuntime/WorkflowStageProgress.swift`

## Manual validation

- Intake may transition to Planning.
- Planning may transition to Production or AI Generation.
- Production may transition to Human Review or Customer Review.
- AI Generation may transition to Human Review.
- Human Review may transition to Customer Review or Approval.
- Customer Review may transition back to Production or forward to Approval.
- Approval may transition to Export.
- Export may transition to Delivery.
- Delivery may transition to Archived.
- Archived has no forward transition.

## Progress validation

- Intake = 5%.
- Planning = 15%.
- Production = 35%.
- AI Generation = 40%.
- Human Review = 55%.
- Customer Review = 65%.
- Approval = 75%.
- Export = 85%.
- Delivery = 95%.
- Archived = 100%.

## Next implementation slice

- Add persisted workflow records.
- Add workflow transition records.
- Register records in SwiftData.
- Attach Design Studio projects to workflows.
