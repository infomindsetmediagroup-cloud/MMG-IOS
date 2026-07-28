import { describe, expect, it } from "vitest";
import { createKairosRuntimeProject } from "../cloudflare/mmg-ios/src/kairos-runtime-project-v1.js";
import { applyKairosPublishingRuntimeAction } from "../cloudflare/mmg-ios/src/kairos-publishing-runtime-actions-v1.js";

describe("Kairos publishing runtime actions", () => {
  it("moves quality review to packaging on explicit QA pass", () => {
    const project = createKairosRuntimeProject({ state: "quality_review" });
    const next = applyKairosPublishingRuntimeAction(project, "qa-pass", { evidenceIds: ["evidence_1"] });
    expect(next.state).toBe("packaging");
    expect(next.events.at(-1)?.type).toBe("qa_passed");
  });

  it("returns failed QA to execution", () => {
    const project = createKairosRuntimeProject({ state: "quality_review" });
    const next = applyKairosPublishingRuntimeAction(project, "qa-fail", {});
    expect(next.state).toBe("executing");
    expect(next.events.at(-1)?.type).toBe("qa_failed");
  });

  it("requires deliverables before packaging", () => {
    const project = createKairosRuntimeProject({ state: "packaging" });
    expect(() => applyKairosPublishingRuntimeAction(project, "package", {})).toThrow(/deliverable/i);
  });

  it("requires explicit approval before customer delivery", () => {
    const project = createKairosRuntimeProject({ state: "delivery", deliverables: [{ type: "pdf", status: "packaged" }] });
    expect(() => applyKairosPublishingRuntimeAction(project, "deliver", {})).toThrow(/approval/i);
    const delivered = applyKairosPublishingRuntimeAction(project, "deliver", { deliveryApproved: true });
    expect(delivered.state).toBe("follow_up");
    expect(delivered.externalPublicationAllowed).toBe(false);
  });
});