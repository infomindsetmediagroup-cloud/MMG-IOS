# Workflow Runtime Foundation

Status: Foundation slice implemented and visible in-app.

## Scope

This runtime creates the shared workflow layer used by the Customer Portal, Design Studio, Command Center, and Kairos orchestration.

## Implemented

- Workflow enums for type, stage, status, and priority.
- Workflow stage transition policy.
- Workflow stage progress scoring.
- Persistent workflow record.
- Persistent workflow transition record.
- Workflow runtime service for create and transition actions.
- SwiftData app model registration.
- SwiftData preview model registration.
- Runtime validation checklist.
- Workflow Runtime dashboard view.
- Runtime tab exposed in the app shell.

## Runtime behavior

- New workflows start at Intake.
- Stage transitions are validated through WorkflowStagePolicy.
- Workflow progress updates when a transition succeeds.
- A WorkflowTransitionRecord is created for successful transitions.
- The dashboard can seed and manually advance the first workflow for internal validation.

## Next code files

- Design Studio project workflow attachment.
- Command Center workflow summary cards.
- Task Engine foundation.
- Production Queue foundation.

## Acceptance criteria

- Workflows receive immutable IDs.
- Workflows can be created for customer production projects.
- Workflow stages can transition only through approved lifecycle paths.
- Transitions are recorded for auditability.
- Runtime state is visible inside the app.
