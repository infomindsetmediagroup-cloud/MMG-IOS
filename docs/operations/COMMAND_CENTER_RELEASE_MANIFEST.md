# Command Center Recovery Release Manifest

Status: implementation in progress

Canonical production branch: `main`

Canonical production origin: `https://mmg-ios.vercel.app`

Recovery scope:

- browser operator authentication
- same-origin secure session
- Live Kairos session reuse
- release identity and environment visibility
- production browser acceptance gate

Excluded until browser recovery is certified:

- storefront inspection
- Shopify Admin inspection
- publishing mutations
- additional autonomous capabilities

Rollback target: record the last verified production commit before merge.
