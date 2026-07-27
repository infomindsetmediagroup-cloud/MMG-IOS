import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createKairosGovernanceAssurancePlan, evaluateKairosGovernanceAssurancePlan } from "../cloudflare/mmg-ios/src/kairos-governance-assurance-planning-v1.js";
import { handleKairosGovernanceAssurancePlanAPI, handleKairosGovernanceAssurancePlanObjectRequest } from "../cloudflare/mmg-ios/src/kairos-governance-assurance-plan-store-v1.js";

const runtime = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");

describe("Kairos governance assurance planning", () => {
  it("creates immutable plans with execution prohibited", () => {
    const plan = createKairosGovernanceAssurancePlan({ assurancePlanId: "kassuranceplan_test", schedule: { cadence: "quarterly" } });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan.deploymentExecutionAllowed).toBe(false);
    expect(plan.rollbackExecutionAllowed).toBe(false);
    expect(plan.automaticRemediationAllowed).toBe(false);
  });

  it("escalates stale evidence, incomplete required commitments, and overdue cycles", () => {
    const base = createKairosGovernanceAssurancePlan({ assurancePlanId: "kassuranceplan_risk" });
    const stale = evaluateKairosGovernanceAssurancePlan(base, { controlAssessments: [{ evidenceState: "stale", effectiveness: "effective" }] });
    expect(stale.state).toBe("at_risk");
    expect(stale.decision).toBe("escalate");
    const incomplete = evaluateKairosGovernanceAssurancePlan(base, { ownerCommitments: [{ required: true, status: "pending" }] });
    expect(incomplete.decision).toBe("escalate");
    const overdue = evaluateKairosGovernanceAssurancePlan(base, { schedule: { cadence: "monthly", dueAt: "2020-01-01T00:00:00.000Z" } });
    expect(overdue.decision).toBe("escalate");
  });

  it("requires explicit certification and closure", () => {
    const base = createKairosGovernanceAssurancePlan({ assurancePlanId: "kassuranceplan_cert" });
    const certified = evaluateKairosGovernanceAssurancePlan(base, { executiveCertification: { certified: true, certifiedAt: new Date().toISOString() } });
    expect(certified.state).toBe("certified");
    expect(certified.decision).toBe("certify");
    const closed = evaluateKairosGovernanceAssurancePlan(certified, { executiveCertification: { certified: true, closed: true, closedAt: new Date().toISOString() } });
    expect(closed.state).toBe("closed");
    expect(closed.decision).toBe("close");
    expect(closed.executiveCertification.executionAuthorityGranted).toBe(false);
  });

  it("persists, reads, lists, evaluates, and exports bounded records", async () => {
    const records = new Map<string, unknown>();
    const state = { storage: { get: vi.fn(async (key: string) => records.get(key)), put: vi.fn(async (key: string, value: unknown) => records.set(key, value)) } };
    const createResponse = await handleKairosGovernanceAssurancePlanObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-assurance-plans", { method: "POST", body: JSON.stringify({ operation: "create", input: { assurancePlanId: "kassuranceplan_store" } }) }));
    expect(createResponse?.status).toBe(201);
    const listResponse = await handleKairosGovernanceAssurancePlanObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-assurance-plans", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse?.json()).count).toBe(1);
    const exportResponse = await handleKairosGovernanceAssurancePlanObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-assurance-plans", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse?.json();
    expect(exported.exportVersion).toBe("kairos-governance-assurance-plan-export-v1");
    expect(exported.deploymentExecutionIncluded).toBe(false);
  });

  it("requires authentication and forwards authenticated requests", async () => {
    const unauthenticated = await handleKairosGovernanceAssurancePlanAPI(new Request("https://example.com/api/kairos/operations/assurance-plans"), {});
    expect(unauthenticated?.status).toBe(401);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, assurancePlans: [] }), { headers: { "Content-Type": "application/json" } }));
    const env = { KAIROS_API_ACCESS_TOKEN: "secret", KAIROS_PROJECTS: { idFromName: vi.fn(() => "id"), get: vi.fn(() => ({ fetch })) } };
    const authenticated = await handleKairosGovernanceAssurancePlanAPI(new Request("https://example.com/api/kairos/operations/assurance-plans", { headers: { authorization: "Bearer secret" } }), env as never);
    expect(authenticated?.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("is integrated into the canonical runtime with explicit headers", () => {
    expect(runtime).toContain("handleKairosGovernanceAssurancePlanAPI");
    expect(runtime).toContain("handleKairosGovernanceAssurancePlanObjectRequest");
    expect(runtime).toContain("X-Kairos-Governance-Assurance-Planning");
    expect(runtime).toContain("X-Kairos-Governance-Assurance-Plan-Store");
  });
});
