import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const browser = readFileSync("web/kairos-dashboard/scripts/executive-os-live-details.js", "utf8");
const executive = readFileSync("web/kairos-dashboard/scripts/executive-os.js", "utf8");
const safari = readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");
const legacy = readFileSync("web/kairos-dashboard/scripts/legacy-runtime-loader.js", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

test("the production Worker activates the operational execution bridge", () => {
  assert.match(wrangler, /main = "src\/kairos-production-entry-operational-execution-v1\.js"/);
  assert.match(entry, /KAIROS_OPERATIONAL_EXECUTION_BUILD/);
  assert.match(entry, /getAgentByName/);
  assert.match(entry, /KAIROS_PROJECT_AGENT/);
  assert.match(entry, /KAIROS_PROJECT_WORKFLOW/);
  assert.match(entry, /KAIROS_MANUSCRIPT_WORKFLOW/);
});

test("objective submission launches the persistent project Agent and foundation Workflow", () => {
  assert.match(entry, /path === "\/api\/hub\/run"/);
  assert.match(entry, /bootstrapProject/);
  assert.match(entry, /startFoundationWorkflow/);
  assert.match(entry, /advanceToApproval/);
  assert.match(entry, /foundation_approval_required/);
  assert.doesNotMatch(entry, /automaticPublicationAllowed:\s*true/);
  assert.doesNotMatch(entry, /commerceMutationAllowed:\s*true/);
});

test("foundation approval generates and verifies an authoritative source", () => {
  assert.match(entry, /approveFoundationWorkflow/);
  assert.match(entry, /createAndStoreAuthoritativeSource/);
  assert.match(entry, /handleKairosAPI/);
  assert.match(entry, /mode:\s*"draft"/);
  assert.match(entry, /\/source-text/);
  assert.match(entry, /authoritative_source/);
  assert.match(entry, /status:\s*"verified"/);
});

test("production starts only through an explicit workflow action", () => {
  assert.match(entry, /start-production/);
  assert.match(entry, /PRODUCTION_SOURCE_REQUIRED/);
  assert.match(entry, /PRODUCTION_APPROVAL_REQUIRED/);
  assert.match(entry, /startManuscriptGenerationWorkflow/);
  assert.match(entry, /execution_started/);
});

test("workflow projection exposes real operational actions", () => {
  assert.match(entry, /canResume/);
  assert.match(entry, /canApprove/);
  assert.match(entry, /canReject/);
  assert.match(entry, /canStartProduction/);
  assert.match(entry, /pendingApproval/);
  assert.match(entry, /manuscriptWorkflow/);
});

test("the Executive OS renders and invokes governed workflow controls", () => {
  assert.match(browser, /Approve foundation/);
  assert.match(browser, /Start production/);
  assert.match(browser, /Request revision/);
  assert.match(browser, /Resume workflow/);
  assert.match(browser, /\/api\/workflows\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(browser, /kairos:workflow:changed/);
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
  assert.match(index, /safari-manuscript-intake-compat\.js\?v=safari-intake-fix-20260729-9-observer-hotfix-1/);
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

test("the normal page is an isolated Executive OS boot", () => {
  assert.match(index, /kairos-executive-clean-boot-20260729-1/);
  assert.match(index, /legacy-runtime-loader\.js\?v=legacy-isolated-20260729-1/);
  assert.doesNotMatch(index, /command-hub\.js/);
  assert.doesNotMatch(index, /manuscript-studio\.js/);
  assert.doesNotMatch(index, /objective-controller-v2\.js/);
  assert.match(safari, /ADVANCED_MODE/);
  assert.match(safari, /if \(ADVANCED_MODE\)/);
  assert.match(executive, /openAdvancedWorkspace/);
  assert.match(executive, /searchParams\.set\("mode", "advanced"\)/);
});

test("advanced operations preserve the complete legacy runtime behind explicit navigation", () => {
  assert.match(legacy, /advancedMode/);
  assert.match(legacy, /if \(advancedMode\) loadLegacyRuntime\(\)/);
  assert.match(legacy, /command-hub\.js/);
  assert.match(legacy, /command-center-governance\.js/);
  assert.match(legacy, /manuscript-studio\.js/);
  assert.match(legacy, /manuscript-project-setup\.js/);
  assert.match(legacy, /production-workspace-controller\.js/);
  assert.match(legacy, /shopify-page-compiler\.js/);
  assert.match(legacy, /data-kairos-persistent-return/);
  assert.match(legacy, /kairos:legacy-runtime:ready/);
});

test("operational readiness is a non-mutating deployment gate", () => {
  assert.match(entry, /\/api\/operational-readiness/);
  assert.match(entry, /objectiveSubmission/);
  assert.match(entry, /sourceGeneration/);
  assert.match(entry, /productionExecution/);
  assert.match(entry, /approvalPolicy:\s*"explicit"/);
});
