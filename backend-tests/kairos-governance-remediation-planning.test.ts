import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createKairosGovernanceRemediationPlan, evaluateKairosGovernanceRemediationPlan } from "../cloudflare/mmg-ios/src/kairos-governance-remediation-planning-v1.js";
import { handleKairosGovernanceRemediationPlanAPI, handleKairosGovernanceRemediationPlanObjectRequest } from "../cloudflare/mmg-ios/src/kairos-governance-remediation-plan-store-v1.js";

const runtime = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");

describe("Kairos governance remediation planning", () => {
  it("creates immutable plans with execution prohibited", () => {
    const plan = createKairosGovernanceRemediationPlan({ remediationPlanId: "kremediation_test" });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan.deploymentExecutionAllowed).toBe(false);
    expect(plan.rollbackExecutionAllowed).toBe(false);
    expect(plan.automaticRemediationAllowed).toBe(false);
  });

  it("escalates overdue actions, blocked critical actions, and validation evidence gaps", () => {
    const base = createKairosGovernanceRemediationPlan({ remediationPlanId: "kremediation_risk" });
    const overdue = evaluateKairosGovernanceRemediationPlan(base, { correctiveActions: [{ required: true, status: "pending", dueAt: "2020-01-01T00:00:00.000Z" }] });
    expect(overdue.state).toBe("at_risk");
    expect(overdue.decision).toBe("escalate");
    const blocked = evaluateKairosGovernanceRemediationPlan(base, { correctiveActions: [{ required: true, priority: "critical", status: "blocked" }] });
    expect(blocked.decision).toBe("escalate");
    const missing = evaluateKairosGovernanceRemediationPlan(base, { validation: { evidenceState: "missing" } });
    expect(missing.decision).toBe("escalate");
  });

  it("requires completed required actions before validation and supports explicit closure", () => {
    const base = createKairosGovernanceRemediationPlan({ remediationPlanId: "kremediation_validate" });
    const validated = evaluateKairosGovernanceRemediationPlan(base, { correctiveActions: [{ required: true, status: "complete" }], validation: { validated: true, evidenceState: "current", validatedAt: new Date().toISOString() } });
    expect(validated.state).toBe("validated");
    expect(validated.decision).toBe("validate");
    const closed = evaluateKairosGovernanceRemediationPlan(validated, { executiveClosure: { closed: true, closedAt: new Date().toISOString() } });
    expect(closed.state).toBe("closed");
    expect(closed.decision).toBe("close");
    expect(closed.executiveClosure.executionAuthorityGranted).toBe(false);
  });

  it("persists, reads, lists, evaluates, and exports bounded records", async () => {
    const records = new Map<string, unknown>();
    const state = { storage: { get: vi.fn(async (key: string) => records.get(key)), put: vi.fn(async (key: string, value: unknown) => records.set(key, value)) } };
    const created = await handleKairosGovernanceRemediationPlanObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-remediation-plans", { method: "POST", body: JSON.stringify({ operation: "create", input: { remediationPlanId: "kremediation_store" } }) }));
    expect(created?.status).toBe(201);
    const listed = await handleKairosGovernanceRemediationPlanObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-remediation-plans", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listed?.json()).count).toBe(1);
    const exported = await handleKairosGovernanceRemediationPlanObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-remediation-plans", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const body = await exported?.json();
    expect(body.exportVersion).toBe("kairos-governance-remediation-plan-export-v1");
    expect(body.remediationExecutionIncluded).toBe(false);
  });

  it("requires authentication and forwards authenticated requests", async () => {
    const unauthenticated = await handleKairosGovernanceRemediationPlanAPI(new Request("https://example.com/api/kairos/operations/remediation-plans"), {});
    expect(unauthenticated?.status).toBe(401);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, remediationPlans: [] }), { headers: { "Content-Type": "application/json" } }));
    const env = { KAIROS_API_ACCESS_TOKEN: "secret", KAIROS_PROJECTS: { idFromName: vi.fn(() => "id"), get: vi.fn(() => ({ fetch })) } };
    const authenticated = await handleKairosGovernanceRemediationPlanAPI(new Request("https://example.com/api/kairos/operations/remediation-plans", { headers: { authorization: "Bearer secret" } }), env as never);
    expect(authenticated?.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("is integrated into the canonical runtime with explicit headers", () => {
    expect(runtime).toContain("handleKairosGovernanceRemediationPlanAPI");
    expect(runtime).toContain("handleKairosGovernanceRemediationPlanObjectRequest");
    expect(runtime).toContain("X-Kairos-Governance-Remediation-Planning");
    expect(runtime).toContain("X-Kairos-Governance-Remediation-Plan-Store");
  });
});
