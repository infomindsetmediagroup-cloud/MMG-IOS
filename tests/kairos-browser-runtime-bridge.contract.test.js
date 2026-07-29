import { describe, expect, it } from "vitest";
import fs from "node:fs";

const entry = fs.readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-revenue-dashboard-v1.js", "utf8");
const deployment = fs.readFileSync(".github/workflows/deploy-sprint-44-revenue-storage.yml", "utf8");

describe("Kairos browser runtime bridge", () => {
  it("mounts the canonical runtime project store on the active Durable Object", () => {
    expect(entry).toContain("handleKairosRuntimeProjectObjectRequest");
    expect(entry).toContain("runtimeProjectResponse");
    expect(entry).toContain("/registry/kairos-runtime-projects");
  });

  it("serves stable browser health and workflow compatibility routes", () => {
    expect(entry).toContain('path === "/api/health"');
    expect(entry).toContain('path === "/api/workflows"');
    expect(entry).toContain('canonicalURL.pathname = "/api/kairos/runtime/health"');
    expect(entry).toContain('operation: "list"');
    expect(entry).toContain('status: "ready"');
    expect(entry).toContain('status: "degraded"');
    expect(entry).toContain("workflows: projects.map(mapRuntimeProject)");
  });

  it("starts durable governed work from the Executive OS", () => {
    expect(entry).toContain('path === "/api/hub/run"');
    expect(entry).toContain('operation: "create"');
    expect(entry).toContain('projectType: action === "objective" ? "digital_asset_project" : action');
    expect(entry).toContain('state: "intake"');
    expect(entry).toContain('automaticPublicationAllowed: false');
  });

  it("projects progress, tasks, assets, deliverables, blockers, and next actions", () => {
    for (const marker of [
      "progressPercent",
      "completedTasks",
      "taskCount",
      "blockedReason",
      "nextAction",
      "tasks: events.map(mapRuntimeEvent)",
      "assets: assets.map(mapRuntimeAsset)",
      "deliverables: deliverables.map(mapRuntimeDeliverable)",
    ]) expect(entry).toContain(marker);
  });

  it("does not grant automatic publication or commerce authority", () => {
    expect(entry).toContain('"X-Kairos-Automatic-Publication", "disabled"');
    expect(entry).toContain("automaticPublicationAllowed: false");
    expect(entry).not.toContain("publishProductLive(");
    expect(entry).not.toContain("shopifyMutation(");
  });

  it("requires production verification of health and workflow endpoints", () => {
    expect(deployment).toContain("/api/health?release=");
    expect(deployment).toContain("/api/workflows?release=");
    expect(deployment).toContain("health_status");
    expect(deployment).toContain("workflows_status");
    expect(deployment).toContain("Kairos browser and runtime deployed");
  });
});
