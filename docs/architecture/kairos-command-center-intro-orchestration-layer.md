# Kairos Command Center — Intro Orchestration Layer Blueprint

## Status

Approved MMG/Kairos experience blueprint for the dashboard, command center, customer portal, and future iOS interface.

## Purpose

The Kairos Command Center should not open as a static dashboard only. On login, Kairos should present an intelligent intro orchestration layer that feels like the system waking up, greeting the user, orienting them, and routing them into the correct operating lane.

This layer establishes Kairos as the active intelligence interface above the dashboard rather than a passive collection of cards.

## Login Experience

When the user enters the dashboard or command center, the primary interface should remain visible in the background but be darkened, dimmed, or placed behind an opaque glass overlay. The user should be able to faintly perceive the system behind the overlay without interacting with it yet.

A Kairos emblem or glass-button logo should appear above the overlay. The emblem should sit slightly off-center rather than feeling perfectly static or mechanical. It should pulse subtly, glow in and out, and create the impression that Kairos is initializing.

## Waiting / Thinking State

Before Kairos speaks, the interface should show a short active-response indicator similar to typing dots or a computer waiting-response state.

The purpose is to communicate that Kairos is preparing the user’s personalized rundown rather than simply loading a page.

## Personalized Greeting

Kairos should then begin the session with a personalized greeting based on the user and local time context.

Examples:

- Good morning, Mike.
- Good afternoon, Mike.
- Good evening, Mike.

The greeting should feel professional, calm, premium, and useful. It should not feel gimmicky, overly casual, or like a generic chatbot pop-up.

## Narrated Typewriter Delivery

Kairos should display text through a controlled typewriter-style sequence while simultaneously narrating the same or equivalent content through the Kairos voice.

The voice and text experience should be synchronized enough to feel intentional, but the system should preserve accessibility and allow voice to be muted, paused, skipped, or disabled.

The narration should introduce:

1. The time-based greeting.
2. The morning check-in or evening wrap-up context.
3. Today’s rundown or end-of-day runtime summary.
4. Priority tasks, recommended to-dos, or next-cycle approvals.
5. Current project or system status where relevant.
6. Recommended starting points.

## Daily Rundown

The daily rundown should summarize what matters most for the user’s current workspace. Depending on context, this may include:

- Open projects
- Production priorities
- Publishing tasks
- Customer work
- Growth or marketing actions
- Quality/release items
- Upcoming deadlines
- Alerts, blockers, or approvals needed
- Recommended next action

This layer should become a practical operating briefing, not decorative animation only.

## Two-Checkpoint Operating Cycle Integration

The intro layer should connect to the Kairos two-checkpoint executive operating cycle.

Kairos should expect two primary executive inputs per day:

1. Morning Check-In
2. Evening Wrap-Up / Overnight Approval

The morning check-in introduces the day’s queue, summarizes overnight preparation, incorporates approved items from prior cycles, and presents the recommended operating path.

The evening wrap-up summarizes what happened during the day, reports business/system metrics and trajectory, records what was exported or completed, and presents the proposed overnight work cycle for approval.

The interface should make these two checkpoints feel like the natural executive rhythm of the system.

## Six-Avenue Routing

At the end of the intro conversation, Kairos should present six primary starting avenues:

1. Overall Health Check
2. Parent Card 1
3. Parent Card 2
4. Parent Card 3
5. Parent Card 4
6. Parent Card 5

The Overall Health Check gives a cross-system executive snapshot without requiring the user to enter each individual section.

The five parent-card options route directly into the major command-center operating lanes.

The exact parent-card names may evolve with the final command center architecture, but the six-button pattern is fixed: one whole-system health snapshot plus five direct operating lanes.

## Overall Health Check

The Overall Health Check should provide a concise view of:

- Business health
- Workflow health
- Production status
- Publishing status
- Growth/marketing status
- Customer/project status
- Metrics and trajectory where available
- Blockers and risks
- Approval load
- Recommended next action

The health check should be fast, scannable, and useful as an executive command summary.

## Transition Into Dashboard

After the user selects a starting avenue, the intro layer should fade out and the main control panel should fade in.

The dashboard should then become fully interactive in normal operating mode.

The transition should feel smooth and premium: Kairos introduces the operating context, the user chooses the lane, and then the system opens into execution.

## Interaction Rules

The intro layer must support:

- Skip intro
- Mute voice
- Replay briefing
- Accessibility-compliant text display
- Reduced-motion mode
- Returning-user speed mode
- First-time-user expanded orientation
- Admin/customer role-specific variants
- Context-aware briefings
- Morning check-in mode
- Evening wrap-up mode
- Overnight approval mode

The experience should enhance execution speed, not slow down power users.

## Product Doctrine

This feature is an identity layer for Kairos. It reinforces that Kairos is the intelligence/orchestration system sitting above the MMG operating environment.

The goal is a premium command-center experience where the system greets the user, explains what matters, recommends where to begin, collects key approvals, and then opens the correct workspace.

The interface should feel cinematic, controlled, useful, and high-value. Visual polish must not override utility, speed, accessibility, or operational clarity.

## Engineering Notes

The implementation should be modular and may ship progressively:

1. Static dimmed overlay with Kairos emblem.
2. Pulse/glow animation and typing dots.
3. Text-only greeting and daily rundown.
4. Six-button routing choices.
5. Morning check-in and evening wrap-up variants.
6. Voice narration.
7. Context-aware task and project briefing.
8. Approval queue and overnight-cycle approval.
9. Role-specific and workspace-specific variations.

The system should not require the full AI runtime to ship the first visual version. It can begin as a deterministic scripted onboarding layer and later connect to Kairos context, task data, user preferences, voice settings, real daily operating intelligence, approval history, project records, metrics, and overnight-cycle preparation.