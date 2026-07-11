# Command Center Release Checklist

The MMG/Kairos Command Center is operational only after the approved commit is merged into `main`, deployed to the canonical production origin, and verified in the live browser.

## Release identity

- [ ] Source branch and commit SHA recorded
- [ ] Environment banner displays `PREVIEW` or `PRODUCTION`
- [ ] Browser build identifier matches `/api/release-status`
- [ ] Rollback commit recorded before deployment

## Browser acceptance

- [ ] Correct Command Center design loads
- [ ] Operator login succeeds
- [ ] Refresh preserves the secure session
- [ ] Live Kairos opens without a second credential prompt
- [ ] One non-destructive request succeeds
- [ ] Request ID and audit ID are displayed
- [ ] Logout clears access
- [ ] Private browsing begins unauthenticated
- [ ] Current JavaScript and CSS assets load without stale-cache behavior
- [ ] iPhone Safari acceptance completed
- [ ] Desktop Chrome acceptance completed

## Runtime acceptance

- [ ] `/api/health` reports ready
- [ ] `/api/release-status` reports the expected environment and build
- [ ] Frontend and backend builds match
- [ ] No provider, runtime, Shopify, or operator secrets appear in browser source or storage

## Completion states

1. Implemented
2. Validated locally
3. Validated in preview
4. Validated in production

Only state 4 may be described as live or operational.
