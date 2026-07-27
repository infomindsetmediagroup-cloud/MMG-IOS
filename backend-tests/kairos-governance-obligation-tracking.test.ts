import { describe, expect, it } from "vitest";
import { createKairosGovernanceObligation, evaluateKairosGovernanceObligation } from "../cloudflare/mmg-ios/src/kairos-governance-obligation-tracking-v1.js";
import { handleKairosGovernanceObligationAPI, handleKairosGovernanceObligationObjectRequest } from "../cloudflare/mmg-ios/src/kairos-governance-obligation-store-v1.js";
import productionRuntime from "../cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js";

function state() {
  const values = new Map<string, unknown>();
  return { storage: { get: async (key: string) => values.get(key), put: async (key: string, value: unknown) => values.set(key, value) } } as any;
}

describe("Kairos governance obligation tracking", () => {
  it("creates immutable bounded records without execution authority", () => {
    const record = createKairosGovernanceObligation({ title: "Refresh evidence", ownerRole: "Control owner" });
    expect(record.obligationId.startsWith("kobligation_")).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticRemediationAllowed).toBe(false);
  });

  it("escalates overdue obligations", () => {
    const record = createKairosGovernanceObligation({ state: "active", schedule: { dueAt: "2020-01-01T00:00:00Z" }, evidence: { state: "current" } });
    const evaluated = evaluateKairosGovernanceObligation(record);
    expect(evaluated.state).toBe("overdue");
    expect(evaluated.decision).toBe("escalate");
  });

  it("escalates stale evidence and fulfills current evidence explicitly", () => {
    const record = createKairosGovernanceObligation({ state: "active", schedule: { dueAt: "2099-01-01T00:00:00Z" }, evidence: { state: "stale" } });
    expect(evaluateKairosGovernanceObligation(record).state).toBe("at_risk");
    const fulfilled = evaluateKairosGovernanceObligation(record, { evidence: { state: "current" }, fulfill: true });
    expect(fulfilled.state).toBe("fulfilled");
    expect(fulfilled.decision).toBe("fulfill");
  });

  it("persists, lists, evaluates, and exports bounded records", async () => {
    const durable = state();
    const created = await handleKairosGovernanceObligationObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-obligations", { method: "POST", body: JSON.stringify({ operation: "create", input: { obligationId: "kobligation_test", title: "Test", schedule: { dueAt: "2099-01-01T00:00:00Z" } } }) }));
    expect(created?.status).toBe(201);
    const listed = await handleKairosGovernanceObligationObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-obligations", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listed!.json()).count).toBe(1);
    const evaluated = await handleKairosGovernanceObligationObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-obligations", { method: "POST", body: JSON.stringify({ operation: "evaluate", obligationId: "kobligation_test", input: { evidence: { state: "current" }, fulfill: true } }) }));
    expect((await evaluated!.json()).obligation.state).toBe("fulfilled");
    const exported = await handleKairosGovernanceObligationObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-obligations", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const payload = await exported!.json();
    expect(payload.deploymentExecutionIncluded).toBe(false);
    expect(payload.automaticRemediationIncluded).toBe(false);
  });

  it("requires authentication on public APIs", async () => {
    const response = await handleKairosGovernanceObligationAPI(new Request("https://example.com/api/kairos/operations/obligations"), {} as any);
    expect(response?.status).toBe(401);
  });

  it("is registered in the canonical production entry", async () => {
    const response = await productionRuntime.fetch(new Request("https://example.com/api/kairos/operations/obligations"), {} as any, {} as any);
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Kairos-Governance-Obligation-Tracking")).toContain("kairos-governance-obligation-tracking");
    expect(response.headers.get("X-Kairos-Governance-Obligation-Store")).toContain("kairos-governance-obligation-store");
  });
});
