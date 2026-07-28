import { describe, expect, it } from "vitest";
import { createKairosCustomerRuntimeProjection } from "../cloudflare/mmg-ios/src/kairos-customer-runtime-projection-v1.js";

describe("Kairos customer runtime projection", () => {
  it("projects customer-safe project progress", () => {
    const projection = createKairosCustomerRuntimeProjection({
      projectId: "kproject_1",
      customerId: "customer_1",
      title: "Publishing project",
      state: "executing",
      progress: { percent: 55, stage: "generation" },
      events: [{ type: "execution_started", state: "executing", summary: "Production started." }],
    }, { customerId: "customer_1" });
    expect(projection.statusLabel).toBe("Production in progress");
    expect(projection.progress.percent).toBe(55);
    expect(projection.timeline).toHaveLength(1);
    expect(projection.customerMutationAllowed).toBe(false);
  });

  it("rejects cross-customer projection", () => {
    expect(() => createKairosCustomerRuntimeProjection({ projectId: "kproject_1", customerId: "customer_1" }, { customerId: "customer_2" })).toThrow(/does not belong/i);
  });

  it("exposes only approved or packaged deliverables", () => {
    const projection = createKairosCustomerRuntimeProjection({
      projectId: "kproject_1",
      customerId: "customer_1",
      deliverables: [
        { deliverableId: "d1", type: "pdf", status: "draft", approved: false },
        { deliverableId: "d2", type: "epub", status: "packaged", approved: false },
      ],
    }, { customerId: "customer_1" });
    expect(projection.deliverables.map((item) => item.deliverableId)).toEqual(["d2"]);
  });

  it("derives explicit customer next actions", () => {
    const approval = createKairosCustomerRuntimeProjection({ projectId: "kproject_1", customerId: "customer_1", state: "awaiting_approval" }, { customerId: "customer_1" });
    expect(approval.nextAction?.type).toBe("review_approval");
    const delivered = createKairosCustomerRuntimeProjection({ projectId: "kproject_2", customerId: "customer_1", state: "follow_up" }, { customerId: "customer_1" });
    expect(delivered.nextAction?.type).toBe("download_deliverables");
  });
});
