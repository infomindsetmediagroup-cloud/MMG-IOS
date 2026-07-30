import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const generation = readFileSync("cloudflare/mmg-ios/src/kairos-manuscript-generation-job-v1.js", "utf8");
const workflow = readFileSync("cloudflare/mmg-ios/src/kairos-manuscript-generation-workflow-v1.js", "utf8");
const router = readFileSync("cloudflare/mmg-ios/src/kairos-manuscript-start-router-v1.js", "utf8");
const health = readFileSync("cloudflare/mmg-ios/src/kairos-runtime-health-v1.js", "utf8");
const agent = readFileSync("cloudflare/mmg-ios/src/kairos-project-agent-v1.js", "utf8");
const api = readFileSync("cloudflare/mmg-ios/src/kairos-project-agent-api-v1.js", "utf8");
const canonicalEntry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-canonical-v1.js", "utf8");
const localOnlyEntry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-only-v1.js", "utf8");
const localExecutionEntry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-execution-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const localUI = readFileSync("web/kairos-dashboard/scripts/executive-local-inference.js", "utf8");

describe("Kairos durable manuscript generation migration", () => {
  it("retains durable Workflow bindings while routing active generation through the canonical local firewall", () => {
    expect(wrangler).toContain('main = "src/kairos-production-entry-local-canonical-v1.js"');
    expect(wrangler).toContain('binding = "KAIROS_MANUSCRIPT_WORKFLOW"');
    expect(wrangler).toContain('class_name = "KairosManuscriptGenerationWorkflow"');
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_START_MODE = "local-browser"');
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED = "false"');
    expect(wrangler).toContain('KAIROS_MODEL_PROVIDER = "browser-webgpu"');
    expect(canonicalEntry).toContain("providerBlockedEnv");
    expect(canonicalEntry).toContain('property === "OPENAI_API_KEY"');
    expect(canonicalEntry).toContain('return ""');
    expect(canonicalEntry).toContain("kairos-local-readiness-sentinel-not-a-provider-key");
    expect(canonicalEntry).toContain('X-Kairos-OpenAI-Calls", "disabled"');
    expect(canonicalEntry).not.toContain("handleKairosAPI");
    expect(localOnlyEntry).toContain("export { KairosProject, KairosProjectAgent, KairosProjectFoundationWorkflow, KairosManuscriptGenerationWorkflow }");
    expect(localOnlyEntry).toContain("LEGACY_MANUSCRIPT_GENERATION");
    expect(localOnlyEntry).toContain('code: "LOCAL_INFERENCE_REQUIRED"');
    expect(localExecutionEntry).toContain('mode: "browser-webgpu"');
    expect(localExecutionEntry).toContain('externalPaidAPIUsed: false');
  });

  it("keeps prior durable expansion steps available for persisted workflow continuity", () => {
    expect(workflow).toContain("extends AgentWorkflow");
    expect(workflow).toContain('step.do("initialize-manuscript-generation"');
    expect(workflow).toContain("expand-manuscript-unit-");
    expect(workflow).toContain('step.do("finalize-manuscript-generation"');
    expect(workflow).toContain("step.reportComplete");
    expect(workflow).not.toContain("setAlarm(");
    expect(workflow).not.toContain("JOB_INDEX_KEY");
  });

  it("keeps authoritative source, output, and idempotency state in the project registry", () => {
    expect(generation).toContain("beginManuscriptGenerationWorkflow");
    expect(generation).toContain("executeManuscriptGenerationWorkflowUnit");
    expect(generation).toContain("finalizeManuscriptGenerationWorkflow");
    expect(generation).toContain("workflow-generation");
    expect(generation).toContain('operation === "context"');
    expect(generation).toContain("generation_step_out_of_order");
    expect(generation).toContain("original-text:metadata");
    expect(generation).toContain("outputSha256");
  });

  it("blocks the legacy backend generation route and starts active production from the local bridge", () => {
    expect(localOnlyEntry).toContain("LEGACY_MANUSCRIPT_GENERATION");
    expect(localOnlyEntry).toContain("LOCAL_INFERENCE_REQUIRED");
    expect(localUI).toContain("/start-production");
    expect(localUI).toContain("KairosLocalInference.run");
    expect(localUI).toContain("/complete-production");
    expect(localUI).not.toContain("/generation-job");
  });

  it("retains reconnect-safe Agent state for historical durable workflows", () => {
    expect(router).toContain("readCanonicalManuscriptState");
    expect(router).toContain("registryResponse.status !== 404");
    expect(router).toContain("activeManuscriptWorkflow");
    expect(router).toContain("Durable manuscript Workflow is initializing");
    expect(router).toContain("buildSyntheticJob");
  });

  it("reports historical orchestration state without enabling automatic legacy fallback", () => {
    expect(health).toContain("orchestrationHealth");
    expect(health).toContain("durableManuscriptWorkflow");
    expect(health).toContain("legacyAlarmRollback");
    expect(health).toContain("automaticLegacyFallback: false");
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED = "false"');
  });

  it("preserves the project Agent boundary without granting Shopify authority", () => {
    expect(agent).toContain("KAIROS_MANUSCRIPT_WORKFLOW_BINDING");
    expect(agent).toContain("startManuscriptGenerationWorkflow");
    expect(agent).toContain("activeManuscriptWorkflow");
    expect(api).toContain('action === "manuscript-workflow/start"');
    expect(api).toContain("startManuscriptGenerationWorkflow");
    expect(api).not.toContain("SHOPIFY_ADMIN_ACCESS_TOKEN");
    expect(api).not.toContain("/admin/api/");
    expect(router).not.toContain("SHOPIFY_ADMIN_ACCESS_TOKEN");
    expect(router).not.toContain("/admin/api/");
  });
});
