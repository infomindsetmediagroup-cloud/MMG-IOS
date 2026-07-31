const BUILD = "kairos-manuscript-production-flow-bootstrap-20260731-1";
const RELEASE = "manuscript-production-flow-guard-20260731-1";
const COMMAND_RUNTIME_RELEASE = "five-center-dashboard-direct-studio-chunks-20260730-4";

await import(`./legacy-runtime-loader.js?v=${COMMAND_RUNTIME_RELEASE}`);

if (window.KairosLegacyRuntime?.load) {
  await window.KairosLegacyRuntime.load();
}

await import(`./manuscript-production-flow-guard.js?v=${RELEASE}`);

window.KairosManuscriptProductionFlowBootstrap = Object.freeze({
  build: BUILD,
  release: RELEASE,
  commandRuntimeRelease: COMMAND_RUNTIME_RELEASE,
  ready: true,
});
