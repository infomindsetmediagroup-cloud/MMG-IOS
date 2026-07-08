# Kairos Production Session Standard

## Status

Approved production standard.

## Purpose

Define how MMG/Kairos production sessions should run so implementation becomes faster, cleaner, and more accurate over time.

## Session Flow

1. Load the latest repository context.
2. Identify the active workstream.
3. Prefer amending canonical records over creating duplicates.
4. Make the smallest coherent production change.
5. Commit completed units only.
6. Index important records after creation.
7. Report exact files changed and commit SHAs.
8. Capture any process improvement discovered during the session.

## Quality Rules

- Do not fabricate repository changes.
- Do not claim a commit unless the connector returns a commit SHA.
- Keep related work grouped.
- Avoid unnecessary redesign.
- Preserve established architecture unless explicitly changed.
- Convert recurring production patterns into standards or workflows.

## Efficiency Rule

Every session should leave the next session easier to execute.