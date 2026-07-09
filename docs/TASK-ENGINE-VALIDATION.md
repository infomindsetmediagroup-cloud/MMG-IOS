# Task Engine Validation

## Scope

This checklist validates the first Task Engine foundation slice.

## Runtime files

- `MMGIOS/Features/TaskEngine/TaskEnums.swift`
- `MMGIOS/Features/TaskEngine/TaskRecord.swift`
- `MMGIOS/Features/TaskEngine/TaskDependencyRecord.swift`
- `MMGIOS/Features/TaskEngine/TaskRuntimeService.swift`

## Manual validation

- A seeded workflow creates one initial production task.
- The task is connected to the workflow through `workflowID`.
- Task status defaults to Ready.
- Task priority follows the workflow priority.
- Task can be completed through the Workflow Runtime dashboard.
- Completed tasks are excluded from open task count.
- Dependencies can block task start unless the prerequisite task is completed.

## Next implementation slice

- Production Queue foundation.
- Department queue grouping.
- Workflow and task summary cards in Command Center.
- Design Studio project workflow attachment.
