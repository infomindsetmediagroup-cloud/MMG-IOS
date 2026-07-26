import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controller = readFileSync("web/kairos-dashboard/scripts/objective-controller-v2.js", "utf8");
const objectiveIntegration = readFileSync("cloudflare/mmg-ios/src/kairos-tool-objective-integration-v1.js", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos dashboard operator controls", () => {
  it("continues an approval only through the governed continuation endpoint", () => {
    expect(controller).toContain('fetch("/api/kairos/tools/continue"');
    expect(controller).toContain("confirmation: action.confirmationRequired");
    expect(controller).toContain('credentials: "include"');
  });

  it("renders exact target, approved changes, verification, and rollback status", () => {
    expect(controller).toContain("Approved changes");
    expect(controller).toContain("Post-mutation verification");
    expect(controller).toContain("Review rollback plan");
    expect(controller).toContain("Rollback is not automatic");
  });

  it("uses the runtime executor-availability contract rather than inferring capability", () => {
    expect(controller).toContain("action.executorAvailable === true");
    expect(objectiveIntegration).toContain("CONNECTED_MUTATION_EXECUTORS");
    expect(objectiveIntegration).toContain('continuationStatus: executorAvailable ? "ready_for_explicit_confirmation"');
    expect(objectiveIntegration).toContain("arguments: validation.arguments");
  });

  it("loads the production-readiness dashboard build", () => {
    expect(index).toContain("kairos-command-hub-production-readiness-20260725-11");
    expect(index).toContain("objective-controller-v2.js?v=production-readiness-20260725-5");
  });
});
