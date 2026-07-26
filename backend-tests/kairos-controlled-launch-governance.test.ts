import { describe, expect, it } from "vitest";
import { createKairosLaunchAuthorization, evaluateKairosLaunchAuthorization } from "../cloudflare/mmg-ios/src/kairos-controlled-launch-governance-v1.js";
import { handleKairosControlledLaunchAPI, handleKairosControlledLaunchObjectRequest } from "../cloudflare/mmg-ios/src/kairos-controlled-launch-store-v1.js";

function state() {
  const data = new Map<string, unknown>();
  return { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as any;
}

describe("Kairos controlled launch governance", () => {
  it("creates immutable authorization records without execution authority", () => {
    const record = createKairosLaunchAuthorization({ certificationId: "kcert_test", releaseId: "krel_test" });
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.launchExecutionAllowed).toBe(false);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticRemediationAllowed).toBe(false);
  });

  it("evaluates prerequisites, approvals, communications, and change windows deterministically", () => {
    const base = createKairosLaunchAuthorization({});
    const authorized = evaluateKairosLaunchAuthorization(base, {
      prerequisites: { certificationApproved: true, releaseReady: true, noCriticalIncidents: true, recoveryPlanReady: true },
      stakeholders: [{ role: "executive", status: "approved" }],
      communications: { ready: true, statusPagePrepared: true, supportBriefed: true, stakeholderNoticePrepared: true },
      changeWindow: { startAt: "2026-07-26T08:00:00Z", endAt: "2026-07-26T10:00:00Z", timezone: "UTC" },
    });
    expect(authorized.decision).toBe("authorize");
    const cancelled = evaluateKairosLaunchAuthorization(authorized, { stakeholders: [{ role: "executive", status: "rejected" }] });
    expect(cancelled.decision).toBe("cancel");
  });

  it("persists, lists, reads, evaluates, and exports bounded authorization records", async () => {
    const durable = state();
    const createdResponse = await handleKairosControlledLaunchObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-controlled-launch", { method: "POST", body: JSON.stringify({ operation: "create", input: { certificationId: "kcert_test", releaseId: "krel_test", evidenceIds: ["kevt_1"], incidentIds: ["kinc_1"] } }) }));
    expect(createdResponse?.status).toBe(201);
    const created = await createdResponse!.json() as any;
    const listResponse = await handleKairosControlledLaunchObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-controlled-launch", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse!.json() as any).count).toBe(1);
    const readResponse = await handleKairosControlledLaunchObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-controlled-launch", { method: "POST", body: JSON.stringify({ operation: "read", authorizationId: created.authorization.authorizationId }) }));
    expect((await readResponse!.json() as any).authorization.certificationId).toBe("kcert_test");
    const evaluateResponse = await handleKairosControlledLaunchObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-controlled-launch", { method: "POST", body: JSON.stringify({ operation: "evaluate", authorizationId: created.authorization.authorizationId, input: { prerequisites: { certificationApproved: true, releaseReady: true, noCriticalIncidents: true, recoveryPlanReady: true }, stakeholders: [{ role: "executive", status: "approved" }], communications: { ready: true }, changeWindow: { startAt: "2026-07-26T08:00:00Z", endAt: "2026-07-26T10:00:00Z" } } }) }));
    expect((await evaluateResponse!.json() as any).authorization.decision).toBe("authorize");
    const exportResponse = await handleKairosControlledLaunchObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-controlled-launch", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse!.json() as any;
    expect(exported.count).toBe(1);
    expect(exported.launchExecutionIncluded).toBe(false);
    expect(exported.deploymentExecutionIncluded).toBe(false);
  });

  it("requires authenticated API access", async () => {
    const response = await handleKairosControlledLaunchAPI(new Request("https://kairos.example/api/kairos/operations/launch-authorizations"), {});
    expect(response?.status).toBe(401);
  });
});
