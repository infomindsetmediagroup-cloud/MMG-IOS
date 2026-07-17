# Kairos Tuesday Loading Baseline Lock

The production browser-loading baseline is commit `3a7e5c538e1aace8892a900b5717fd4cf36acc99` from Tuesday, July 14, 2026.

The following contracts are immutable unless the replacement is proven live before promotion:

- `https://mmg-ios.info-mindsetmediagroup.workers.dev/` must resolve and return the Command Center.
- `cloudflare/mmg-ios/wrangler.toml` keeps `src/kairos-production-entry.js` as the active entrypoint.
- The root document and core assets remain owned by the Tuesday dashboard shell.
- New functionality must be mounted behind the working shell and must not replace root routing, Worker identity, or deployment ownership.
- A failed feature runtime must degrade its API request only; it must never prevent `/` from loading.
- Before production promotion, deployment must validate bundle, root HTTP response, root HTML marker, and production readback.

Rollback branch: `locked/tuesday-loading-baseline-20260714`.
