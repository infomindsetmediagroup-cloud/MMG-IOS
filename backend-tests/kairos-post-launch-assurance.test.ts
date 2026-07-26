import { describe, expect, it } from "vitest";
import { createKairosPostLaunchAssurance, evaluateKairosPostLaunchAssurance } from "../cloudflare/mmg-ios/src/kairos-post-launch-assurance-v1.js";
import { handleKairosPostLaunchAssuranceAPI, handleKairosPostLaunchAssuranceObjectRequest } from "../cloudflare/mmg-ios/src/kairos-post-launch-assurance-store-v1.js";

function state() {
  const data = new Map<string, unknown>();
  return { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as any;
}

describe("Kairos post-launch assurance", () => {
  it("creates immutable assurance records without execution authority", () => {
    const record = createKairosPostLaunchAssurance({ authorizationId: "klauth_test", releaseId: "krel_test" });
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.launchExecutionAllowed).toBe(false);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticRemediationAllowed).toBe(false);
    expect(record.closure.executionAuthorityGranted).toBe(false);
  });

  it("evaluates SLO evidence and escalation deterministically", () => {
    const record = createKairosPostLaunchAssurance({});
    const stable = evaluateKairosPostLaunchAssurance(record, { slos: { availability: "met", latency: "met", errorRate: "met", dependencyHealth: "met", customerExperience: "met" } });
    expect(stable.decision).toBe("certify_stable");
    expect(stable.state).toBe("stable");
    const escalated = evaluateKairosPostLaunchAssurance(stable, { slos: { latency: "missed" }, escalation: { required: true, severity: "critical", reason: "Latency exceeded watch threshold." } });
    expect(escalated.decision).toBe("escalate");
    expect(escalated.state).toBe("escalated");
  });

  it("persists, lists, reads, evaluates, and exports bounded records", async () => {
    const durable = state();
    const createdResponse = await handleKairosPostLaunchAssuranceObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-post-launch-assurance", { method: "POST", body: JSON.stringify({ operation: "create", input: { authorizationId: "klauth_test", evidenceIds: ["kevt_1"], incidentIds: ["kinc_1"] } }) }));
    expect(createdResponse?.status).toBe(201);
    const created = await createdResponse!.json() as any;
    const listResponse = await handleKairosPostLaunchAssuranceObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-post-launch-assurance", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse!.json() as any).count).toBe(1);
    const readResponse = await handleKairosPostLaunchAssuranceObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-post-launch-assurance", { method: "POST", body: JSON.stringify({ operation: "read", assuranceId: created.assurance.assuranceId }) }));
    expect((await readResponse!.json() as any).assurance.authorizationId).toBe("klauth_test");
    const evaluateResponse = await handleKairosPostLaunchAssuranceObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-post-launch-assurance", { method: "POST", body: JSON.stringify({ operation: "evaluate", assuranceId: created.assurance.assuranceId, input: { slos: { availability: "met", latency: "met", errorRate: "met", dependencyHealth: "met", customerExperience: "met" }, closure: { certified: true, identityHash: "kid_operator", certifiedAt: new Date().toISOString(), note: "Watch period complete." } } }) }));
    expect((await evaluateResponse!.json() as any).assurance.state).toBe("closed");
    const exportResponse = await handleKairosPostLaunchAssuranceObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-post-launch-assurance", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse!.json() as any;
    expect(exported.count).toBe(1);
    expect(exported.launchExecutionIncluded).toBe(false);
    expect(exported.deploymentExecutionIncluded).toBe(false);
    expect(exported.rollbackExecutionIncluded).toBe(false);
    expect(exported.automaticRemediationIncluded).toBe(false);
  });

  it("requires authenticated API access", async () => {
    const response = await handleKairosPostLaunchAssuranceAPI(new Request("https://kairos.example/api/kairos/operations/post-launch-assurance"), {});
    expect(response?.status).toBe(401);
  });
});
