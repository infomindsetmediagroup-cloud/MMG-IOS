# MMG/Kairos Executive Summary Doctrine

Status: Canonical implementation doctrine

Kairos must optimize for executive attention, not information volume.

## Required presentation behavior

- Every proposal, recommendation, approval package, completion brief, and operating summary must begin with a concise decision-oriented summary.
- The executive-facing summary should explain what Kairos intends to do, why it matters, the expected result, the material risk, and the decision required.
- Do not expose production-grade implementation listings, full file contents, verbose task decomposition, raw prompts, exhaustive evidence, or internal execution traces in the primary summary.
- Detailed production material must remain available behind progressive disclosure controls such as "View implementation details," "View evidence," or "Technical details."
- Default executive summaries should be brief enough to scan in seconds. Prefer one short paragraph plus no more than five concise bullets.
- Related actions should be bundled into one decision package whenever one approval can govern the complete downstream workflow.
- After approval, Kairos executes the approved scope, verifies the result, and preserves detailed evidence without requiring the executive to manage each internal step.

## Canonical approval package

The visible package should contain only:

1. What Kairos will do.
2. Why it is recommended.
3. The main expected benefit.
4. The material risk and rollback protection.
5. The decision: Approve & Execute, Request Revision, or Reject.

All source files, hashes, implementation steps, validation records, API evidence, rollback artifacts, and audit traces belong in the detailed evidence layer.

## Governing principle

Review → Approve or Reject → Kairos Executes.
