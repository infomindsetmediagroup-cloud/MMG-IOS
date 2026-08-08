# Kairos TikTok Connector — Production Setup

## Purpose

Kairos Social Production creates and approves the immutable TikTok package first. The TikTok connector is a separate authenticated execution layer that consumes that approved package without rewriting it.

Canonical TikTok account: `@mindset.media.group`.

## TikTok developer application

Configure the TikTok developer application with:

- Login Kit.
- Content Posting API.
- Redirect URI exactly: `https://mmg-ios.info-mindsetmediagroup.workers.dev/api/social-connectors/tiktok/callback`.
- Requested scopes: `user.info.basic`, `video.list`, `video.upload`, `video.publish`.
- A verified domain or URL prefix for every media origin Kairos will pass to TikTok through `PULL_FROM_URL`.

Do not authorize or retain a different TikTok creator account. The connector verifies `creator_username` against `mindset.media.group` and fails closed on mismatch.

## Cloudflare configuration

The repository contains only non-secret connector policy. Do not commit TikTok credentials.

Provision these production secrets/variables in Cloudflare:

- `KAIROS_TIKTOK_CLIENT_KEY` — TikTok app client key. Treat as deployment configuration rather than public UI data.
- `KAIROS_TIKTOK_CLIENT_SECRET` — TikTok app client secret. Secret only.
- `KAIROS_TIKTOK_VERIFIED_MEDIA_ORIGINS` — comma-separated HTTPS origins that are also verified for the TikTok app, for example `https://media.example.com`.

The repository already fixes these policy values:

- `KAIROS_TIKTOK_CONNECTOR_ENABLED = "true"`
- `KAIROS_TIKTOK_REDIRECT_URI = "https://mmg-ios.info-mindsetmediagroup.workers.dev/api/social-connectors/tiktok/callback"`
- `KAIROS_TIKTOK_EXPECTED_USERNAME = "mindset.media.group"`
- `KAIROS_TIKTOK_SCOPES = "user.info.basic,video.list,video.upload,video.publish"`
- `KAIROS_TIKTOK_DIRECT_POST_AUDITED = "false"`

Keep `KAIROS_TIKTOK_DIRECT_POST_AUDITED` false until TikTok has completed the Content Posting API audit for Direct Post. Do not use the flag to bypass TikTok review.

## Execution modes

### Upload to TikTok

- Requires a connected exact account and the required upload scope.
- Media must use a configured TikTok-verified origin.
- Video upload sends the media to the TikTok inbox/editor. Kairos retains the approved caption for manual transfer because the inbox video upload endpoint does not take caption text.
- Photo upload uses the Content Posting API photo `MEDIA_UPLOAD` contract.

### Direct Post

- Requires the Direct Post audit flag to be true only after actual TikTok audit completion.
- Requires a fresh creator-info query before handoff.
- Uses only privacy levels returned for the connected creator.
- Requires immediate explicit export consent in Kairos.
- Media must use a TikTok-verified origin.

### Native TikTok text posts

The current Content Posting API connector supports video and photo posting, not TikTok native text-post publication. Kairos keeps native text posts as a manual handoff and does not claim API publication.

## Security and governance

- TikTok access and refresh tokens are stored only in `KairosTikTokConnectorVault`, a dedicated Cloudflare Durable Object.
- Browser code never receives TikTok access or refresh tokens.
- Connector operations other than the OAuth callback require a verified Shopify Admin session.
- OAuth state is single-use and expires after ten minutes.
- Wrong-account authorization deletes retained TikTok tokens and fails closed.
- Social packages must be in `approved-for-connector-handoff` state.
- The original `kairos-social-connector-payload-v1` retains `publish:false`; connector execution is a separate explicit action.
- Every export requires immediate user consent plus confirmation of TikTok Content Sharing Guidelines.
- Connector receipts bind the package payload SHA-256 to the TikTok `publish_id`.
- Status readback uses TikTok publish-status APIs. When `video.list` is granted and TikTok exposes post IDs, Kairos can read post metrics into the receipt.

## Acceptance sequence

1. Deploy connector code with no invented credentials.
2. Confirm connector status reports configuration required until the real TikTok app configuration exists.
3. Provision client key, client secret, and verified media origin in Cloudflare.
4. Reopen Kairos from Shopify Admin and choose **Connect TikTok**.
5. Authorize `@mindset.media.group` in TikTok.
6. Confirm Kairos reports account match verified.
7. Build and approve a test social package.
8. Test **Upload to TikTok** first using media hosted on the verified origin.
9. Refresh the receipt until TikTok reports the terminal state.
10. Only after TikTok Direct Post audit completion, change `KAIROS_TIKTOK_DIRECT_POST_AUDITED` to `true` and validate Direct Post with a controlled package.

A code deploy is not equivalent to a connected TikTok account. Live posting acceptance is complete only after real TikTok authorization and a TikTok-issued publish/upload receipt are observed.
