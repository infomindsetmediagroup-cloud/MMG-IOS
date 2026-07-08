# Kairos Conversational Intelligence Map

## Capability
Kairos must provide a universal conversation layer across the MMG web app, customer dashboard, admin command center, iOS app, and future surfaces.

## Input Channels
- Typed text.
- Voice input converted through speech-to-text.
- Uploaded files and documents.
- Future screenshots and images.

All inputs normalize into the canonical Kairos runtime request contract before execution.

## Output Channels
- Text transcript.
- Spoken response when voice output is enabled.
- Text-only fallback when speech output is disabled or unavailable.

The transcript remains the canonical record for review, audit, search, accessibility, and knowledge lifecycle processing.

## Public Website Assistant
The website should include a bottom-right Kairos badge that opens the assistant. The assistant should:
- Welcome visitors.
- Explain that Kairos can help them navigate MMG.
- Support typed and spoken questions.
- Recommend public products, resources, services, and educational paths.
- Avoid using private or customer-specific data in public mode.

## Authenticated Customer Assistant
When a customer is logged in, Kairos may guide them using permissioned customer context. Examples:
- Continue unfinished work.
- Recommend content based on purchases and interests.
- Surface subscription review windows.
- Help locate downloads.
- Guide publishing, creator education, and project workflows.

Customer context must remain isolated to that customer.

## Executive Command Center
The Command Center must support voice-issued executive work orders. Kairos converts voice into a transcript, prepares an execution plan, requests approval, executes through departments after approval, verifies output, and returns the final deliverable.

## Runtime Flow
1. Capture input.
2. Normalize transcript or text.
3. Resolve user mode and permissions.
4. Analyze intent.
5. Resolve department routing.
6. Resolve relevant knowledge sources.
7. Generate response or execution plan.
8. Request approval when required.
9. Execute approved work.
10. Record safe audit metadata.
11. Emit transcript and optional speech output.
12. Generate Knowledge Event candidates.

## Knowledge Events
Every conversation may produce knowledge candidates for:
- Documentation improvements.
- Product improvements.
- Support trends.
- Customer guidance improvements.
- Workflow improvements.
- Educational opportunities.
- Knowledge gaps.

Knowledge candidates must pass through Trust Layer review before becoming approved institutional knowledge.
