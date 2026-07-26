import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createKairosReleaseRecord, evaluateKairosRelease } from "../cloudflare/mmg-ios/src/kairos-release-recovery-v1.js";
import { handleKairosReleaseAPI, handleKairosReleaseObjectRequest } from "../cloudflare/mmg-ios/src/kairos-release-store-v1.js";

function state() {
  const data = new Map<string, unknown>();
  return { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as any;
}

const productionEntry = readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");

describe("Kairos release and recovery operations", () => {
  it("creates immutable release records without execution authority", () => {
    const release = createKairosReleaseRecord({ releaseId: "krel_test", deploymentId: "dep_1", commitSha: "abc123" });
    expect(Object.isFrozen(release)).toBe(true);
    expect(release.deploymentExecutionAllowed).toBe(false);
    expect(release.rollbackExecutionAllowed).toBe(false);
    expect(release.automaticRemediationAllowed).toBe(false);
  });

  it("evaluates verification gates and recommends rollback without executing it", () => {
    const release = createKairosReleaseRecord({ releaseId: "krel_degraded" });
    const evaluated = evaluateKairosRelease(release, { verification: { runtime: "passed", health: "failed", contracts: "passed", experience: "passed" }, reasonCode: "HEALTH_FAILED", incidentId: "kinc_123" });
    expect(evaluated.status).toBe("degraded");
    expect(evaluated.recoveryPlan.action).toBe("rollback_recommended");
    expect(evaluated.recoveryPlan.requiresNewApproval).toBe(true);
    expect(evaluated.recoveryPlan.automaticExecution).toBe(false);
  });

  it("persists, lists, reads, evaluates, correlates, and exports releases", async () => {
    const durable = state();
    const createResponse = await handleKairosReleaseObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-releases", { method: "POST", body: JSON.stringify({ operation: "create", input: { releaseId: "krel_1", deploymentId: "dep_1", incidentIds: ["kinc_1"], observabilityEventIds: ["kevt_1"], requestIds: ["req_1"], approvalIds: ["kap_1"] } }) }));
    expect(createResponse?.status).toBe(201);
    const created = await createResponse!.json() as any;
    expect(created.release.incidentIds).toEqual(["kinc_1"]);
    expect(created.release.observabilityEventIds).toEqual(["kevt_1"]);

    const evaluateResponse = await handleKairosReleaseObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-releases", { method: "POST", body: JSON.stringify({ operation: "evaluate", releaseId: "krel_1", input: { verification: { runtime: "passed", health: "passed", contracts: "passed", experience: "passed" } } }) }));
    const evaluated = await evaluateResponse!.json() as any;
    expect(evaluated.release.status).toBe("ready");

    const listResponse = await handleKairosReleaseObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-releases", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse!.json() as any).count).toBe(1);

    const exportResponse = await handleKairosReleaseObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-releases", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const exported = await exportResponse!.json() as any;
    expect(exported.exportVersion).toBe("kairos-release-export-v1");
    expect(exported.deploymentExecutionIncluded).toBe(false);
    expect(exported.rollbackExecutionIncluded).toBe(false);
    expect(exported.automaticRemediationIncluded).toBe(false);
  });

  it("requires authentication and is wired into the canonical production entry", async () => {
    const response = await handleKairosReleaseAPI(new Request("https://kairos.example/api/kairos/operations/releases"), {});
    expect(response?.status).toBe(401);
    expect(productionEntry).toContain("handleKairosReleaseAPI");
    expect(productionEntry).toContain("handleKairosReleaseObjectRequest");
    expect(productionEntry).toContain("X-Kairos-Release-Store");
    expect(productionEntry).not.toContain("executeKairosRelease");
    expect(productionEntry).not.toContain("executeRollback");
  });
});
