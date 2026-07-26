import { describe, expect, it } from "vitest";
import { createKairosReadinessCertification, evaluateKairosReadinessCertification } from "../cloudflare/mmg-ios/src/kairos-production-readiness-certification-v1.js";
import { handleKairosProductionReadinessAPI, handleKairosProductionReadinessObjectRequest } from "../cloudflare/mmg-ios/src/kairos-production-readiness-store-v1.js";

function state() {
  const data = new Map<string, unknown>();
  return { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as any;
}

describe("Kairos production readiness certification", () => {
  it("creates immutable decision-support records without execution authority", () => {
    const record = createKairosReadinessCertification({ releaseId: "krel_test", evidenceIds: ["kevt_1"], incidentIds: ["kinc_1"] });
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.launchExecutionAllowed).toBe(false);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.signoff.executionAuthorityGranted).toBe(false);
  });

  it("evaluates gates and blockers deterministically", () => {
    const record = createKairosReadinessCertification({});
    const go = evaluateKairosReadinessCertification(record, { gates: { runtime: "passed", health: "passed", contracts: "passed", experience: "passed", incidentResponse: "passed", releaseRecovery: "passed" } });
    expect(go.recommendation).toBe("go");
    const noGo = evaluateKairosReadinessCertification(go, { blockers: [{ code: "CRITICAL_OPEN", summary: "Critical blocker", severity: "critical", status: "open" }] });
    expect(noGo.recommendation).toBe("no_go");
  });

  it("persists, lists, reads, evaluates, and exports bounded records", async () => {
    const durable = state();
    const createdResponse = await handleKairosProductionReadinessObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-production-readiness", { method: "POST", body: JSON.stringify({ operation: "create", input: { releaseId: "krel_test", evidenceIds: ["kevt_1"], incidentIds: ["kinc_1"] } }) }));
    expect(createdResponse?.status).toBe(201);
    const created = await createdResponse!.json() as any;
    const listResponse = await handleKairosProductionReadinessObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-production-readiness", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse!.json() as any).count).toBe(1);
    const evaluateResponse = await handleKairosProductionReadinessObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-production-readiness", { method: "POST", body: JSON.stringify({ operation: "evaluate", certificationId: created.certification.certificationId, input: { gates: { runtime: "passed", health: "passed", contracts: "passed", experience: "passed", incidentResponse: "passed", releaseRecovery: "passed" }, signoff: { status: "approved", identityHash: "kid_operator", signedAt: new Date().toISOString() } } }) }));
    expect((await evaluateResponse!.json() as any).certification.recommendation).toBe("go");
    const exportResponse = await handleKairosProductionReadinessObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-production-readiness", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse!.json() as any;
    expect(exported.count).toBe(1);
    expect(exported.launchExecutionIncluded).toBe(false);
    expect(exported.deploymentExecutionIncluded).toBe(false);
  });

  it("requires authenticated API access", async () => {
    const response = await handleKairosProductionReadinessAPI(new Request("https://kairos.example/api/kairos/operations/readiness-certifications"), {});
    expect(response?.status).toBe(401);
  });
});
