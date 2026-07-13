# Kairos Social Publishing Engine v1

## Objective

Build a governed MMG-native social publishing system that accepts user-supplied media, analyzes the media, writes platform-specific copy using approved MMG doctrine, applies the MMG Pyramid Mix hashtag standard, schedules or publishes through approved platform APIs, records disclosure settings, and returns verified publication receipts.

## Canonical Composer Inputs

The composer must support:

1. Single-image TikTok post
2. Multi-image TikTok photo post
3. TikTok video post
4. Single-image Facebook post
5. Multi-image Facebook post
6. Facebook video or Reel post

The user may upload one or more images or one video. Media order must be preserved. The engine must show a visual asset list, allow reordering for multi-image posts, allow removal and replacement, and require confirmation before publication.

## MMG Post-Writing Doctrine

### Single-image TikTok post

Generate:

- Catchy title with the emoji after the title text
- One short body sentence or half-sentence
- Blank line
- Exactly five lowercase hashtags using the MMG Pyramid Mix

### Multi-image TikTok post

Generate:

- No separate catchy-title field by default
- One short body sentence or half-sentence
- Blank line
- Exactly five lowercase hashtags using the MMG Pyramid Mix

### TikTok video post

Generate:

- No separate catchy-title field by default unless the workflow explicitly requires a cover title
- One short body sentence or half-sentence
- Blank line
- Exactly five lowercase hashtags using the MMG Pyramid Mix

### Facebook posts

Adapt the TikTok message for Facebook rather than duplicating it mechanically. Facebook copy may be slightly longer when context or discussion value is useful, but must remain direct and avoid filler. Hashtags are optional and should be fewer than TikTok unless testing data supports otherwise.

## MMG Pyramid Mix

Each TikTok post must use exactly five lowercase hashtags:

- 1–2 niche hashtags
- 1–2 broad hashtags
- 1 branded hashtag

Default branded hashtag:

- #mindsetmediagroup

Approved alternate when contextually stronger:

- #mmgcreators

The engine must avoid unnecessary repetition of the same niche and broad hashtags across consecutive posts. It must keep a recent-hashtag history and rotate intelligently while preserving relevance.

## Media Intelligence

For each uploaded asset, Kairos must:

- identify the visible subject and likely message
- detect text already present in the asset
- avoid contradicting the visible asset
- avoid inventing people, products, claims, statistics, links, or events
- detect whether the asset is promotional, educational, announcement, product, milestone, creator-comedy, business, publishing, AI, or community content
- recommend platform, format, posting slot, title, body, CTA, and hashtag mix
- mark uncertainty when the image or video does not support a confident interpretation

## TikTok Commercial Disclosure Defaults

MMG is promoting its own business by default.

Canonical default fields:

- disclose_commercial_content: true when the post promotes MMG, an MMG product, service, page, book, offer, creator resource, or commercial initiative
- brand_organic_toggle: true
- brand_content_toggle: false
- brand_partner: none
- paid_partnership: false

The engine must never mark MMG as a paid partner or third-party branded-content creator unless the user explicitly identifies a real third-party commercial relationship.

TikTok API mapping:

- `brand_organic_toggle=true` means the content promotes the creator's own business
- `brand_content_toggle=true` means a paid partnership promoting a third-party business

The disclosure decision is immutable after publication in TikTok's user workflow, so the composer must require a final review before publishing.

## Ads Authorization

Ads authorization and commercial disclosure are separate controls.

The system must not assume that a one-year authorization is always required or supported by every publishing route. It must present a separate, explicit field:

- Allow paid-media authorization: off by default
- Authorized party: Mindset Media Group only unless explicitly changed
- Duration: platform-supported selectable duration

No third-party brand authorization may be granted by default.

## AI-Generated Content Disclosure

The composer must include an AI-generated-content determination.

- If the uploaded visual is materially AI-generated or synthetically altered and platform rules require disclosure, set the platform AI-content field and show it in the approval summary.
- Do not label ordinary editing, resizing, color correction, captions, or formatting as AI-generated unless platform policy requires it.

## Approval Gate

Before any post is scheduled or published, display a single approval card containing:

- platform and account
- media type and media count
- media order
- title when applicable
- body copy
- hashtags
- CTA or destination
- scheduled time
- privacy setting
- comments, duet, and stitch settings where applicable
- commercial disclosure status
- own-brand versus paid-partnership status
- AI-generated-content status
- ads-authorization status

Required checkbox:

- I confirm this post promotes Mindset Media Group or an MMG-owned product/service and is not a third-party paid partnership.

The checkbox may be saved as a policy default, but each final publication receipt must record the policy version and user approval timestamp.

## Publication Flow

1. Upload media
2. Analyze media
3. Generate copy
4. Apply Pyramid Mix
5. Adapt by platform
6. Review disclosures
7. Preview final post
8. Approve
9. Schedule or publish
10. Poll platform status
11. Store post ID, URL, timestamp, settings, and receipt
12. Monitor performance
13. Feed results into the next recommendation cycle

## Scheduling Defaults

TikTok Pacific-time starting schedule:

- 6:00 a.m.
- 12:00 p.m.
- 8:00 p.m.

Facebook starting windows should be treated as experiments and optimized from account-specific results. Initial test windows:

- 9:00 a.m. Pacific
- 1:00 p.m. Pacific
- 7:00 p.m. Pacific for selected story, community, discussion, milestone, or video content

The scheduler must never silently change the approved cadence. Kairos may recommend changes through an Action Card with supporting evidence.

## Platform Integration Boundaries

TikTok:

- Use the approved Content Posting API
- Require an approved app and authorized `video.publish` scope
- Query creator information before posting
- Support direct video and photo posting where the approved API permits it
- Store access tokens server-side only
- Poll publish status and retain the platform receipt

Facebook:

- Use Meta's approved Page publishing interfaces and required Page permissions
- Store Page tokens server-side only
- Support photo, multi-photo, video, Reel, and standard Page post workflows only where the connected Page and current API permissions allow them
- Verify the published Page post and retain its ID and URL

## Failure and Recovery

Every failed post must become an actionable recovery card with:

- failed platform
- failed asset
- API error code
- user-safe explanation
- retry eligibility
- token or authorization issue if applicable
- recommended correction
- no duplicate repost without confirmation

## Metrics and Learning

Track by post, format, platform, pillar, posting slot, hashtag set, CTA, and asset type:

- views or reach
- watch time where available
- completion rate where available
- saves
- shares
- comments
- follows
- profile visits
- link clicks
- conversions and revenue when connected

Kairos must use these results to generate evidence-based Action Cards, not silently alter policy.

## Implementation Sequence

1. SPE-001 — Social Composer UI
2. SPE-002 — Media upload, storage, ordering, and preview
3. SPE-003 — MMG Post Writer and Pyramid Mix engine
4. SPE-004 — Disclosure and approval-policy engine
5. SPE-005 — TikTok account authorization and direct-post adapter
6. SPE-006 — Facebook Page authorization and publishing adapter
7. SPE-007 — Pacific-time scheduler and publication queue
8. SPE-008 — Publication receipts, retry, and failure recovery
9. SPE-009 — Performance analytics and learning loop
10. SPE-010 — Autonomous Growth Engine Action Cards and daily briefs

## Production Safety

- No browser-exposed social tokens
- No silent posting before account authorization and explicit executive approval
- No third-party paid-partnership marking by default
- No duplicate posts after ambiguous API timeouts without status reconciliation
- No invented claims, products, links, statistics, testimonials, or relationships
- Every publication must produce a receipt or a governed failure record
