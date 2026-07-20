# MMG Recommendation and Curation Ranking v1.0

## Purpose

This component replaces the Delivery Window Controller's alphabetical deterministic fallback with a governed Kairos ranker for future subscription packages. It never changes the first-package doctrine: the customer still chooses the first two titles after checkout.

## Runtime Sequence

1. The Delivery Window Controller identifies a scheduled future package.
2. The entitlement repository returns only server-eligible, unowned, unselected digital assets.
3. The candidate metadata repository enriches those assets with role, goal, topic, prerequisite, complementary, diversity, priority, and duration metadata.
4. Kairos loads the authenticated customer's learning profile and 180-day interaction/delivery history.
5. Hard exclusions remove excluded topics, explicit dislikes, and assets with unmet prerequisites.
6. Each candidate receives deterministic score components and reason codes.
7. Kairos searches for a package that uses the exact target title count and exact entitlement units.
8. Package-level diversity and objective-coverage adjustments are applied.
9. The winning package and ranking audit are stored idempotently by window and version.
10. The Delivery Window Controller revalidates the proposed assets before opening the 24–48-hour customer review window.

## Customer Learning Profile

The private profile stores:

- Role
- Primary goal
- Secondary goals
- Experience level
- Primary topics
- Secondary topics or interests
- Preferred formats
- Excluded topics
- Onboarding schema version

The profile is available through `GET` and `PUT /api/customer-portal/learning-profile`. Customer identity comes from the authenticated Customer Portal session. Writes require same-origin and CSRF validation.

## Candidate Gates

Ranking never receives authority to override catalog or entitlement decisions. Candidates must already be active, published, available, visible, subscription eligible, media complete, delivery verified, directed to My Library, unowned, and absent from the current package.

The ranker adds three further hard exclusions:

- Customer-excluded topic
- Explicit customer dislike
- Unmet prerequisite asset

## Score Model

The score is deterministic and explainable. Major signals include:

| Signal | Effect |
|---|---:|
| Primary topic match | +30 |
| Goal match | up to +24 |
| Next title in an owned series | +20 |
| Role match | +16 |
| Secondary topic match | +14 |
| Exact experience fit | +12 |
| Complement to a recent asset | +10 |
| Preferred format | +8 |
| Topic novelty | +4 |
| Experience too advanced | -18 |
| Series gap | -12 |
| Recent topic fatigue | down to -18 |

Likes and completions contribute positive interaction weight. Swaps and dismissals reduce ranking. Editorial priority is bounded and cannot override hard gates.

## Package Optimization

The search requires exact capacity. For the canonical subscription package this means exactly two assets and two units.

Package scoring rewards:

- Different topics
- Different diversity groups
- Multiple formats
- Primary-objective coverage
- Secondary-interest exploration
- Sequential series continuity

It penalizes duplicate topics and concentrated non-sequential series selections.

## Explainability and Audit

Each run stores:

- Ranking version
- Profile version
- Candidate count
- Selected asset IDs
- Exact units
- Package score
- Package rationale
- Per-candidate component scores
- Per-candidate reason codes
- Selection status

The run key is `recommendation:{window_id}:{window_version}` and the database also enforces uniqueness on `window_id + window_version`.

Internal scores are not customer-facing. The customer may see human-readable title recommendations and rationale, but not private profile, interaction, or scoring records.

## Persistence

Migration `20260720_006_mmg_recommendation_curation_ranking.sql` adds:

- Recommendation metadata columns to `mmg_knowledge_assets`
- `mmg_customer_learning_profiles`
- `mmg_customer_asset_interactions`
- `mmg_recommendation_runs`
- `mmg_recommendation_scores`

## Fallback and Recovery

If no exact eligible package exists, the curator returns `null`. The existing Delivery Window Controller moves the window to `recovery_required` rather than opening an incomplete or unauthorized package.

The old `MMGDeterministicEligibleCurator` remains a controlled fallback for development and disaster recovery. Production activation must explicitly inject `MMGKairosRecommendationCurator`.

## Production Boundary

The build is staging source. Production requires migration 006, authenticated profile routing, onboarding integration, reviewed recommendation metadata for every selectable asset, production curator injection, privacy review, and end-to-end package QA.