import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const browser = readFileSync("web/kairos-dashboard/scripts/executive-os-live-details.js", "utf8");
const executive = readFileSync("web/kairos-dashboard/scripts/executive-os.js", "utf8");
const safari = readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");
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
  assert.match(safari, /executive-os-live-details\.js\?v=20260729-3/);
});

test("Safari API requests cannot leave the dashboard refreshing forever", () => {
  assert.match(safari, /installGovernedFetchTimeout/);
  assert.match(safari, /API_GET_TIMEOUT_MS = 12000/);
  assert.match(safari, /API_MUTATION_TIMEOUT_MS = 45000/);
  assert.match(safari, /Promise\.race/);
  assert.match(safari, /AbortController/);
  assert.match(safari, /TimeoutError/);
  assert.match(safari, /executive-os\.js\?v=browser-finish-20260729-4/);
  assert.match(index, /safari-manuscript-intake-compat\.js\?v=safari-intake-fix-20260729-8/);
});

test("the Executive OS core always releases its loading state", () => {
  assert.match(executive, /API_GET_TIMEOUT_MS = 12000/);
  assert.match(executive, /API_MUTATION_TIMEOUT_MS = 45000/);
  assert.match(executive, /Promise\.race/);
  assert.match(executive, /finally\s*\{[\s\S]*state\.loading = false/);
  assert.match(executive, /root\.setAttribute\("aria-busy", "false"\)/);
  assert.match(executive, /renderEmergencyRecovery/);
  assert.match(executive, /data-hard-reload/);
});

test("operational readiness is a non-mutating deployment gate", () => {
  assert.match(entry, /\/api\/operational-readiness/);
  assert.match(entry, /objectiveSubmission/);
  assert.match(entry, /sourceGeneration/);
  assert.match(entry, /productionExecution/);
  assert.match(entry, /approvalPolicy:\s*"explicit"/);
});
