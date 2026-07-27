import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createKairosGovernanceLessonsInstitutionalization, evaluateKairosGovernanceLessonsInstitutionalization } from "../cloudflare/mmg-ios/src/kairos-governance-lessons-institutionalization-v1.js";
import { handleKairosGovernanceLessonsInstitutionalizationAPI, handleKairosGovernanceLessonsInstitutionalizationObjectRequest } from "../cloudflare/mmg-ios/src/kairos-governance-lessons-institutionalization-store-v1.js";

const gateway = readFileSync("cloudflare/mmg-ios/src/kairos-governance-effectiveness-verification-store-v1.js", "utf8");

describe("Kairos governance lessons institutionalization", () => {
  it("creates immutable records with change execution prohibited", () => {
    const record = createKairosGovernanceLessonsInstitutionalization({ institutionalizationId: "kinstitution_test" });
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticChangeExecutionAllowed).toBe(false);
  });

  it("escalates blocked commitments, evidence gaps, and regression", () => {
    const base = createKairosGovernanceLessonsInstitutionalization({ institutionalizationId: "kinstitution_risk" });
    const blocked = evaluateKairosGovernanceLessonsInstitutionalization(base, { adoptionCommitments: [{ required: true, state: "blocked" }] });
    expect(blocked.state).toBe("at_risk");
    expect(blocked.decision).toBe("escalate");
    const stale = evaluateKairosGovernanceLessonsInstitutionalization(base, { adoptionEvidence: [{ evidenceState: "stale" }] });
    expect(stale.decision).toBe("escalate");
    const regression = evaluateKairosGovernanceLessonsInstitutionalization(base, { effectivenessReview: { regressionObserved: true } });
    expect(regression.decision).toBe("escalate");
  });

  it("requires approved changes and completed commitments for adoption and certification", () => {
    const base = createKairosGovernanceLessonsInstitutionalization({ institutionalizationId: "kinstitution_cert" });
    const adopted = evaluateKairosGovernanceLessonsInstitutionalization(base, { changeProposals: [{ proposalId: "proposal_1", approved: true }], adoptionCommitments: [{ commitmentId: "commitment_1", required: true, state: "complete" }] });
    expect(adopted.state).toBe("adopted");
    expect(adopted.decision).toBe("adopt");
    const certified = evaluateKairosGovernanceLessonsInstitutionalization(adopted, { adoptionEvidence: [{ evidenceState: "current" }], effectivenessReview: { effective: true }, executiveCertification: { certified: true, certifiedAt: new Date().toISOString() } });
    expect(certified.state).toBe("certified");
    expect(certified.decision).toBe("certify");
    const closed = evaluateKairosGovernanceLessonsInstitutionalization(certified, { executiveCertification: { certified: true, closed: true, closedAt: new Date().toISOString() } });
    expect(closed.state).toBe("closed");
    expect(closed.executiveCertification.executionAuthorityGranted).toBe(false);
  });

  it("persists, lists, evaluates, and exports bounded records", async () => {
    const records = new Map<string, unknown>();
    const state = { storage: { get: vi.fn(async (key: string) => records.get(key)), put: vi.fn(async (key: string, value: unknown) => records.set(key, value)) } };
    const createResponse = await handleKairosGovernanceLessonsInstitutionalizationObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-lessons-institutionalizations", { method: "POST", body: JSON.stringify({ operation: "create", input: { institutionalizationId: "kinstitution_store" } }) }));
    expect(createResponse?.status).toBe(201);
    const listResponse = await handleKairosGovernanceLessonsInstitutionalizationObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-lessons-institutionalizations", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse?.json()).count).toBe(1);
    const exportResponse = await handleKairosGovernanceLessonsInstitutionalizationObjectRequest(state as never, new Request("https://kairos.internal/registry/kairos-governance-lessons-institutionalizations", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse?.json();
    expect(exported.exportVersion).toBe("kairos-governance-lessons-institutionalization-export-v1");
    expect(exported.changeExecutionIncluded).toBe(false);
  });

  it("requires authentication and forwards authenticated requests", async () => {
    const unauthenticated = await handleKairosGovernanceLessonsInstitutionalizationAPI(new Request("https://example.com/api/kairos/operations/lessons-institutionalizations"), {});
    expect(unauthenticated?.status).toBe(401);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, institutionalizations: [] }), { headers: { "Content-Type": "application/json" } }));
    const env = { KAIROS_API_ACCESS_TOKEN: "secret", KAIROS_PROJECTS: { idFromName: vi.fn(() => "id"), get: vi.fn(() => ({ fetch })) } };
    const authenticated = await handleKairosGovernanceLessonsInstitutionalizationAPI(new Request("https://example.com/api/kairos/operations/lessons-institutionalizations", { headers: { authorization: "Bearer secret" } }), env as never);
    expect(authenticated?.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("is integrated through the canonical effectiveness gateway with explicit headers", () => {
    expect(gateway).toContain("handleKairosGovernanceLessonsInstitutionalizationAPI");
    expect(gateway).toContain("handleKairosGovernanceLessonsInstitutionalizationObjectRequest");
    expect(gateway).toContain("X-Kairos-Governance-Lessons-Institutionalization");
    expect(gateway).toContain("X-Kairos-Governance-Lessons-Institutionalization-Store");
  });
});
