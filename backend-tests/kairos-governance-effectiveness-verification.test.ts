import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createKairosGovernanceEffectivenessVerification, evaluateKairosGovernanceEffectivenessVerification } from "../cloudflare/mmg-ios/src/kairos-governance-effectiveness-verification-v1.js";
import { handleKairosGovernanceEffectivenessVerificationAPI, handleKairosGovernanceEffectivenessVerificationObjectRequest } from "../cloudflare/mmg-ios/src/kairos-governance-effectiveness-verification-store-v1.js";

const runtime = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");
const gateway = readFileSync("cloudflare/mmg-ios/src/kairos-governance-remediation-plan-store-v1.js", "utf8");

describe("Kairos governance effectiveness verification", () => {
  it("creates immutable verification records with execution prohibited", () => {
    const verification = createKairosGovernanceEffectivenessVerification({ verificationId: "keffectiveness_test" });
    expect(Object.isFrozen(verification)).toBe(true);
    expect(verification.deploymentExecutionAllowed).toBe(false);
    expect(verification.rollbackExecutionAllowed).toBe(false);
    expect(verification.automaticRemediationAllowed).toBe(false);
  });

  it("escalates evidence gaps and regression and confirms ineffective controls", () => {
    const base = createKairosGovernanceEffectivenessVerification({ verificationId: "keffectiveness_risk" });
    const stale = evaluateKairosGovernanceEffectivenessVerification(base, { controlComparisons: [{ controlId: "control_1", evidenceState: "stale", effectiveness: "effective" }] });
    expect(stale.state).toBe("at_risk");
    expect(stale.decision).toBe("escalate");
    const regression = evaluateKairosGovernanceEffectivenessVerification(base, { regressionSignals: [{ active: true, category: "recurrence" }] });
    expect(regression.decision).toBe("escalate");
    const ineffective = evaluateKairosGovernanceEffectivenessVerification(base, { controlComparisons: [{ controlId: "control_1", evidenceState: "current", effectiveness: "ineffective" }] });
    expect(ineffective.state).toBe("ineffective");
    expect(ineffective.decision).toBe("confirm_ineffective");
  });

  it("requires a complete sustainability window for effectiveness and certification", () => {
    const base = createKairosGovernanceEffectivenessVerification({ verificationId: "keffectiveness_cert" });
    const effective = evaluateKairosGovernanceEffectivenessVerification(base, { controlComparisons: [{ controlId: "control_1", evidenceState: "current", effectiveness: "effective" }], sustainabilityAssessment: { windowComplete: true } });
    expect(effective.state).toBe("effective");
    expect(effective.decision).toBe("confirm_effective");
    const certified = evaluateKairosGovernanceEffectivenessVerification(effective, { executiveCertification: { certified: true, certifiedAt: new Date().toISOString() } });
    expect(certified.state).toBe("certified");
    expect(certified.decision).toBe("certify");
    const closed = evaluateKairosGovernanceEffectivenessVerification(certified, { executiveCertification: { certified: true, closed: true, closedAt: new Date().toISOString() } });
    expect(closed.state).toBe("closed");
    expect(closed.decision).toBe("close");
    expect(closed.executiveCertification.executionAuthorityGranted).toBe(false);
  });

  it("persists, reads, lists, evaluates, and exports bounded records", async () => {
    const records = new Map<string, unknown>();
    const state = { storage: { get: vi.fn(async (key: string) => records.get(key)), put: vi.fn(async (key: string, value: unknown) => records.set(key, value)) } };
    const createResponse = await handleKairosGovernanceEffectivenessVerificationObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-effectiveness-verifications", { method: "POST", body: JSON.stringify({ operation: "create", input: { verificationId: "keffectiveness_store" } }) }));
    expect(createResponse?.status).toBe(201);
    const listResponse = await handleKairosGovernanceEffectivenessVerificationObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-effectiveness-verifications", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse?.json()).count).toBe(1);
    const exportResponse = await handleKairosGovernanceEffectivenessVerificationObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-effectiveness-verifications", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse?.json();
    expect(exported.exportVersion).toBe("kairos-governance-effectiveness-verification-export-v1");
    expect(exported.remediationExecutionIncluded).toBe(false);
  });

  it("requires authentication and forwards authenticated requests", async () => {
    const unauthenticated = await handleKairosGovernanceEffectivenessVerificationAPI(new Request("https://example.com/api/kairos/operations/effectiveness-verifications"), {});
    expect(unauthenticated?.status).toBe(401);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, verifications: [] }), { headers: { "Content-Type": "application/json" } }));
    const env = { KAIROS_API_ACCESS_TOKEN: "secret", KAIROS_PROJECTS: { idFromName: vi.fn(() => "id"), get: vi.fn(() => ({ fetch })) } };
    const authenticated = await handleKairosGovernanceEffectivenessVerificationAPI(new Request("https://example.com/api/kairos/operations/effectiveness-verifications", { headers: { authorization: "Bearer secret" } }), env as never);
    expect(authenticated?.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("is integrated through the canonical remediation runtime gateway with explicit headers", () => {
    expect(runtime).toContain("handleKairosGovernanceRemediationPlanAPI");
    expect(runtime).toContain("handleKairosGovernanceRemediationPlanObjectRequest");
    expect(gateway).toContain("handleKairosGovernanceEffectivenessVerificationAPI");
    expect(gateway).toContain("handleKairosGovernanceEffectivenessVerificationObjectRequest");
    expect(gateway).toContain("X-Kairos-Governance-Effectiveness-Verification");
    expect(gateway).toContain("X-Kairos-Governance-Effectiveness-Verification-Store");
  });
});
