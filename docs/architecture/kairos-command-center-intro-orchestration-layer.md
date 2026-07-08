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
2. Today’s rundown.
3. Priority tasks or recommended to-dos.
4. Current project or system status where relevant.
5. Recommended starting points.

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

## Five-Avenue Routing

At the end of the intro conversation, Kairos should present five primary starting avenues aligned with the dashboard’s parent-card structure.

The exact avenue names may evolve with the final command center architecture, but the pattern is fixed:

1. Continue current work.
2. Review today’s priorities.
3. Open production/publishing workflow.
4. Enter growth/marketing/customer pipeline.
5. Explore command centers, tools, or system areas.

The user chooses one of the five directions, and Kairos routes them into the relevant area.

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

The experience should enhance execution speed, not slow down power users.

## Product Doctrine

This feature is an identity layer for Kairos. It reinforces that Kairos is the intelligence/orchestration system sitting above the MMG operating environment.

The goal is a premium command-center experience where the system greets the user, explains what matters, recommends where to begin, and then opens the correct workspace.

The interface should feel cinematic, controlled, useful, and high-value. Visual polish must not override utility, speed, accessibility, or operational clarity.

## Engineering Notes

The implementation should be modular and may ship progressively:

1. Static dimmed overlay with Kairos emblem.
2. Pulse/glow animation and typing dots.
3. Text-only greeting and daily rundown.
4. Five-card routing choices.
5. Voice narration.
6. Context-aware task and project briefing.
7. Role-specific and workspace-specific variations.

The system should not require the full AI runtime to ship the first visual version. It can begin as a deterministic scripted onboarding layer and later connect to Kairos context, task data, user preferences, voice settings, and real daily operating intelligence.