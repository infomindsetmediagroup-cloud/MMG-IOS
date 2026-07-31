const BUILD = "kairos-manuscript-production-flow-bootstrap-20260731-3";
const RELEASE = "manuscript-local-production-controller-20260731-3";
const COMMAND_RUNTIME_RELEASE = "five-center-dashboard-direct-studio-chunks-20260730-4";

await import(`./legacy-runtime-loader.js?v=${COMMAND_RUNTIME_RELEASE}`);

if (window.KairosLegacyRuntime?.load) {
  await window.KairosLegacyRuntime.load();
}

// Import the canonical controller under a release-specific URL so iPhone Safari
// cannot retain the retired production module from an earlier module graph.
await import(`./manuscript-auto-pipeline.js?v=${RELEASE}`);
await import(`./manuscript-production-flow-guard.js?v=${RELEASE}`);

window.KairosManuscriptProductionFlowBootstrap = Object.freeze({
  build: BUILD,
  release: RELEASE,
  commandRuntimeRelease: COMMAND_RUNTIME_RELEASE,
  controllerBuild: window.KairosManuscriptAutoPipelineController?.build || null,
  executionMode: window.KairosManuscriptAutoPipelineController?.executionMode || null,
  ready: true,
});
