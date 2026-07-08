# Kairos Overnight Orchestration Engine

Status: Approved architecture.

Purpose:
Define the controlled work Kairos performs between the Evening Wrap-Up and the next Morning Check-In.

Core responsibilities:
- Build the next executive queue.
- Organize approved work.
- Prepare review packages.
- Update project context.
- Generate draft content and production packages where appropriate.
- Refresh metrics and health summaries.
- Detect blockers and dependencies.
- Prepare recommended decisions for the next check-in.

Operating rules:
- Respect approval gates.
- Preserve audit history.
- Never bypass Executive Only decisions.
- Record all overnight actions for the Morning Check-In summary.

Success metric:
The executive should begin each day with a complete, organized, actionable briefing instead of a backlog of unprocessed work.