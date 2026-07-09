# Production Queue Validation

## Scope

This checklist validates the first Production Queue foundation slice.

## Runtime files

- `MMGIOS/Features/ProductionQueue/ProductionQueueEnums.swift`
- `MMGIOS/Features/ProductionQueue/ProductionQueueRecord.swift`
- `MMGIOS/Features/ProductionQueue/ProductionQueueService.swift`

## Manual validation

- A seeded workflow creates an initial task.
- The initial task creates a production queue item.
- Queue item links to `workflowID` and `taskID`.
- Queue lane derives from the task department.
- Queue priority follows the task priority.
- Queue item defaults to Ready.
- Queue item appears in the Workflow Runtime dashboard.
- Queue item can be completed from the dashboard.
- Completed queue items are excluded from open queue count.

## Next implementation slice

- Command Center workflow and queue summary cards.
- Design Studio project workflow attachment.
- Project creation should generate workflow, task, and queue records.
