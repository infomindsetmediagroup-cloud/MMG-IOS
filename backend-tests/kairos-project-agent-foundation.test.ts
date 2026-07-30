import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const agent = readFileSync("cloudflare/mmg-ios/src/kairos-project-agent-v1.js", "utf8");
const workflow = readFileSync("cloudflare/mmg-ios/src/kairos-project-foundation-workflow-v1.js", "utf8");
const api = readFileSync("cloudflare/mmg-ios/src/kairos-project-agent-api-v1.js", "utf8");
const entry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");
const wrangler = readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");

 describe("Kairos persistent project foundation", () => {
  it("binds a name-addressed Agent and Cloudflare Workflow", () => {
    expect(wrangler).toContain('name = "KAIROS_PROJECT_AGENT"');
    expect(wrangler).toContain('class_name = "KairosProjectAgent"');
    expect(wrangler).toContain('binding = "KAIROS_PROJECT_WORKFLOW"');
    expect(wrangler).toContain('class_name = "KairosProjectFoundationWorkflow"');
    expect(wrangler).toContain('new_sqlite_classes = ["KairosProjectAgent"]');
    expect(wrangler).toContain('compatibility_flags = ["nodejs_compat"]');
    expect(wrangler).toContain("keep_names = true");
  });

  it("owns project state and durable approval in the backend", () => {
    expect(agent).toContain("extends Agent");
    expect(agent).toContain("this.runWorkflow(");
    expect(agent).toContain("approveWorkflow(instanceId");
    expect(agent).toContain("rejectWorkflow(instanceId");
    expect(agent).toContain("onWorkflowProgress");
    expect(agent).toContain("onWorkflowComplete");
    expect(workflow).toContain("extends AgentWorkflow");
    expect(workflow).toContain("waitForApproval(step");
    expect(workflow).toContain("step.mergeAgentState");
    expect(workflow).toContain("step.reportComplete");
  });

  it("lets Cloudflare generate valid workflow instance IDs", () => {
    expect(agent).not.toMatch(/id:\s*`kairos-project-/);
    expect(agent).not.toMatch(/id:\s*`kairos-manuscript-/);
    expect(agent).toContain('metadata: { projectId, workflowVersion: "project-foundation-v1" }');
    expect(agent).toContain('metadata: { projectId, workflowVersion: "manuscript-generation-v1", approvalType: "START_PRODUCTION_JOB" }');
  });

  it("exposes reconnect-safe state and approval routes without granting Shopify authority", () => {
    expect(api).toContain("getAgentByName(env.KAIROS_PROJECT_AGENT");
    expect(api).toContain('action === "state"');
    expect(api).toContain('action === "workflow/start"');
    expect(api).toContain("approveFoundationWorkflow");
    expect(api).toContain("rejectFoundationWorkflow");
    expect(api).not.toContain("SHOPIFY_ADMIN_ACCESS_TOKEN");
    expect(api).not.toContain("/admin/api/");
    expect(entry).toContain("routeKairosProjectAgentRequest");
    expect(entry).toContain("export { KairosProjectAgent, KairosProjectFoundationWorkflow }");
  });
});
