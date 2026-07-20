# MMG Recommendation and Curation Ranking QA

## Publication Status

Staging source only. Do not activate customer recommendations until every release gate in the canonical contract passes.

## Learning Profile

- [ ] GET requires an authenticated Customer Portal session.
- [ ] PUT requires authentication, same-origin validation, and a session-bound CSRF token.
- [ ] Browser-supplied customer IDs are ignored.
- [ ] Role, goal, topic, format, and exclusion values normalize to approved identifier codes.
- [ ] Experience accepts only beginner, intermediate, advanced, or all levels.
- [ ] Oversized bodies and excessive arrays are rejected.
- [ ] Incomplete profiles remain usable with neutral fallback scoring.
- [ ] Profile data is private and non-cacheable.

## Candidate Eligibility

- [ ] Owned assets never enter ranking.
- [ ] Current-window selections never enter ranking.
- [ ] Draft, retired, unavailable, unpublished, or ineligible products never enter ranking.
- [ ] Missing portrait, square thumbnail, delivery package, or My Library destination blocks ranking.
- [ ] Excluded topics are removed.
- [ ] Explicitly disliked assets are removed.
- [ ] Missing prerequisites remove the dependent asset.
- [ ] A candidate is revalidated again before the window opens.

## Ranking Signals

- [ ] Primary-topic matches outrank neutral candidates when other factors are equal.
- [ ] Secondary interests contribute less than primary topics.
- [ ] Goal and role tags influence ranking.
- [ ] Exact experience fit outranks an advanced mismatch.
- [ ] Preferred formats receive the approved bonus.
- [ ] The next series title receives progression value.
- [ ] Series gaps and already-passed titles receive penalties.
- [ ] Recent topic repetition receives bounded fatigue penalties.
- [ ] Likes and completions are positive signals.
- [ ] Swaps and dismissals are negative signals.
- [ ] Editorial priority stays inside the bounded range.
- [ ] Equal scores use deterministic title and asset-ID tie breaks.

## Package Optimization

- [ ] The package contains exactly the window target title count.
- [ ] The package consumes exactly the window total units.
- [ ] Topic diversity is rewarded when alternatives exist.
- [ ] Duplicate-topic packages receive the configured penalty.
- [ ] Diversity-group and format variety are rewarded.
- [ ] At least one title covers the primary objective when eligible inventory permits.
- [ ] Secondary-interest exploration is rewarded without displacing the primary objective.
- [ ] Sequential series pairs receive only the approved bounded bonus.
- [ ] No exact package returns null and moves the window to recovery.
- [ ] The first package never invokes automated curation.

## Persistence and Idempotency

- [ ] One recommendation run exists per window and window version.
- [ ] Replaying the same window version does not create another run.
- [ ] Candidate component scores and reason codes are persisted.
- [ ] Selected assets and package rationale are persisted.
- [ ] At most 250 candidate score rows are stored per run.
- [ ] No raw model prompt, secret, token, or public file URL is stored.
- [ ] Database failures prevent the window from opening with an unaudited proposal.

## Privacy

- [ ] Public Liquid contains no profile, customer, interaction, score, or run identifiers.
- [ ] Customer-facing APIs do not return internal component scores.
- [ ] Recommendation logs use safe identifiers and no raw private payloads.
- [ ] Support tools expose only the minimum data required for authorized troubleshooting.

## End-to-End Plans

Run at least these scenarios for Monthly, Bi-weekly, and Weekly members:

1. Complete profile with primary and secondary interests.
2. Incomplete profile using neutral deterministic ranking.
3. Next-title series progression.
4. Recent topic fatigue causing diversification.
5. Explicit dislike exclusion.
6. Swap and dismissal penalty.
7. Missing prerequisite exclusion.
8. Exact two-title package found.
9. No exact package available.
10. Concurrent controller retries for the same window version.
11. Plan cycle with a five-week calendar month.
12. Customer swaps a curated title during the review window.
13. Auto-confirm after full server revalidation.
14. Recovery after a proposal becomes ineligible before confirmation.

## Live Release Gates

- [ ] Migrations 001–006 applied in order.
- [ ] Production PostgreSQL connected and backed up.
- [ ] Subscription onboarding writes the canonical learning profile.
- [ ] Every selectable asset has reviewed recommendation metadata.
- [ ] `MMGKairosRecommendationCurator` is injected into the production Delivery Window Controller.
- [ ] Production scheduler, delivery dispatcher, and monitoring are active.
- [ ] Authorization, concurrency, privacy, accessibility, and operational rollback QA passed.
- [ ] Executive production release approval recorded.