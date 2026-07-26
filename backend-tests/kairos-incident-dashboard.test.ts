import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleKairosIncidentObjectRequest } from "../cloudflare/mmg-ios/src/kairos-incident-store-v1.js";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const controller = readFileSync("web/kairos-dashboard/scripts/incident-operations.js", "utf8");
const styles = readFileSync("web/kairos-dashboard/styles/incident-operations.css", "utf8");

function state() {
  const data = new Map<string, unknown>();
  return { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as any;
}

describe("Kairos incident operator dashboard", () => {
  it("loads the incident module and responsive styles", () => {
    expect(index).toContain("incident-operations.js?v=incidents-20260726-1");
    expect(index).toContain("incident-operations.css?v=incidents-20260726-1");
    expect(styles).toContain("@media(max-width:800px)");
  });

  it("uses authenticated incident APIs for refresh, transition, and export", () => {
    expect(controller).toContain('fetch("/api/kairos/operations/incidents"');
    expect(controller).toContain("/api/kairos/operations/incidents/export");
    expect(controller).toContain('requestOptions("PATCH"');
    expect(controller).toContain('credentials: "include"');
    expect(controller).toContain("resolutionCode");
    expect(controller).toContain("Operator note");
  });

  it("renders ownership, correlation, timeline, and remediation guardrails", () => {
    expect(controller).toContain("ownerIdentityHash");
    expect(controller).toContain("sourceAlertCode");
    expect(controller).toContain("requestId");
    expect(controller).toContain("approvalId");
    expect(controller).toContain("Timeline");
    expect(controller).toContain("No incident control performs rollback, retry, unpublish, or commerce mutation.");
    expect(controller).not.toContain("/api/kairos/tools/continue");
  });

  it("exports a bounded incident package without remediation authority", async () => {
    const durable = state();
    await handleKairosIncidentObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-incidents", { method: "POST", body: JSON.stringify({ operation: "create", input: { title: "Verification failure", severity: "critical" } }) }));
    const response = await handleKairosIncidentObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-incidents", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const payload = await response!.json() as any;
    expect(payload.exportVersion).toBe("kairos-incident-export-v1");
    expect(payload.count).toBe(1);
    expect(payload.automaticRemediationIncluded).toBe(false);
    expect(payload.incidents[0].automaticRemediationAllowed).toBe(false);
  });
});
