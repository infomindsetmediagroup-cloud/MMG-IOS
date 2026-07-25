import { describe, expect, it } from "vitest";
import {
  RuntimeHealthSchema,
  WorkflowStepReceiptSchema,
  classifyProviderFailure,
} from "../packages/kairos-contracts/src/index.js";

describe("Kairos canonical contracts", () => {
  it("classifies provider failures without collapsing them into generic errors", () => {
    expect(classifyProviderFailure(429, "insufficient_quota")).toBe("PROVIDER_QUOTA_EXHAUSTED");
    expect(classifyProviderFailure(401)).toBe("PROVIDER_AUTH_INVALID");
    expect(classifyProviderFailure(403)).toBe("PROVIDER_PERMISSION_DENIED");
    expect(classifyProviderFailure(503)).toBe("PROVIDER_UNAVAILABLE");
  });

  it("accepts an application-ready provider-blocked health state", () => {
    const result = RuntimeHealthSchema.parse({
      application: "ready",
      storage: "ready",
      workflow: "degraded",
      provider: {
        provider: "openai",
        status: "blocked",
        model: "gpt-5-mini",
        reason: "PROVIDER_QUOTA_EXHAUSTED",
        checkedAt: new Date().toISOString(),
      },
      release: {
        build: "test-release",
        contractVersion: "1.0.0",
        deployedAt: null,
      },
      boundaries: {
        shopifyDraftApprovalRequired: true,
        livePublicationApprovalRequired: true,
        directWebsiteMutationAuthorized: false,
        browserInferenceRequired: false,
      },
    });
    expect(result.application).toBe("ready");
    expect(result.provider.status).toBe("blocked");
  });

  it("requires idempotency and audit fields for workflow steps", () => {
    const receipt = WorkflowStepReceiptSchema.parse({
      stepId: "preserve-source",
      workflowVersion: "publishing-v1",
      inputSchemaVersion: "1.0.0",
      status: "completed",
      attempt: 1,
      idempotencyKey: "project-1:preserve-source:v1",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      inputReferences: ["source:original"],
      outputReferences: ["artifact:preserved-source"],
      error: null,
      approvalReceipt: null,
    });
    expect(receipt.idempotencyKey).toContain("preserve-source");
  });
});
