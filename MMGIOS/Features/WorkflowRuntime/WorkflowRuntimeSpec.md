# Workflow Runtime Foundation

Status: Workflow and Task Runtime foundations implemented and visible in-app.

## Scope

This runtime creates the shared workflow and task layer used by the Customer Portal, Design Studio, Command Center, and Kairos orchestration.

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
- SwiftData app model registration.
- SwiftData preview model registration.
- Runtime validation checklists.
- Workflow Runtime dashboard view.
- Workflow and task queue visibility in-app.
- Runtime tab exposed in the app shell.

## Runtime behavior

- New workflows start at Intake.
- Stage transitions are validated through WorkflowStagePolicy.
- Workflow progress updates when a transition succeeds.
- A WorkflowTransitionRecord is created for successful transitions.
- Seeded workflows create an initial production task.
- The dashboard can seed workflows, advance workflow stage, and complete the first open task.

## Next code files

- Production Queue foundation.
- Department queue grouping.
- Design Studio project workflow attachment.
- Command Center workflow summary cards.

## Acceptance criteria

- Workflows receive immutable IDs.
- Workflows can be created for customer production projects.
- Workflow stages can transition only through approved lifecycle paths.
- Transitions are recorded for auditability.
- Tasks are linked to workflow records.
- Runtime state is visible inside the app.
