import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canonical = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-canonical-v1.js", "utf8");
const localOnly = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-only-v1.js", "utf8");
const localExecution = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-execution-v1.js", "utf8");
const operational = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const browser = readFileSync("web/kairos-dashboard/scripts/executive-os-live-details.js", "utf8");
const localBrowser = readFileSync("web/kairos-dashboard/scripts/executive-local-inference.js", "utf8");
const runtimeLoader = readFileSync("web/kairos-dashboard/scripts/kairos-runtime-loader.js", "utf8");
const commandHub = readFileSync("web/kairos-dashboard/scripts/command-hub.js", "utf8");
const executive = readFileSync("web/kairos-dashboard/scripts/executive-os.js", "utf8");
const safari = readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");
const manuscriptStudio = readFileSync("web/kairos-dashboard/scripts/manuscript-studio.js", "utf8");
const manuscriptProduction = readFileSync("web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", "utf8");
const productionBootstrap = readFileSync("web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js", "utf8");
const postIntakeGuard = readFileSync("web/kairos-dashboard/scripts/manuscript-post-intake-guard.js", "utf8");
const productionWorkspace = readFileSync("web/kairos-dashboard/scripts/production-workspace-controller.js", "utf8");
const legacy = readFileSync("web/kairos-dashboard/scripts/legacy-runtime-loader.js", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

const parentCenters = commandHub.match(/id: "(?:knowledge|content|business|customers|operations)"/g) || [];
const activeScripts = legacy.match(/const SCRIPT_FILES = \[([\s\S]*?)\];/)?.[1] || "";
const responseCapture = productionWorkspace.match(/async function captureProductionResponse[\s\S]*?async function upsertWorkspaceRecord/)?.[0] || "";
const workspaceObserver = productionWorkspace.match(/const observer = new MutationObserver[\s\S]*?observer\.observe/)?.[0] || "";

test("the production Worker activates the canonical local provider firewall", () => {
  assert.match(wrangler, /main = "src\/kairos-production-entry-local-canonical-v1\.js"/);
  assert.match(wrangler, /KAIROS_MODEL_PROVIDER = "browser-webgpu"/);
  assert.match(wrangler, /KAIROS_MANUSCRIPT_START_MODE = "local-browser"/);
  assert.match(canonical, /KAIROS_LOCAL_CANONICAL_ENTRY_BUILD/);
  assert.match(canonical, /PROVIDER_INDEPENDENT_OPERATIONAL_PATHS/);
  assert.match(canonical, /providerBlockedEnv/);
  assert.match(canonical, /operationalCompatibilityEnv/);
  assert.match(canonical, /property === "OPENAI_API_KEY"/);
  assert.match(canonical, /return ""/);
  assert.match(canonical, /kairos-local-readiness-sentinel-not-a-provider-key/);
  assert.match(canonical, /X-Kairos-OpenAI-Calls", "disabled"/);
  assert.doesNotMatch(canonical, /handleKairosAPI/);
  assert.doesNotMatch(canonical, /api\.openai\.com/);
  assert.match(localOnly, /KAIROS_LOCAL_ONLY_ENTRY_BUILD/);
  assert.match(localOnly, /LEGACY_MANUSCRIPT_GENERATION/);
  assert.match(localOnly, /REVENUE_GENERATION/);
  assert.match(localOnly, /LOCAL_INFERENCE_REQUIRED/);
  assert.match(localExecution, /KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD/);
});

test("the readiness sentinel is limited to non-generative operational routes", () => {
  assert.match(canonical, /"\/api\/hub\/run"/);
  assert.match(canonical, /"\/api\/workflows"/);
  assert.match(canonical, /PROVIDER_INDEPENDENT_OPERATIONAL_PATHS\.has\(url\.pathname\)/);
  assert.match(canonical, /operationalCompatibilityEnv\(env\)/);
  assert.match(canonical, /providerBlockedEnv\(env\)/);
});

test("objective submission launches the persistent project Agent and foundation Workflow", () => {
  assert.match(operational, /path === "\/api\/hub\/run"/);
  assert.match(operational, /bootstrapProject/);
  assert.match(operational, /startFoundationWorkflow/);
  assert.match(operational, /advanceToApproval/);
  assert.match(operational, /foundation_approval_required/);
  assert.doesNotMatch(operational, /automaticPublicationAllowed:\s*true/);
  assert.doesNotMatch(operational, /commerceMutationAllowed:\s*true/);
});

test("foundation approval queues authoritative source generation on the local device", () => {
  assert.match(localOnly, /approveFoundationWorkflow\(foundation\.instanceId/);
  assert.match(localOnly, /local_source_generation_required/);
  assert.match(localOnly, /mode:\s*"browser-webgpu"/);
  assert.match(localOnly, /externalPaidAPIUsed:\s*false/);
  assert.match(localBrowser, /createAuthoritativeSource/);
  assert.match(localBrowser, /import\("\.\.\/vendor\/webllm-bundle\.js"\)/);
  assert.match(localBrowser, /\/source-text/);
  assert.match(localBrowser, /\/sync-source/);
  assert.doesNotMatch(localExecution, /handleKairosAPI/);
});

test("production starts only through an explicit local workflow action", () => {
  assert.match(localExecution, /start-production/);
  assert.match(localExecution, /AUTHORITATIVE_SOURCE_REQUIRED/);
  assert.match(localExecution, /FOUNDATION_APPROVAL_REQUIRED/);
  assert.match(localExecution, /execution_started/);
  assert.match(localBrowser, /\/start-production/);
  assert.match(localBrowser, /KairosLocalInference\.run/);
  assert.match(localBrowser, /\/complete-production/);
  assert.doesNotMatch(localBrowser, /\/generation-job/);
});

test("workflow projection exposes local operational actions", () => {
  assert.match(localExecution, /prepare-source/);
  assert.match(localExecution, /sync-source/);
  assert.match(localExecution, /start-production/);
  assert.match(localExecution, /complete-production/);
  assert.match(localExecution, /sourceReady/);
  assert.match(localExecution, /executionMode:\s*"browser-webgpu"/);
  assert.match(localExecution, /automaticPublicationAllowed:\s*false/);
  assert.match(localExecution, /commerceMutationAllowed:\s*false/);
});

test("the optional Executive OS retains governed foundation and local production controls", () => {
  assert.match(browser, /Approve foundation/);
  assert.match(browser, /Request revision/);
  assert.match(browser, /Resume workflow/);
  assert.match(browser, /\/api\/workflows\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(browser, /kairos:workflow:changed/);
  assert.match(localBrowser, /Approve & generate locally/);
  assert.match(localBrowser, /Generate source locally/);
  assert.match(localBrowser, /Run production locally/);
  assert.match(localBrowser, /No OpenAI API call/);
  assert.match(safari, /executive-os-live-details\.js\?v=20260729-4/);
});

test("live execution detail cannot recursively trigger its own observer", () => {
  assert.match(browser, /kairos-executive-live-details-20260729-4/);
  assert.match(browser, /shellObserver\?\.disconnect\(\)/);
  assert.match(browser, /requestAnimationFrame/);
  assert.match(browser, /renderingDetails/);
  assert.match(browser, /reconnectShellObserver/);
  assert.doesNotMatch(browser, /MutationObserver\(\(\) => queueMicrotask\(renderDetails\)\)/);
});

test("Safari API requests cannot leave the dashboard refreshing forever", () => {
  assert.match(safari, /installGovernedFetchTimeout/);
  assert.match(safari, /API_GET_TIMEOUT_MS = 12000/);
  assert.match(safari, /API_MUTATION_TIMEOUT_MS = 45000/);
  assert.match(safari, /Promise\.race/);
  assert.match(safari, /AbortController/);
  assert.match(safari, /TimeoutError/);
  assert.match(safari, /executive-os\.js\?v=browser-finish-20260729-5/);
  assert.match(index, /safari-manuscript-intake-compat\.js\?v=safari-native-docx-20260730-1/);
});

test("Safari manuscript checksums preserve the native digest identifier first", () => {
  assert.match(safari, /safari-manuscript-intake-compat-20260730-12-five-center/);
  assert.match(safari, /return await nativeDigest\(algorithm, data\)/);
  assert.match(safari, /const alternate = typeof algorithm === "string"/);
  assert.match(safari, /return await nativeDigest\(alternate, data\)/);
  assert.match(safari, /__kairosDigestIdentifierFallback/);
  assert.doesNotMatch(safari, /const normalized = typeof algorithm === "string" \? \{ name: algorithm \} : algorithm/);
});

test("Manuscript Studio directly owns verified raw chunk storage and guarded local production", () => {
  assert.match(index, /legacy-runtime-loader\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-production-flow-bootstrap\.js\?v=manuscript-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-post-intake-guard\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.doesNotMatch(index, /executive-local-inference\.js/);
  assert.doesNotMatch(index, /kairos-runtime-loader\.js/);
  assert.match(runtimeLoader, /import "\.\/legacy-runtime-loader\.js"/);
  assert.doesNotMatch(runtimeLoader, /executive-local-inference\.js/);
  assert.match(legacy, /kairos-five-center-runtime-loader-20260731-3-post-intake/);
  assert.match(legacy, /five-center-dashboard-restored-20260731-2/);
  assert.match(legacy, /five-center-dashboard-post-intake-stability-20260731-1/);
  assert.doesNotMatch(legacy, /const ASSET_RELEASE = "five-center-dashboard-direct-studio-chunks-20260730-4"/);
  assert.match(activeScripts, /"kairos-local-inference\.js"/);
  assert.match(activeScripts, /"manuscript-post-intake-guard\.js"/);
  assert.match(activeScripts, /"manuscript-studio\.js"/);
  assert.match(activeScripts, /"manuscript-auto-pipeline\.js"/);
  assert.ok(activeScripts.indexOf('"manuscript-post-intake-guard.js"') < activeScripts.indexOf('"manuscript-studio.js"'));
  assert.doesNotMatch(activeScripts, /manuscript-docx-upload-hotfix\.js/);
  assert.match(safari, /kairos-native-docx-extractor-20260730-1/);
  assert.match(safari, /installNativeDocxExtractor/);
  assert.match(safari, /new DecompressionStream\("deflate-raw"\)/);
  assert.match(safari, /word\/document\.xml/);
  assert.match(manuscriptStudio, /manuscript-studio-direct-chunks-20260730-4/);
  assert.match(manuscriptStudio, /chunkedSourceUpload:\s*true/);
  assert.match(manuscriptStudio, /multipartSourceUpload:\s*false/);
  assert.match(manuscriptStudio, /FILE_CHUNK_BYTES = 512 \* 1024/);
  assert.match(manuscriptStudio, /TEXT_CHUNK_BYTES = 128 \* 1024/);
  assert.match(manuscriptStudio, /sourcePath\(projectId, "session"\)/);
  assert.match(manuscriptStudio, /sourcePath\(projectId, "commit"\)/);
  assert.match(manuscriptStudio, /uploadChunkWithRetry/);
  assert.match(manuscriptStudio, /Select the original manuscript file once/);
  assert.doesNotMatch(manuscriptStudio, /new FormData/);
  assert.match(productionBootstrap, /five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(productionBootstrap, /manuscript-post-intake-stability-20260731-1/);
  assert.match(productionBootstrap, /BOOT_TIMEOUT_MS = 20_000/);
  assert.match(productionBootstrap, /renderBootstrapFailure/);
  assert.match(postIntakeGuard, /duplicate Manuscript Studio module blocked/);
  assert.match(postIntakeGuard, /success-overlay-stabilized/);
  assert.match(postIntakeGuard, /success-overlay-restored/);
  assert.match(productionWorkspace, /Manuscript Studio exclusively owns the intake-to-registry transition/);
  assert.doesNotMatch(responseCapture, /url\.includes\("\/api\/manuscript\/intake\/advance"\)/);
  assert.match(workspaceObserver, /dispatchWorkspaceVisibility/);
  assert.doesNotMatch(workspaceObserver, /kairos:production:state-changed/);
  assert.match(manuscriptProduction, /KairosLocalInference/);
  assert.match(manuscriptProduction, /data-start-local-production/);
  assert.match(manuscriptProduction, /auto-pipeline/);
  assert.doesNotMatch(manuscriptProduction, /generation-job|Start Production Job/);
});

test("the Executive OS core always releases its refresh state", () => {
  assert.match(executive, /API_GET_TIMEOUT_MS = 12000/);
  assert.match(executive, /API_MUTATION_TIMEOUT_MS = 45000/);
  assert.match(executive, /Promise\.race/);
  assert.match(executive, /refreshing:\s*false/);
  assert.match(executive, /finally\s*\{[\s\S]*state\.refreshing = false/);
  assert.match(executive, /root\.setAttribute\("aria-busy", "false"\)/);
  assert.match(executive, /renderEmergencyRecovery/);
  assert.match(executive, /data-hard-reload/);
});

test("read-only startup refresh never owns the mutation loading lock", () => {
  const refreshBlock = executive.match(/async function refresh[\s\S]*?function renderEmergencyRecovery/)?.[0] || "";
  assert.match(refreshBlock, /state\.refreshing = true/);
  assert.doesNotMatch(refreshBlock, /state\.loading = true/);
  assert.match(executive, /data-run-objective \$\{state\.loading/);
});

test("the normal page restores the guarded five-parent-card command dashboard", () => {
  assert.match(index, /kairos-five-center-dashboard-post-intake-20260731-1/);
  assert.match(index, /five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-post-intake-stability-20260731-1/);
  const moduleSources = [...index.matchAll(/<script type="module" src="([^"]+)"/g)]
    .map((match) => match[1].replace(/\?v=.*$/, ""));
  assert.deepEqual(moduleSources, [
    "./scripts/safari-manuscript-intake-compat.js",
    "./scripts/command-hub.js",
    "./scripts/command-center-layout.js",
    "./scripts/manuscript-production-flow-bootstrap.js",
  ]);
  assert.doesNotMatch(index, /executive-local-inference\.js/);
  assert.doesNotMatch(index, /kairos-runtime-loader\.js/);
  assert.doesNotMatch(index, /<script[^>]+manuscript-studio\.js/);
  assert.match(safari, /COMMAND_HUB_MODE/);
  assert.match(safari, /const EXECUTIVE_MODE = ROUTE_MODE === "executive"/);
  assert.match(legacy, /commandHubMode/);
  assert.match(legacy, /if \(commandHubMode\) loadCommandRuntime\(\)/);
  assert.equal(parentCenters.length, 5);
  assert.match(commandHub, /Five operating centers/);
  assert.match(commandHub, /Knowledge/);
  assert.match(commandHub, /Content/);
  assert.match(commandHub, /Business/);
  assert.match(commandHub, /Customers/);
  assert.match(commandHub, /Operations/);
});

test("advanced operations preserve the complete command runtime behind explicit navigation", () => {
  assert.match(legacy, /advancedMode/);
  assert.match(legacy, /commandHubMode/);
  assert.match(legacy, /if \(commandHubMode\) loadCommandRuntime\(\)/);
  assert.match(activeScripts, /command-hub\.js/);
  assert.match(activeScripts, /command-center-governance\.js/);
  assert.match(activeScripts, /manuscript-post-intake-guard\.js/);
  assert.match(activeScripts, /manuscript-studio\.js/);
  assert.match(activeScripts, /manuscript-project-setup\.js/);
  assert.match(activeScripts, /production-workspace-controller\.js/);
  assert.match(activeScripts, /shopify-page-compiler\.js/);
  assert.doesNotMatch(activeScripts, /manuscript-docx-upload-hotfix\.js/);
  assert.match(legacy, /data-kairos-persistent-return/);
  assert.match(legacy, /kairos:legacy-runtime:ready/);
});

test("operational readiness is a non-mutating local-only deployment gate", () => {
  assert.match(localExecution, /\/api\/operational-readiness/);
  assert.match(localExecution, /sourceGeneration:\s*checks\.localInference/);
  assert.match(localExecution, /manuscriptProduction:\s*checks\.localInference/);
  assert.match(localExecution, /backendProviderCalls:\s*"disabled"/);
  assert.match(localExecution, /automaticPublication:\s*"disabled"/);
  assert.match(localExecution, /commerceMutation:\s*"approval-gated"/);
});
