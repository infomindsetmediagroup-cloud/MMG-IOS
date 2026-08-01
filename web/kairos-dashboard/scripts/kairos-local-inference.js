// Compatibility entrypoint. Kairos production inference remains local-only.
const RELEASE = "kairos-local-inference-20260731-5-state-recovery";
await import(`./kairos-local-inference-same-origin.js?v=${RELEASE}`);
