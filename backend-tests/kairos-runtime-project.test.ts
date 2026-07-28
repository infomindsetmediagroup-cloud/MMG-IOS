import { describe, expect, it } from "vitest";
import { createKairosRuntimeProject, transitionKairosRuntimeProject } from "../cloudflare/mmg-ios/src/kairos-runtime-project-v1.js";

describe("Kairos runtime project", () => {
  it("creates an immutable publishing runtime project with execution boundaries", () => {
    const project = createKairosRuntimeProject({ title: "Publishing project" });
    expect(project.projectId).toMatch(/^kproject_/);
    expect(project.state).toBe("initialized");
    expect(project.department).toBe("publishing");
    expect(project.deploymentExecutionAllowed).toBe(false);
    expect(project.commerceMutationAllowed).toBe(false);
    expect(project.externalPublicationAllowed).toBe(false);
    expect(Object.isFrozen(project)).toBe(true);
  });

  it("enforces deterministic lifecycle transitions", () => {
    const initialized = createKairosRuntimeProject({});
    const intake = transitionKairosRuntimeProject(initialized, { state: "intake", event: { type: "project_created", state: "intake" } });
    expect(intake.state).toBe("intake");
    expect(intake.events[0].type).toBe("project_created");
    expect(() => transitionKairosRuntimeProject(intake, { state: "delivery" })).toThrow(/not allowed/);
  });

  it("requires explicit approval before queueing or execution", () => {
    const planning = createKairosRuntimeProject({ state: "awaiting_approval" });
    expect(() => transitionKairosRuntimeProject(planning, { state: "queued" })).toThrow(/approval/i);
    const queued = transitionKairosRuntimeProject(planning, {
      state: "queued",
      approvals: [{ gate: "production_plan", required: true, status: "approved", identityHash: "kid_test" }],
      event: { type: "execution_queued", state: "queued" },
    });
    expect(queued.state).toBe("queued");
    expect(queued.approvals[0].executionAuthorityGranted).toBe(false);
  });

  it("bounds assets, events, and deliverables", () => {
    const project = createKairosRuntimeProject({
      assets: Array.from({ length: 600 }, (_, index) => ({ type: `asset-${index}` })),
      deliverables: Array.from({ length: 400 }, (_, index) => ({ type: `deliverable-${index}` })),
      events: Array.from({ length: 550 }, () => ({ type: "asset_received", state: "intake" })),
    });
    expect(project.assets).toHaveLength(500);
    expect(project.deliverables).toHaveLength(300);
    expect(project.events).toHaveLength(500);
  });
});
