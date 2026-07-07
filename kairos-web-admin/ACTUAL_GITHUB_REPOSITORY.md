# Kairos Web Admin — Actual Git Repository Binding

Status: Active
Repository: `infomindsetmediagroup-cloud/MMG-IOS`
Branch: `kairos-web-admin-import`

## Rule

This GitHub repository is now the persistent source of truth for Kairos/Karos engineering work available to this ChatGPT session.

Going forward:

- Do not create separate canonical ZIP baselines as the development source of truth.
- Update this repository when advancing Kairos.
- Commit changes to a branch before opening a pull request.
- Preserve automatic GitHub Actions minute safety; do not enable expensive automatic CI unless explicitly requested.
- Treat exported ZIPs, if any, as convenience artifacts only, not the source of truth.

## Current Import

The current Kairos Web Admin source baseline is included at:

`kairos-web-admin/artifacts/kairos-web-admin-source-v1.7.tar.gz.b64`

Decode with:

```bash
base64 -d kairos-web-admin/artifacts/kairos-web-admin-source-v1.7.tar.gz.b64 > kairos-web-admin-source-v1.7.tar.gz
tar -xzf kairos-web-admin-source-v1.7.tar.gz
```

The extracted folder contains the local Kairos Web Admin operating baseline with the emergency Node.js operator, dashboard API, mock Shopify order ingestion, persistent local state, project controls, project notes, manual intake, filtering, and repository doctrine.

## Next Correct Engineering Step

The next step should extract the source into a first-class repository subtree, then continue development directly in GitHub with normal commits and pull requests.
