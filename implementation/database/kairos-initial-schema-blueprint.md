# Kairos Initial Database Schema Blueprint

## Status
Implementation blueprint.

## Purpose
Translate the canonical domain model into an initial database planning artifact for backend implementation.

## Core Tables

### workspaces
- id
- name
- type
- status
- created_at
- updated_at

### users
- id
- workspace_id
- display_name
- email
- status
- created_at
- updated_at

### departments
- id
- workspace_id
- name
- mission
- health_status
- created_at
- updated_at

### projects
- id
- workspace_id
- owner_user_id
- title
- status
- current_lifecycle_state
- created_at
- updated_at

### tasks
- id
- workspace_id
- project_id
- department_id
- title
- priority
- lifecycle_state
- approval_status
- due_at
- created_at
- updated_at

### work_packages
- id
- workspace_id
- source_department_id
- target_department_id
- objective
- priority
- lifecycle_state
- approval_status
- audit_record_id
- created_at
- updated_at

### approvals
- id
- workspace_id
- requested_by_user_id
- approver_user_id
- target_entity_type
- target_entity_id
- status
- decision
- decision_reason
- decided_at
- created_at
- updated_at

### assets
- id
- workspace_id
- project_id
- owner_user_id
- type
- title
- storage_reference
- lifecycle_state
- export_status
- created_at
- updated_at

### executive_briefings
- id
- workspace_id
- briefing_type
- period_start
- period_end
- summary
- status
- created_at
- updated_at

### health_snapshots
- id
- workspace_id
- domain
- status
- trend
- priority_issue
- recommended_action
- created_at

### events
- id
- workspace_id
- event_type
- source_entity_type
- source_entity_id
- target_entity_type
- target_entity_id
- department_id
- lifecycle_state
- correlation_id
- trace_id
- approval_id
- result_status
- occurred_at

### audit_records
- id
- workspace_id
- actor_type
- actor_id
- action
- entity_type
- entity_id
- event_id
- metadata
- created_at

## Relationship Rules
- All workspace-scoped tables include workspace_id.
- Audit records reference canonical entity identifiers.
- Events are append-only.
- Approvals reference the entity being approved.
- Work packages connect source and target departments.
- Executive briefings aggregate events, health snapshots, approvals, and work queue changes.

## Implementation Notes
- Use UUID primary keys unless a future platform decision specifies otherwise.
- Preserve created_at and updated_at on mutable records.
- Use append-only records for audit and event history.
- Enforce workspace isolation at the database and application layers.
- Prefer soft deletion for business entities that need historical continuity.

## Next Step
Convert this blueprint into concrete migrations after the backend stack and database engine are finalized.