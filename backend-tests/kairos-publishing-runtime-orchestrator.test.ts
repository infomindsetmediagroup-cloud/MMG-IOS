import { describe, expect, it } from "vitest";
import { createKairosRuntimeProject, transitionKairosRuntimeProject } from "../cloudflare/mmg-ios/src/kairos-runtime-project-v1.js";
import { analyzePublishingObjective, applyPublishingObjectiveAnalysis, queueApprovedPublishingProject, startQueuedPublishingProject } from "../cloudflare/mmg-ios/src/kairos-publishing-runtime-orchestrator-v1.js";
import { readFileSync } from "node:fs";

const store = readFileSync("cloudflare/mmg-ios/src/kairos-runtime-project-store-v1.js", "utf8");

describe("Kairos publishing runtime orchestrator", () => {
  it("classifies objectives and produces bounded publishing plans", () => {
    const project = createKairosRuntimeProject({ projectType: "guide" });
    const objective = analyzePublishingObjective(project, { summary: "Create a practical creator guide", targetLength: 22000, audience: "Independent creators" });
    expect(objective.classification).toBe("guide");
    expect(objective.complexity).toBe("medium");
    expect(objective.deliverableTypes).toContain("formatted_pdf");
    expect(objective.workflow).toContain("approval_gate");
    expect(objective.approved).toBe(false);
  });

  it("blocks analysis when required publishing assets are missing", () => {
    const intake = createKairosRuntimeProject({ state: "objective_analysis", objective: { summary: "Create a book" } });
    const blocked = applyPublishingObjectiveAnalysis(intake, { summary: "Create a book" });
    expect(blocked.state).toBe("blocked");
    expect(blocked.blockedReason).toMatch(/source_manuscript/);
    expect(blocked.events.at(-1)?.type).toBe("blocked");
  });

  it("opens planning when required assets are present", () => {
    const intake = createKairosRuntimeProject({ state: "objective_analysis", assets: [{ type: "source_manuscript", status: "validated" }, { type: "brand_guidelines", status: "received" }] });
    const planned = applyPublishingObjectiveAnalysis(intake, { summary: "Create a professional book" });
    expect(planned.state).toBe("planning");
    expect(planned.progress.percent).toBe(28);
    expect(planned.events.at(-1)?.type).toBe("objective_analyzed");
  });

  it("requires approval and explicit retry authorization before queueing", () => {
    const awaiting = createKairosRuntimeProject({ state: "awaiting_approval" });
    expect(() => queueApprovedPublishingProject(awaiting)).toThrow(/approval/i);
    const approved = createKairosRuntimeProject({ state: "awaiting_approval", approvals: [{ required: true, status: "approved" }] });
    const queued = queueApprovedPublishingProject(approved);
    expect(queued.state).toBe("queued");
    expect(queued.queue.status).toBe("queued");
    const failed = createKairosRuntimeProject({ state: "failed", approvals: [{ required: true, status: "approved" }] });
    expect(() => queueApprovedPublishingProject(failed)).toThrow(/retry authorization/i);
  });

  it("starts only queued projects and preserves execution separation", () => {
    const approved = createKairosRuntimeProject({ state: "awaiting_approval", approvals: [{ required: true, status: "approved" }] });
    const running = startQueuedPublishingProject(queueApprovedPublishingProject(approved));
    expect(running.state).toBe("executing");
    expect(running.queue.status).toBe("running");
    expect(running.deploymentExecutionAllowed).toBe(false);
    expect(running.commerceMutationAllowed).toBe(false);
    expect(running.externalPublicationAllowed).toBe(false);
  });

  it("registers authenticated analyze, queue, and start actions", () => {
    expect(store).toContain("(analyze|queue|start)");
    expect(store).toContain('input.operation === "analyze"');
    expect(store).toContain('input.operation === "queue"');
    expect(store).toContain('input.operation === "start"');
    expect(store).toContain("Authenticated Kairos runtime access is required");
  });
});
