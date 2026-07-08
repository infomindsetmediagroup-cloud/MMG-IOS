# Kairos Conversational Intelligence Work Order

## Status
Approved P0/P1 implementation work order derived from the Conversational Intelligence and Knowledge Lifecycle constitutional amendment.

## Capability Mapping
- P0: AI Gateway
- P0: Knowledge Platform
- P0: Customer Platform
- P1: Executive Dashboard
- P1: Customer Dashboard
- P1: Trust Layer
- P1: Workflow Engine

## Objective
Implement a universal Kairos conversation experience that supports text, voice input, spoken responses, guided customer journeys, executive voice work orders, and governed Knowledge Event capture.

## Required Implementation Scope

### 1. Website Assistant Badge
Add a bottom-right Kairos assistant badge to the public website.

Requirements:
- Opens a persistent chat panel.
- Welcomes visitors to MMG.
- Supports text input.
- Supports microphone input when browser permissions allow.
- Falls back gracefully when microphone permissions are unavailable.
- Calls the server-side Kairos runtime rather than a model provider directly.

### 2. Speech-to-Text
Add voice capture and transcription.

Requirements:
- User taps or holds a microphone control.
- Captured audio is converted into transcript text.
- Transcript is displayed before or during submission.
- Transcript enters the same `/api/kairos` request path as typed text.
- Browser permission failures return usable text-only fallback.

### 3. Text-to-Speech
Add spoken Kairos responses when enabled.

Requirements:
- Kairos response remains displayed as text.
- Speech output is optional and user-controllable.
- If speech output fails, the transcript remains available.
- Voice preferences should support enable/disable and future voice/rate configuration.

### 4. Customer-Aware Guidance
Authenticated customer chat should use permissioned customer context.

Initial guidance examples:
- Continue unfinished projects.
- Recommend purchased or related content.
- Surface downloads and subscription review windows.
- Help customers navigate the Knowledge Library and dashboard.

### 5. Executive Voice Command Center
Add microphone input to the Executive Command Center.

Workflow:
1. Capture executive voice command.
2. Convert to transcript.
3. Analyze intent.
4. Present execution plan.
5. Await approval.
6. Execute approved work through departments.
7. Return final deliverable for final gate.

### 6. Knowledge Event Pipeline
Every conversation should be evaluated as a Knowledge Event candidate.

Initial event categories:
- Customer insight.
- Documentation improvement.
- Product improvement.
- Workflow improvement.
- Educational opportunity.
- Knowledge gap.
- Support trend.
- Operational intelligence.

Knowledge candidates must not automatically modify the Constitutional Core or permanent Knowledge Library. They must pass through Trust Layer review.

## Acceptance Criteria
- Public assistant UI exists and calls the Kairos runtime.
- Text input works end-to-end.
- Voice input is captured and converted to transcript where supported.
- Kairos can optionally respond audibly while preserving text transcript.
- Customer mode is isolated and permissioned.
- Executive voice commands generate approval-gated work plans.
- Knowledge Event candidates are captured without storing secrets or sensitive raw data.
- Build, lint, type-check, and runtime tests pass.

## Out of Scope for First Pass
- Production voice vendor optimization.
- Long-term persisted customer memory beyond approved storage boundaries.
- Fully autonomous execution without approval gates.
- Cross-customer learning that exposes private data.
- Automatic Constitutional Core modification.

## Engineering Notes
- Treat transcript text as the canonical conversation artifact.
- Voice is an input/output layer, not a separate intelligence engine.
- Keep all provider credentials server-side.
- Keep customer-specific context isolated.
- Prefer governed knowledge candidates over automatic model drift.
