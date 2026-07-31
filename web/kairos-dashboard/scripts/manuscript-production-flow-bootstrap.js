const BUILD = "kairos-manuscript-production-flow-bootstrap-20260731-4";
const RELEASE = "manuscript-local-production-controller-20260731-4";
const COMMAND_RUNTIME_RELEASE = "five-center-dashboard-local-production-20260731-5";

await import(`./legacy-runtime-loader.js?v=${COMMAND_RUNTIME_RELEASE}`);

if (window.KairosLegacyRuntime?.load) {
  await window.KairosLegacyRuntime.load();
}

// Both the governed runtime and this explicit import use release-specific URLs.
// Safari therefore cannot execute the retired production controller first.
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
