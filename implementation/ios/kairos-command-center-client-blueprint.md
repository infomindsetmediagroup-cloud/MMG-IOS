# Kairos iOS Command Center Client Blueprint

## Status
Implementation blueprint.

## Purpose
Define the first iOS/client implementation plan for the Kairos Command Center, Morning Check-In, Evening Wrap-Up, Overall Health Check, approvals, and six-button routing model.

## Primary Screens

### CommandCenterIntroView
Purpose: Presents the dimmed dashboard overlay, pulsing Kairos emblem, typing/thinking indicator, narrated greeting, and briefing text.

Responsibilities:
- Display dashboard background in dimmed state.
- Render Kairos emblem with pulse/glow animation.
- Show typing/thinking indicator before briefing text.
- Present Morning Check-In or Evening Wrap-Up text.
- Support skip, mute, replay, and reduced-motion modes.
- Transition into CommandCenterHomeView after user selection.

### ExecutiveBriefingView
Purpose: Displays structured Morning Check-In and Evening Wrap-Up content.

Sections:
- Greeting
- Overall Health Check
- Executive Summary
- Overnight accomplishments or daily accomplishments
- Top priorities
- Pending decisions
- Recommended first action
- Six-button navigation

### OverallHealthCheckView
Purpose: Provides one cross-system health snapshot before drill-down.

Sections:
- Business
- Operations
- Production
- Publishing
- Customer Success
- Marketing & Growth
- AI Runtime
- Infrastructure
- Security
- Finance when available

### ApprovalQueueView
Purpose: Presents compressed executive decision packages.

Actions:
- Approve
- Reject
- Hold
- Revise
- Open Details

### ParentCardRouterView
Purpose: Presents the six executive entry choices.

Buttons:
1. Overall Health Check
2. Parent Card 1
3. Parent Card 2
4. Parent Card 3
5. Parent Card 4
6. Parent Card 5

## Client Models

- Workspace
- ExecutiveBriefing
- HealthSnapshot
- DepartmentReport
- ApprovalDecision
- WorkPackage
- Task
- Asset
- AuditRecord

## API Dependencies

- `GET /api/v1/workspaces/current`
- `GET /api/v1/executive/briefings/morning`
- `GET /api/v1/executive/briefings/evening`
- `GET /api/v1/health/overall`
- `GET /api/v1/approvals/pending`
- `POST /api/v1/approvals/{approval_id}/approve`
- `POST /api/v1/approvals/{approval_id}/reject`
- `POST /api/v1/approvals/{approval_id}/hold`
- `POST /api/v1/approvals/{approval_id}/revise`

## UX Rules

- Executive summaries render before detail.
- Drill-down is available but not forced.
- Critical exceptions may interrupt; lower-priority issues wait for briefings.
- Reduced-motion mode disables pulse, glow, and animated transitions.
- Voice narration is optional and user-controllable.
- The interface optimizes executive attention, not information volume.

## Implementation Notes

- Initial implementation may use static/mock API payloads.
- Networking should be isolated behind a client service layer.
- Client models should align with the canonical domain model.
- UI state should follow the State Management Standard.
- Every approval action should display clear status and confirmation feedback.

## Definition of Done

The iOS Command Center can present a morning or evening briefing, show the Overall Health Check, display pending approvals, route through the six-button model, and transition from intro overlay into the main dashboard experience.