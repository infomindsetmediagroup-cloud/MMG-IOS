# Workflow Runtime Foundation

Status: Workflow, Task, and Production Queue foundations implemented and visible in-app.

## Scope

This runtime creates the shared workflow, task, and queue layer used by the Customer Portal, Design Studio, Command Center, and Kairos orchestration.

## Implemented

- Workflow enums for type, stage, status, and priority.
- Workflow stage transition policy.
- Workflow stage progress scoring.
- Persistent workflow record.
- Persistent workflow transition record.
- Workflow runtime service for create and transition actions.
- Task enums for status, priority, and department.
- Persistent task record.
- Persistent task dependency record.
- Task runtime service for create, start, block, complete, and dependency validation.
- Production queue enums for status and lane.
- Persistent production queue record.
- Production queue service for create, activate, block, and complete actions.
- SwiftData app model registration.
- SwiftData preview model registration.
- Runtime validation checklists.
- Workflow Runtime dashboard view.
- Workflow, task, and production queue visibility in-app.
- Runtime tab exposed in the app shell.

## Runtime behavior

- New workflows start at Intake.
- Stage transitions are validated through WorkflowStagePolicy.
- Workflow progress updates when a transition succeeds.
- A WorkflowTransitionRecord is created for successful transitions.
- Seeded workflows create an initial production task.
- Seeded tasks create a production queue item.
- The dashboard can seed workflows, advance workflow stage, complete the first open task, and complete the first open queue item.

## Next code files

- Command Center workflow and queue summary cards.
- Design Studio project workflow attachment.
- Project creation should generate workflow, task, and queue records.

## Acceptance criteria

- Workflows receive immutable IDs.
- Workflows can be created for customer production projects.
- Workflow stages can transition only through approved lifecycle paths.
- Transitions are recorded for auditability.
- Tasks are linked to workflow records.
- Queue items are linked to workflow and task records.
- Runtime state is visible inside the app.
