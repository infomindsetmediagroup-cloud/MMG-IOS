const BUILD = "kairos-manuscript-production-flow-bootstrap-20260731-1";
const RELEASE = "manuscript-production-flow-guard-20260731-1";

await import(`./legacy-runtime-loader.js?v=${RELEASE}`);

if (window.KairosLegacyRuntime?.load) {
  await window.KairosLegacyRuntime.load();
}

await import(`./manuscript-production-flow-guard.js?v=${RELEASE}`);

window.KairosManuscriptProductionFlowBootstrap = Object.freeze({
  build: BUILD,
  release: RELEASE,
  ready: true,
});
