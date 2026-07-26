import { describe, expect, it } from "vitest";
import { createKairosIncident, transitionKairosIncident } from "../cloudflare/mmg-ios/src/kairos-incident-lifecycle-v1.js";
import { handleKairosIncidentAPI, handleKairosIncidentObjectRequest } from "../cloudflare/mmg-ios/src/kairos-incident-store-v1.js";

function state() {
  const data = new Map<string, unknown>();
  return { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as any;
}

describe("Kairos production incident operations", () => {
  it("creates immutable alert- and release-correlated incidents without remediation authority", () => {
    const incident = createKairosIncident({
      title: "Verification failure",
      sourceAlertCode: "VERIFICATION_FAILURES_PRESENT",
      severity: "critical",
      releaseId: "release-20260726",
      deploymentId: "deployment-42",
      environment: "production",
      commitSha: "a27d0bc201cfd49066b6821cf854da665df02113",
    });
    expect(incident).toMatchObject({
      sourceAlertCode: "VERIFICATION_FAILURES_PRESENT",
      releaseId: "release-20260726",
      deploymentId: "deployment-42",
      environment: "production",
      commitSha: "a27d0bc201cfd49066b6821cf854da665df02113",
      automaticRemediationAllowed: false,
    });
    expect(Object.isFrozen(incident)).toBe(true);
  });

  it("rejects invalid commit correlation", () => {
    expect(() => createKairosIncident({ title: "Invalid release", commitSha: "not-a-sha" })).toThrow("hexadecimal Git commit SHA");
  });

  it("enforces lifecycle transitions and resolution codes", () => {
    const opened = createKairosIncident({ title: "Shopify verification failure" });
    const acknowledged = transitionKairosIncident(opened, { status: "acknowledged", ownerIdentityHash: "kid_test", note: "Investigating" });
    expect(acknowledged.status).toBe("acknowledged");
    expect(() => transitionKairosIncident(acknowledged, { status: "closed" })).toThrow("Cannot transition");
    expect(() => transitionKairosIncident(acknowledged, { status: "resolved" })).toThrow("resolution code");
  });

  it("persists, lists, reads, and transitions incidents in the durable boundary", async () => {
    const durable = state();
    const createResponse = await handleKairosIncidentObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-incidents", { method: "POST", body: JSON.stringify({ operation: "create", input: { title: "Elevated failures", severity: "warning", sourceAlertCode: "ELEVATED_FAILURE_COUNT", releaseId: "release-1" } }) }));
    expect(createResponse?.status).toBe(201);
    const created = await createResponse!.json() as any;
    expect(created.incident.releaseId).toBe("release-1");
    const listResponse = await handleKairosIncidentObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-incidents", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listResponse!.json() as any).count).toBe(1);
    const transitionResponse = await handleKairosIncidentObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-incidents", { method: "POST", body: JSON.stringify({ operation: "transition", incidentId: created.incident.incidentId, input: { status: "acknowledged", ownerIdentityHash: "kid_operator", note: "Owner assigned" } }) }));
    expect((await transitionResponse!.json() as any).incident.status).toBe("acknowledged");
  });

  it("requires authenticated API access", async () => {
    const response = await handleKairosIncidentAPI(new Request("https://kairos.example/api/kairos/operations/incidents"), {});
    expect(response?.status).toBe(401);
  });
});
