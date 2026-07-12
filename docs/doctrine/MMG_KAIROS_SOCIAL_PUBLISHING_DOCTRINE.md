# MMG/Kairos Social Publishing Doctrine v1.0

## Authority and purpose

This doctrine governs how Kairos converts an approved MMG asset into platform-ready TikTok and Facebook publications. Social output is durable MMG intellectual property, not disposable content. Kairos must preserve the master asset, create platform variants, validate them, request one executive approval, publish only through an authorized connector, verify publication, record evidence, and feed performance back into the Knowledge Vault.

## Non-negotiable publishing lifecycle

1. Ingest or create the master asset.
2. Classify the content: text, single image, multi-image/carousel, video, reel, or story.
3. Confirm ownership, originality, safety, accuracy, platform eligibility, and commercial-disclosure requirements.
4. Create a platform-specific publication package without altering the approved master asset.
5. Validate media, caption, links, hashtags, accessibility text, cover/frame, privacy, and account capabilities.
6. Present one concise approval package: preview, destination, format, caption, media order, schedule, privacy, and disclosures.
7. Publish only after executive approval or an explicitly enabled auto-publishing policy.
8. Poll or receive platform status until published, failed, or requires attention.
9. Preserve platform post ID, URL, timestamps, submitted payload hash, approval record, and failure evidence.
10. Monitor performance and add reusable lessons to MMG knowledge.

Modification after approval invalidates approval. Credentials, tokens, scopes, privacy choices, disclosures, or destination accounts may never be guessed.

## Universal MMG packaging rules

- One post has one job.
- Lead with the strongest truthful hook; do not use unsupported promises.
- Use the original MMG asset or an explicitly approved derivative.
- Maintain correct spelling, names, logos, links, product details, and calls to action.
- Add accessibility text or meaningful spoken/on-screen context when supported.
- Default MMG hashtag pyramid: two niche hashtags, two broad hashtags, and one branded hashtag. TikTok captions default to one short sentence, a blank line, then five lowercase hashtags. Avoid filler and unnecessary hashtag repetition.
- Default branded hashtag: `#mindsetmediagroup`; use `#mmgcreators` when the creator identity is the stronger campaign fit.
- Emoji follows the title or hook, never precedes it by default.
- Preserve campaign, product, book, customer, and source-asset relationships in metadata.
- Never silently cross-post identical packaging when platform behavior calls for a platform-specific variant.

## TikTok

### Text post

Use only when supported by the connected TikTok publishing capability. Package a short, high-contrast opening statement, one focused idea, and a direct engagement or next-step prompt. If the API connector does not support text publishing, Kairos must prepare a draft for native completion instead of pretending to publish.

### Single photo

Use a verified-domain media URL, preserve full subject visibility, and confirm the crop. Caption: one short sentence, blank line, five lowercase pyramid hashtags. Query creator information before Direct Post and honor returned privacy and interaction options.

### Photo carousel

Order images intentionally: hook/cover, value sequence, proof or example, conclusion, CTA. Each slide must advance the same job. Validate every URL and the final order before approval.

### Video

Default educational structure: 0–3 seconds hook; 3–10 seconds problem, promise, or proof; 10–20 seconds value, demonstration, or story; final three seconds CTA. Validate the connected creator's maximum duration, cover, title/caption, privacy, comments, duet, stitch, music/commercial-content settings, and media transfer method before submission.

### TikTok publication modes

- Direct Post: requires approved `video.publish`, creator-info query, user authorization, compliant export UI, and post-status verification.
- Upload Draft: uses `video.upload`; the user completes editing and publication inside TikTok after an inbox notification.
- Unaudited Direct Post clients remain private-only. Kairos must surface this limitation before approval.

Default MMG TikTok schedule: 6:00 AM, 12:00 PM, and 8:00 PM America/Los_Angeles, subject to campaign rules and performance evidence.

## Facebook Pages

### Text post

Use a clear opening line, short readable paragraphs, one primary CTA, and a link only when it serves the post's job. Do not force TikTok caption brevity onto a Facebook post when context improves usefulness.

### Single image

Lead with the message, use the approved image, include meaningful context, and verify the Page destination and link preview behavior.

### Multi-image post

Sequence images as a coherent narrative or product set. Preserve order and captions. Do not represent a multi-image Page post as a Reel or Story.

### Video

Use Page video publishing with the correct upload flow, title, description, thumbnail, captions when available, and status verification.

### Reel

Use the Facebook Reels publishing flow. Optimize the opening seconds, vertical framing, readable safe zones, original value, and a clear finish. Preserve the master video separately from the Facebook derivative.

### Story

Use the Facebook Page Stories API only when the connected Page and media type are supported. Stories are short-lived distribution assets but their source, approval, and publication evidence remain durable MMG records.

## Approval package

The executive view must show only: objective, preview, TikTok/Facebook destinations, format per destination, final caption and hashtags, media order, privacy/audience, schedule, disclosures, validation result, and the actions Approve & Publish, Schedule, Request Revision, or Reject.

## Connector governance

- OAuth and server-side secrets only. Never request or store a TikTok or Facebook password.
- Tokens are encrypted at rest, redacted from logs, refreshable, revocable, tenant-scoped, and unavailable to browser code.
- Minimum scopes only; scope changes require reauthorization.
- All publishes require idempotency protection, rate-limit handling, retries that cannot duplicate posts, webhook/status reconciliation, and an immutable audit record.
- A disconnected, expired, unreviewed, restricted, or insufficiently scoped connector must block publishing and explain the single required corrective action.

## Official connector requirements

TikTok: registered developer app, Login Kit, Content Posting API, approved scopes (`user.info.basic`, and as needed `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`, or `video.upload`), verified media domain/URL prefix, OAuth callback, token refresh, creator-info query, publish initialization, media transfer, and status/webhook processing.

Facebook: Meta developer app, Meta Login for Business/Facebook Login, Page authorization, Page access token, Page selection, permissions including `pages_manage_posts` and `pages_read_engagement` plus any format-specific permissions required by current Meta review, Page posts/photos/video/Reels/Stories adapters, status processing, and webhook/analytics ingestion.

