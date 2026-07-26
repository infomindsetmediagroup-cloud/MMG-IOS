import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const generation = readFileSync("cloudflare/mmg-ios/src/kairos-manuscript-generation-job-v1.js", "utf8");
const workflow = readFileSync("cloudflare/mmg-ios/src/kairos-manuscript-generation-workflow-v1.js", "utf8");
const router = readFileSync("cloudflare/mmg-ios/src/kairos-manuscript-start-router-v1.js", "utf8");
const health = readFileSync("cloudflare/mmg-ios/src/kairos-runtime-health-v1.js", "utf8");
const agent = readFileSync("cloudflare/mmg-ios/src/kairos-project-agent-v1.js", "utf8");
const api = readFileSync("cloudflare/mmg-ios/src/kairos-project-agent-api-v1.js", "utf8");
const entry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const ui = readFileSync("web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", "utf8");

describe("Kairos durable manuscript generation migration", () => {
  it("binds a dedicated Cloudflare Workflow and preserves a controlled rollback path", () => {
    expect(wrangler).toContain('binding = "KAIROS_MANUSCRIPT_WORKFLOW"');
    expect(wrangler).toContain('class_name = "KairosManuscriptGenerationWorkflow"');
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_START_MODE = "workflow"');
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED = "true"');
    expect(entry).toContain("export { KairosManuscriptGenerationWorkflow }");
    expect(entry).toContain("resumeManuscriptGenerationAlarm");
    expect(generation).toContain('executionMode: "legacy-alarm-v1"');
    expect(generation).toContain("KAIROS_MANUSCRIPT_WORKFLOW_VERSION");
  });

  it("moves new expansion units into versioned durable steps", () => {
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

  it("makes the stable generation-job POST route start the Agent Workflow by default", () => {
    expect(router).toContain("handleCanonicalManuscriptStart");
    expect(router).toContain("getAgentByName(env.KAIROS_PROJECT_AGENT");
    expect(router).toContain("startManuscriptGenerationWorkflow");
    expect(router).toContain("KAIROS_MANUSCRIPT_START_MODE_WORKFLOW");
    expect(router).toContain("KAIROS_MANUSCRIPT_START_MODE_LEGACY");
    expect(router).toContain("Kairos will not silently fall back");
    const canonicalCall = entry.indexOf("const canonicalStart = await handleCanonicalManuscriptStart");
    const compatibilityCall = entry.indexOf("const generation = await handleManuscriptGeneration(observedRequest.clone()");
    expect(canonicalCall).toBeGreaterThan(-1);
    expect(compatibilityCall).toBeGreaterThan(-1);
    expect(canonicalCall).toBeLessThan(compatibilityCall);
    expect(ui).toContain("/generation-job");
  });

  it("bridges cold-start polling through reconnect-safe Agent state", () => {
    expect(router).toContain("readCanonicalManuscriptState");
    expect(router).toContain("registryResponse.status !== 404");
    expect(router).toContain("activeManuscriptWorkflow");
    expect(router).toContain("Durable manuscript Workflow is initializing");
    expect(router).toContain("buildSyntheticJob");
  });

  it("reports the selected orchestration path and prohibits automatic legacy fallback", () => {
    expect(health).toContain("orchestrationHealth");
    expect(health).toContain("durableManuscriptWorkflow");
    expect(health).toContain("legacyAlarmRollback");
    expect(health).toContain("automaticLegacyFallback: false");
  });

  it("starts and reconnects through the persistent project Agent without granting Shopify authority", () => {
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
