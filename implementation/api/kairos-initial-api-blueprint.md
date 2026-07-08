# Kairos Initial API Blueprint

## Status
Implementation blueprint.

## Purpose
Translate the API Contract Standard and Canonical Domain Model into an initial backend route plan.

## Response Envelope

All API responses should follow a consistent envelope:

```json
{
  "status": "success | error",
  "summary": "Human-readable result summary.",
  "data": {},
  "trace_id": "uuid",
  "timestamp": "ISO-8601"
}
```

## Core Routes

### Workspace
- `GET /api/v1/workspaces/current`
- `GET /api/v1/workspaces/{workspace_id}/health`

### Executive Briefings
- `GET /api/v1/executive/briefings/morning`
- `GET /api/v1/executive/briefings/evening`
- `POST /api/v1/executive/briefings/{briefing_id}/complete`

### Overall Health Check
- `GET /api/v1/health/overall`
- `GET /api/v1/health/domains/{domain}`

### Departments
- `GET /api/v1/departments`
- `GET /api/v1/departments/{department_id}`
- `GET /api/v1/departments/{department_id}/report`
- `GET /api/v1/departments/{department_id}/queue`

### Projects
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/{project_id}`
- `PATCH /api/v1/projects/{project_id}`

### Tasks
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/{task_id}`
- `PATCH /api/v1/tasks/{task_id}`
- `POST /api/v1/tasks/{task_id}/advance`

### Work Packages
- `GET /api/v1/work-packages`
- `POST /api/v1/work-packages`
- `GET /api/v1/work-packages/{work_package_id}`
- `POST /api/v1/work-packages/{work_package_id}/handoff`

### Approvals
- `GET /api/v1/approvals/pending`
- `GET /api/v1/approvals/{approval_id}`
- `POST /api/v1/approvals/{approval_id}/approve`
- `POST /api/v1/approvals/{approval_id}/reject`
- `POST /api/v1/approvals/{approval_id}/hold`
- `POST /api/v1/approvals/{approval_id}/revise`

### Assets
- `GET /api/v1/assets`
- `POST /api/v1/assets`
- `GET /api/v1/assets/{asset_id}`
- `PATCH /api/v1/assets/{asset_id}`
- `POST /api/v1/assets/{asset_id}/request-export`

### Events and Audit
- `GET /api/v1/events`
- `GET /api/v1/audit-records`
- `GET /api/v1/audit-records/{audit_record_id}`

## Authorization Rules
- Every route is workspace-scoped.
- Approval routes require approval authority.
- Asset export routes must enforce the Design Studio Production-Only Asset Doctrine.
- Audit and event routes require privileged read access.

## Next Step
Convert this blueprint into OpenAPI specification files after the backend framework is selected.