import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const runtime = readFileSync(
  "cloudflare/mmg-ios/src/kairos-production-entry-operational-execution-v1.js",
  "utf8",
);

describe("Kairos operational approval recovery", () => {
  it("synchronizes a completed foundation without re-sending a finite Workflow approval event", () => {
    expect(runtime).toContain(
      'const foundationAlreadyCompleted = foundationStatus === "completed" && !agentState?.pendingApproval;',
    );
    expect(runtime).toContain("if (!foundationAlreadyCompleted) {");
    expect(runtime).toContain("await agent.approveFoundationWorkflow(instanceId");
    expect(runtime).toContain("const source = await createAndStoreAuthoritativeSource");
    expect(runtime).toContain("kairos-operational-execution-20260730-2-approval-recovery");
  });
});
