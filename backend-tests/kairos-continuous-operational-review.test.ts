import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createKairosContinuousOperationalReview, evaluateKairosContinuousOperationalReview } from "../cloudflare/mmg-ios/src/kairos-continuous-operational-review-v1.js";
import { handleKairosContinuousOperationalReviewAPI, handleKairosContinuousOperationalReviewObjectRequest } from "../cloudflare/mmg-ios/src/kairos-continuous-operational-review-store-v1.js";

class MemoryStorage { values = new Map<string, unknown>(); async get(key: string) { return this.values.get(key); } async put(key: string, value: unknown) { this.values.set(key, value); } }
const state = () => ({ storage: new MemoryStorage() } as any);
const internal = (body: unknown) => new Request("https://kairos.internal/registry/kairos-continuous-operational-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const attestedInput = {
  controls: [{ controlId: "kcontrol_runtime", name: "Runtime health", result: "effective", evidenceIds: ["kevt_1"] }],
  attestation: { attested: true, identityHash: "kid_operator", attestedAt: "2026-07-26T21:00:00.000Z", rationale: "Controls reviewed." },
};

describe("Kairos continuous operational review", () => {
  it("creates immutable records without execution authority", () => {
    const record = createKairosContinuousOperationalReview({ reviewId: "koreview_test" });
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticRemediationAllowed).toBe(false);
    expect(record.attestation.executionAuthorityGranted).toBe(false);
  });

  it("attests effective controls and requires improvement for critical findings", () => {
    const record = createKairosContinuousOperationalReview({ reviewId: "koreview_eval" });
    const attested = evaluateKairosContinuousOperationalReview(record, attestedInput);
    expect(attested.state).toBe("attested");
    expect(attested.decision).toBe("attest");
    const improvement = evaluateKairosContinuousOperationalReview(attested, { improvementActions: [{ actionId: "kaction_1", summary: "Repair recovery control", priority: "critical", status: "open" }] });
    expect(improvement.state).toBe("improvement_required");
    expect(improvement.decision).toBe("require_improvement");
  });

  it("persists, lists, reads, evaluates, and exports bounded reviews", async () => {
    const durable = state();
    const createdResponse = await handleKairosContinuousOperationalReviewObjectRequest(durable, internal({ operation: "create", input: { reviewId: "koreview_store", continuityId: "kcontinuity_1" } }));
    expect(createdResponse?.status).toBe(201);
    const evaluatedResponse = await handleKairosContinuousOperationalReviewObjectRequest(durable, internal({ operation: "evaluate", reviewId: "koreview_store", input: attestedInput }));
    expect((await evaluatedResponse!.json() as any).review.state).toBe("attested");
    const listResponse = await handleKairosContinuousOperationalReviewObjectRequest(durable, internal({ operation: "list" }));
    expect((await listResponse!.json() as any).count).toBe(1);
    const readResponse = await handleKairosContinuousOperationalReviewObjectRequest(durable, internal({ operation: "read", reviewId: "koreview_store" }));
    expect((await readResponse!.json() as any).review.continuityId).toBe("kcontinuity_1");
    const exportResponse = await handleKairosContinuousOperationalReviewObjectRequest(durable, internal({ operation: "export" }));
    const exported = await exportResponse!.json() as any;
    expect(exported.exportVersion).toBe("kairos-continuous-operational-review-export-v1");
    expect(exported.deploymentExecutionIncluded).toBe(false);
    expect(exported.rollbackExecutionIncluded).toBe(false);
    expect(exported.retryExecutionIncluded).toBe(false);
    expect(exported.automaticRemediationIncluded).toBe(false);
  });

  it("requires authenticated public API access", async () => {
    const response = await handleKairosContinuousOperationalReviewAPI(new Request("https://example.com/api/kairos/operations/reviews"), {});
    expect(response?.status).toBe(401);
  });

  it("contains no execution routes", async () => {
    const store = await readFile("cloudflare/mmg-ios/src/kairos-continuous-operational-review-store-v1.js", "utf8");
    expect(store).toContain("/api/kairos/operations/reviews");
    expect(store).not.toMatch(/\/deploy|\/rollback|\/retry|\/execute/);
  });
});
