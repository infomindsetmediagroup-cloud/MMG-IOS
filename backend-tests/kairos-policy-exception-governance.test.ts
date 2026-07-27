import { describe, expect, it } from "vitest";
import { createKairosPolicyException, evaluateKairosPolicyException } from "../cloudflare/mmg-ios/src/kairos-policy-exception-governance-v1.js";
import { handleKairosPolicyExceptionAPI, handleKairosPolicyExceptionObjectRequest } from "../cloudflare/mmg-ios/src/kairos-policy-exception-store-v1.js";

class MemoryStorage {
  value = new Map<string, unknown>();
  async get(key: string) { return this.value.get(key); }
  async put(key: string, value: unknown) { this.value.set(key, value); }
}

function state() { return { storage: new MemoryStorage() } as any; }
function future(days = 30) { return new Date(Date.now() + days * 86400000).toISOString(); }
function past(days = 1) { return new Date(Date.now() - days * 86400000).toISOString(); }

function approvedInput() {
  return {
    exceptionId: "kexcept_contract",
    state: "review",
    policyReference: "POL-001",
    controlReference: "CTRL-001",
    compensatingControls: [{ summary: "Manual review", result: "effective", evidenceIds: ["kevt_1"] }],
    approvals: [{ role: "risk_owner", identityHash: "kid_owner", decision: "approved", decidedAt: new Date().toISOString() }],
    validity: { startsAt: new Date().toISOString(), expiresAt: future(), reviewAt: future(15), renewable: true },
    riskAcceptance: { accepted: true, identityHash: "kid_exec", acceptedAt: new Date().toISOString(), rationale: "Bounded exception approved.", residualRisk: "Low residual risk." },
  };
}

describe("Kairos policy exception governance", () => {
  it("creates immutable records with execution authority disabled", () => {
    const record = createKairosPolicyException(approvedInput());
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticRemediationAllowed).toBe(false);
  });

  it("approves only with effective controls, approvals, risk acceptance, and a valid window", () => {
    const result = evaluateKairosPolicyException(createKairosPolicyException(approvedInput()));
    expect(result.state).toBe("approved");
    expect(result.decision).toBe("approve");
  });

  it("defaults expired exceptions to hold", () => {
    const input = approvedInput();
    input.validity = { ...input.validity, expiresAt: past() };
    const result = evaluateKairosPolicyException(createKairosPolicyException(input));
    expect(result.state).toBe("expired");
    expect(result.decision).toBe("hold");
  });

  it("revokes exceptions when a compensating control is ineffective", () => {
    const input = approvedInput();
    input.compensatingControls = [{ summary: "Manual review", result: "ineffective", evidenceIds: [] }];
    const result = evaluateKairosPolicyException(createKairosPolicyException(input));
    expect(result.state).toBe("revoked");
    expect(result.decision).toBe("revoke");
  });

  it("persists, reads, evaluates, lists, and exports bounded records", async () => {
    const runtime = state();
    const createResponse = await handleKairosPolicyExceptionObjectRequest(runtime, new Request("https://kairos.internal/registry/kairos-policy-exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "create", input: approvedInput() }) }));
    expect(createResponse?.status).toBe(201);
    const listResponse = await handleKairosPolicyExceptionObjectRequest(runtime, new Request("https://kairos.internal/registry/kairos-policy-exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse!.json()).count).toBe(1);
    const exportResponse = await handleKairosPolicyExceptionObjectRequest(runtime, new Request("https://kairos.internal/registry/kairos-policy-exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse!.json() as any;
    expect(exported.deploymentExecutionIncluded).toBe(false);
    expect(exported.automaticRemediationIncluded).toBe(false);
  });

  it("requires authentication on public APIs", async () => {
    const response = await handleKairosPolicyExceptionAPI(new Request("https://example.com/api/kairos/operations/exceptions"), {} as any);
    expect(response?.status).toBe(401);
  });
});
