const BUILD =
  "kairos-manuscript-production-flow-bootstrap-20260731-5-state-timeout";
const RELEASE =
  "manuscript-local-production-controller-20260731-5-state-timeout";
const COMMAND_RUNTIME_RELEASE =
  "five-center-dashboard-state-check-recovery-20260731-1";

// Install the bounded GET transport before any production controller can run.
await import(`./kairos-state-fetch-install.js?v=${RELEASE}`);
await import(`./legacy-runtime-loader.js?v=${COMMAND_RUNTIME_RELEASE}`);

if (window.KairosLegacyRuntime?.load) {
  await window.KairosLegacyRuntime.load();
}

// This bootstrap is the sole controller owner. The generic command runtime no
// longer loads manuscript-auto-pipeline.js under a second module URL.
await import(`./manuscript-auto-pipeline.js?v=${RELEASE}`);
await import(`./manuscript-production-flow-guard.js?v=${RELEASE}`);

window.KairosManuscriptProductionFlowBootstrap = Object.freeze({
  build: BUILD,
  release: RELEASE,
  commandRuntimeRelease: COMMAND_RUNTIME_RELEASE,
  controllerBuild: window.KairosManuscriptAutoPipelineController?.build || null,
  executionMode: window.KairosManuscriptAutoPipelineController?.executionMode || null,
  boundedStateTransport: true,
  singleControllerOwner: true,
  ready: true,
});
