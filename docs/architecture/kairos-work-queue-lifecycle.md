# Kairos Work Queue Lifecycle

Status: Approved architecture.

Purpose:
Define the canonical lifecycle for every task, project, asset, approval, and workflow handled by Kairos.

Lifecycle states:
1. Captured
2. Classified
3. Prioritized
4. Scheduled
5. Prepared
6. Awaiting Approval (when required)
7. Approved
8. In Progress
9. Completed
10. Delivered or Published
11. Archived

Rules:
- Every item must have a current state.
- State transitions are recorded in the audit history.
- Dependencies must be satisfied before advancing.
- Executive approvals are honored where required.
- Morning Check-In highlights items entering active work.
- Evening Wrap-Up summarizes state changes completed during the day.
- Overnight Orchestration prepares eligible items for the next state.

Success:
The executive can determine the status of any work item instantly without searching across departments.