import { describe, expect, it } from "vitest";
import { createKairosRuntimeProject } from "../cloudflare/mmg-ios/src/kairos-runtime-project-v1.js";
import { applyKairosCustomerApproval, recordKairosCustomerNotification } from "../cloudflare/mmg-ios/src/kairos-customer-runtime-actions-v1.js";

describe("Kairos customer runtime actions", () => {
  it("records an explicit customer approval without granting execution authority", () => {
    const project = createKairosRuntimeProject({ state: "awaiting_approval", customerId: "customer_1" });
    const next = applyKairosCustomerApproval(project, { decision: "approved", customerIdentityHash: "kcid_test" });
    expect(next.state).toBe("planning");
    expect(next.approvals.at(-1)?.status).toBe("approved");
    expect(next.approvals.at(-1)?.executionAuthorityGranted).toBe(false);
  });

  it("records requested changes", () => {
    const project = createKairosRuntimeProject({ state: "awaiting_approval", customerId: "customer_1" });
    const next = applyKairosCustomerApproval(project, { decision: "changes_requested", rationale: "Revise scope" });
    expect(next.approvals.at(-1)?.status).toBe("changes_requested");
    expect(next.events.at(-1)?.type).toBe("approval_changes_requested");
  });

  it("bounds customer notification records", () => {
    let project:any = createKairosRuntimeProject({ customerId: "customer_1" });
    for (let index = 0; index < 120; index += 1) project = recordKairosCustomerNotification(project, { type: "project_updated" });
    expect(project.notifications).toHaveLength(100);
    expect(project.notifications.at(-1)?.channel).toBe("portal");
  });
});
