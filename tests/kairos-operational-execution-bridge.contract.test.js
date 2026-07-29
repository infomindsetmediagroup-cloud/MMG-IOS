import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const browser = readFileSync("web/kairos-dashboard/scripts/executive-os-live-details.js", "utf8");
const safari = readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");

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

test("operational readiness is a non-mutating deployment gate", () => {
  assert.match(entry, /\/api\/operational-readiness/);
  assert.match(entry, /objectiveSubmission/);
  assert.match(entry, /sourceGeneration/);
  assert.match(entry, /productionExecution/);
  assert.match(entry, /approvalPolicy:\s*"explicit"/);
});
