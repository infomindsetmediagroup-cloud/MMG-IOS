# Kairos Local Operator

This is the immediate no-install Kairos Web Admin operating mode.

## Run

From repository root:

```bash
cd kairos-web-admin
node scripts/kairos-operate-local.mjs
```

Or:

```bash
cd kairos-web-admin
npm start
```

Open:

```text
http://localhost:4100
```

## Requirements

- Node.js only
- No Docker
- No pnpm
- No Codespaces
- No GitHub Actions
- No CI minutes

## Functions

- Manual project intake
- Mock Shopify order intake
- Customer project dashboard
- Production workflow generation
- Stage advancement
- Project notes
- Priority updates
- Search and filters
- Local JSON persistence
- State export

## Local State

Runtime state is stored under:

```text
.kairos/local-operator-state.json
```

That folder is ignored and should not be committed.
