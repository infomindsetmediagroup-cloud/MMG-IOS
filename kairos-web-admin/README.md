# Kairos Web Admin

Kairos Web Admin is the browser-based operating console for Mindset Media Group / Kairos operations.

This subtree is now part of the actual GitHub repository source of truth: `infomindsetmediagroup-cloud/MMG-IOS`.

## Current Operating Baseline

The current baseline supports a no-install local operator that can run with plain Node.js:

```bash
node scripts/kairos-operate-local.mjs
```

Default URL:

```text
http://localhost:4100
```

## Current Capabilities

- Manual project intake
- Mock Shopify order ingestion
- Customer project creation
- Production workflow generation
- Persistent local operator state
- Project detail pages
- Browser-based stage advancement
- Operator notes
- Project search and filtering
- Priority updates
- Local event feed
- State export

## Repository Rule

This GitHub repository is the persistent source of truth. Export ZIP files are not development baselines.

Future Kairos Web Admin work should be committed directly into this subtree or into first-class monorepo packages owned by this repository.
