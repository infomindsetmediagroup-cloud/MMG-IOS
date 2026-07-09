# Workflow Runtime Detail Slice

## Purpose

Add drill-down visibility for workflow state so operators can inspect a workflow's progress, tasks, production queue entries, blockers, and transition history from the native runtime.

## Runtime changes

- Adds `WorkflowRuntimeDetailView`.
- Routes workflow rows from `WorkflowRuntimeDashboardView` into the detail screen.
- Shows workflow metadata, progress, summary, linked tasks, linked queue items, and transition history.
- Adds a recommended next action based on blocked, approval, completed, or active workflow state.

## Operational value

This makes the workflow runtime executable instead of purely summary-based. Operators can now move from the runtime list into a single workflow's operational record.

## Validation policy

This change remains part of the held batch on `agent/customer-release-gate-detail`. Do not run Manual iOS Validation until the batch is ready for a meaningful gate.
