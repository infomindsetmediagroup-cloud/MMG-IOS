# Workflow Command Policy Slice

## Purpose

Prevent operators from firing invalid workflow commands for the current workflow state.

## Runtime changes

- Adds `WorkflowCommandPolicy`.
- Adds `WorkflowCommandState`.
- Disables unavailable workflow commands in `WorkflowRuntimeDetailView`.
- Shows command availability reason in the workflow detail command section.

## Policy rules

- Terminal workflows cannot advance, approve, reject, block, resume, or complete.
- Completed workflows may be archived.
- Blocked workflows can only be resumed.
- Approval workflows can be approved, rejected, or blocked.
- Active workflows can advance, request approval, block, and complete when in export stage.

## Operational value

The command layer now behaves like an operations console with guardrails instead of exposing every command at every time.

## CI policy

Still held inside PR #16. No GitHub Actions run should be triggered until the batch is promoted for validation.
