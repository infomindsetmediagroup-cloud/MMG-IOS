# Kairos Stable Renderer v2

Production browser contract:

- Preserve the proven Worker entrypoint, workers.dev hostname, SPA asset directory, and root build marker.
- Load exactly one Command Center renderer: `command-hub-stable-v2.js`.
- Do not load the obsolete recovery renderer, post-render reconciliation overlays, or eager domain modules.
- Load child cards from `/api/hub/contracts`.
- Open the 23 dedicated child workspaces through `workspace-runtime.js`.
- Handle Website Retool and Runtime Health directly in the stable renderer.
- Never render a floating system-status element in the header.
- Never authorize style, visual, CSS, asset, design-token, or theme-scheme mutation from Website Retool.
- Preserve the current native Shopify header/footer and visual design.
