import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const localEntry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-operational-v1.js", "utf8");
const operationalEntry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const browser = readFileSync("web/kairos-dashboard/scripts/executive-os-live-details.js", "utf8");
const localBridge = readFileSync("web/kairos-dashboard/scripts/executive-os-local-production-bridge.js", "utf8");
const localInference = readFileSync("web/kairos-dashboard/scripts/kairos-local-inference.js", "utf8");
const executive = readFileSync("web/kairos-dashboard/scripts/executive-os.js", "utf8");
const safari = readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");
const docxHotfix = readFileSync("web/kairos-dashboard/scripts/manuscript-docx-upload-hotfix.js", "utf8");
const legacy = readFileSync("web/kairos-dashboard/scripts/legacy-runtime-loader.js", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

test("the production Worker activates the local-only operational entry", () => {
  assert.match(wrangler, /main = "src\/kairos-production-entry-local-operational-v1\.js"/);
  assert.match(localEntry, /KAIROS_LOCAL_OPERATIONAL_BUILD/);
  assert.match(localEntry, /browser-webgpu/);
  assert.match(localEntry, /openAICallAllowed: false/);
  assert.match(localEntry, /externalPaidAPIUsed: false/);
  assert.doesNotMatch(localEntry, /handleKairosAPI/);
  assert.doesNotMatch(localEntry, /startManuscriptGenerationWorkflow/);
});

test("production configuration disables paid provider execution", () => {
  assert.match(wrangler, /KAIROS_MODEL_PROVIDER = "browser-webgpu"/);
  assert.match(wrangler, /KAIROS_MODEL_ENDPOINT = ""/);
  assert.match(wrangler, /KAIROS_LOCAL_INFERENCE_ENABLED = "true"/);
  assert.match(wrangler, /KAIROS_NO_COST_MODE = "true"/);
  assert.match(wrangler, /KAIROS_MANUSCRIPT_START_MODE = "local-browser"/);
  assert.doesNotMatch(wrangler, /KAIROS_MODEL_PROVIDER = "openai"/);
  assert.doesNotMatch(wrangler, /api\.openai\.com/);
  assert.doesNotMatch(wrangler, /KAIROS_OPENAI_MODEL/);
});

test("objective submission still launches the persistent project Agent and foundation Workflow", () => {
  assert.match(operationalEntry, /path === "\/api\/hub\/run"/);
  assert.match(operationalEntry, /bootstrapProject/);
  assert.match(operationalEntry, /startFoundationWorkflow/);
  assert.match(operationalEntry, /advanceToApproval/);
  assert.doesNotMatch(localEntry, /automaticPublicationAllowed:\s*true/);
  assert.doesNotMatch(localEntry, /commerceMutationAllowed:\s*true/);
});

test("foundation approval defers source generation to the local browser", () => {
  assert.match(localEntry, /approveFoundationWorkflow/);
  assert.match(localEntry, /sourceRequired/);
  assert.match(localEntry, /prepare-source/);
  assert.match(localEntry, /local_source_required/);
  assert.match(localEntry, /authoritative_source/);
  assert.match(localEntry, /locally generated authoritative source/);
});

test("production completion verifies browser WebGPU evidence before runtime reconciliation", () => {
  assert.match(localEntry, /\/local-inference/);
  assert.match(localEntry, /LOCAL_INFERENCE_VERIFICATION_FAILED/);
  assert.match(localEntry, /locally_generated_manuscript/);
  assert.match(localEntry, /execution_completed/);
  assert.match(localEntry, /quality_review/);
  assert.doesNotMatch(localEntry, /generateManuscriptExpansion/);
});

test("the browser bridge runs source and manuscript generation locally", () => {
  assert.match(localBridge, /approveAndGenerateSource/);
  assert.match(localBridge, /generateAndReconcileProduction/);
  assert.match(localBridge, /KairosLocalInference/);
  assert.match(localBridge, /generateSource/);
  assert.match(localBridge, /local\.run/);
  assert.match(localBridge, /prepare-source/);
  assert.match(localBridge, /browser-webgpu/);
});

test("the local inference engine creates both the authoritative source and expanded manuscript", () => {
  assert.match(localInference, /generateSource/);
  assert.match(localInference, /SOURCE_TARGET_WORDS = 1500/);
  assert.match(localInference, /\/source-text/);
  assert.match(localInference, /STORE LOCAL INFERENCE/);
  assert.match(localInference, /\/local-inference/);
  assert.match(localInference, /provider: "browser-webgpu"/);
  assert.match(localInference, /externalPaidAPIUsed: false/);
  assert.doesNotMatch(localInference, /api\.openai\.com/);
});

test("the Executive OS loads the local production bridge in normal mode", () => {
  assert.match(safari, /activateLocalProductionBridge/);
  assert.match(safari, /executive-os-local-production-bridge\.js\?v=20260730-1/);
  assert.match(safari, /safari-manuscript-intake-compat-20260730-12-local-production/);
  assert.match(safari, /executive-os-live-details\.js\?v=20260729-4/);
  assert.match(browser, /Approve foundation/);
  assert.match(browser, /Start production/);
});

test("live execution detail cannot recursively trigger its own observer", () => {
  assert.match(browser, /shellObserver\?\.disconnect\(\)/);
  assert.match(browser, /requestAnimationFrame/);
  assert.match(browser, /renderingDetails/);
  assert.match(browser, /reconnectShellObserver/);
});

test("Safari API requests cannot leave the dashboard refreshing forever", () => {
  assert.match(safari, /installGovernedFetchTimeout/);
  assert.match(safari, /API_GET_TIMEOUT_MS = 12000/);
  assert.match(safari, /API_MUTATION_TIMEOUT_MS = 45000/);
  assert.match(safari, /Promise\.race/);
  assert.match(safari, /AbortController/);
  assert.match(index, /safari-manuscript-intake-compat\.js\?v=safari-docx-export-resolver-20260730-1/);
});

test("Safari manuscript checksums preserve the native digest identifier first", () => {
  assert.match(safari, /return await nativeDigest\(algorithm, data\)/);
  assert.match(safari, /const alternate = typeof algorithm === "string"/);
  assert.match(safari, /return await nativeDigest\(alternate, data\)/);
  assert.match(safari, /__kairosDigestIdentifierFallback/);
});

test("Safari DOCX upload resolves the Mammoth named export before Manuscript Studio", () => {
  assert.match(index, /legacy-runtime-loader\.js\?v=legacy-docx-export-resolver-20260730-1/);
  assert.match(legacy, /manuscript-docx-export-resolver-20260730-1/);
  const resolverIndex = legacy.indexOf('"manuscript-docx-upload-hotfix.js"');
  const studioIndex = legacy.indexOf('"manuscript-studio.js"');
  assert.ok(resolverIndex > -1);
  assert.ok(studioIndex > resolverIndex);
  assert.match(docxHotfix, /document\.addEventListener\("change", interceptDocxSelection, true\)/);
  assert.match(docxHotfix, /typeof candidate\?\.extractRawText === "function"/);
});

test("the Executive OS core always releases its refresh state", () => {
  assert.match(executive, /API_GET_TIMEOUT_MS = 12000/);
  assert.match(executive, /API_MUTATION_TIMEOUT_MS = 45000/);
  assert.match(executive, /finally\s*\{[\s\S]*state\.refreshing = false/);
  assert.match(executive, /renderEmergencyRecovery/);
});

test("operational readiness is local, non-mutating, and provider-independent", () => {
  assert.match(localEntry, /\/api\/operational-readiness/);
  assert.match(localEntry, /sourceGeneration: checks\.browserAssets \? "local-browser"/);
  assert.match(localEntry, /productionExecution: checks\.browserAssets \? "local-browser"/);
  assert.match(localEntry, /approvalPolicy: "explicit"/);
  assert.match(localEntry, /X-Kairos-External-Paid-API/);
});
