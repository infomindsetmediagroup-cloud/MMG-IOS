import { describe, expect, it, vi } from "vitest";
import { executeFirstRevenueRunStoreAction } from "../cloudflare/mmg-ios/src/kairos-first-revenue-run-store-v1.js";
import { handleFirstRevenueRunAPI, handleFirstRevenueRunObjectRequest } from "../cloudflare/mmg-ios/src/kairos-first-revenue-run-api-v1.js";

function state() {
  let records = [];
  return { storage: { get: vi.fn(async () => records), put: vi.fn(async (_key, value) => { records = value; }) } };
}

describe("Kairos first revenue run store and API", () => {
  it("persists the canonical run and advances stages in order", async () => {
    const durable = state();
    const started = await executeFirstRevenueRunStoreAction(durable, "start", { confirmation: "START FIRST REVENUE RUN", operatorIdentityHash: "kid_operator" });
    expect(started.run.status).toBe("planned_awaiting_operator_execution");
    const advanced = await executeFirstRevenueRunStoreAction(durable, "complete-stage", { runId: started.run.runId, stageId: "create-product", operatorIdentityHash: "kid_operator" });
    expect(advanced.run.currentStage).toBe("plan-production");
    expect(advanced.run.completedStageIds).toEqual(["create-product"]);
    expect(advanced.run.automaticPublicationAllowed).toBe(false);
  });

  it("blocks duplicate active runs and out-of-order completion", async () => {
    const durable = state();
    const started = await executeFirstRevenueRunStoreAction(durable, "start", { confirmation: "START FIRST REVENUE RUN" });
    await expect(executeFirstRevenueRunStoreAction(durable, "start", { confirmation: "START FIRST REVENUE RUN" })).rejects.toThrow(/active/i);
    await expect(executeFirstRevenueRunStoreAction(durable, "complete-stage", { runId: started.run.runId, stageId: "execute-content" })).rejects.toThrow(/out of order/i);
  });

  it("requires operator identity for approval-gated stages", async () => {
    const durable = state();
    const started = await executeFirstRevenueRunStoreAction(durable, "start", { confirmation: "START FIRST REVENUE RUN" });
    for (const stageId of ["create-product", "plan-production", "execute-content", "execute-visuals"]) {
      await executeFirstRevenueRunStoreAction(durable, "complete-stage", { runId: started.run.runId, stageId });
    }
    await expect(executeFirstRevenueRunStoreAction(durable, "complete-stage", { runId: started.run.runId, stageId: "editorial-qa" })).rejects.toThrow(/approval identity/i);
  });

  it("authenticates external API requests and forwards to the canonical Durable Object", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } }));
    const env = { KAIROS_API_ACCESS_TOKEN: "token", KAIROS_PROJECTS: { idFromName: vi.fn(() => "id"), get: vi.fn(() => ({ fetch })) } };
    const unauthorized = await handleFirstRevenueRunAPI(new Request("https://example.com/api/kairos/revenue/first-run", { method: "GET" }), env);
    expect(unauthorized?.status).toBe(401);
    const response = await handleFirstRevenueRunAPI(new Request("https://example.com/api/kairos/revenue/first-run", { method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "START FIRST REVENUE RUN" }) }), env);
    expect(response?.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("serves internal Durable Object actions without granting publication authority", async () => {
    const durable = state();
    const response = await handleFirstRevenueRunObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-first-revenue-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", input: { confirmation: "START FIRST REVENUE RUN" } }) }));
    const body = await response?.json();
    expect(body.run.directStorefrontActivationAllowed).toBe(false);
    expect(response?.headers.get("X-Kairos-First-Revenue-Run-Store")).toBeTruthy();
  });
});
