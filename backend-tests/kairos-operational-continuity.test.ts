import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createKairosOperationalContinuity, evaluateKairosOperationalContinuity } from "../cloudflare/mmg-ios/kairos-operational-continuity-v1.js";
import { handleKairosOperationalContinuityAPI, handleKairosOperationalContinuityObjectRequest } from "../cloudflare/mmg-ios/src/kairos-operational-continuity-store-v1.js";

class MemoryStorage {
  values = new Map<string, unknown>();
  async get(key: string) { return this.values.get(key); }
  async put(key: string, value: unknown) { this.values.set(key, value); }
}

function state() { return { storage: new MemoryStorage() } as any; }
function internal(body: unknown) { return new Request("https://kairos.internal/registry/kairos-operational-continuity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

const readyInput = {
  ownership: { accountableOwnerHash: "owner_hash", serviceOwnerRole: "Platform owner", escalationOwnerRole: "Incident commander" },
  onCall: { coverageReady: true, escalationPathReady: true, scheduleReference: "schedule://primary" },
  maintenance: { runbookReady: true, timezone: "America/Los_Angeles" },
  handoff: { attested: true, identityHash: "operator_hash", attestedAt: "2026-07-26T18:00:00.000Z", note: "Continuity accepted." },
};

describe("Kairos operational continuity", () => {
  it("creates immutable records with execution authority disabled", () => {
    const record = createKairosOperationalContinuity({ continuityId: "kcontinuity_test" });
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticRemediationAllowed).toBe(false);
  });

  it("attests ready continuity and escalates unresolved critical risk", () => {
    const record = createKairosOperationalContinuity({ continuityId: "kcontinuity_ready" });
    const attested = evaluateKairosOperationalContinuity(record, readyInput);
    expect(attested.state).toBe("attested");
    expect(attested.decision).toBe("attest");
    const escalated = evaluateKairosOperationalContinuity(attested, { risks: [{ riskId: "krisk_critical", level: "critical", summary: "No secondary owner", resolved: false }] });
    expect(escalated.state).toBe("at_risk");
    expect(escalated.decision).toBe("escalate");
  });

  it("persists, reads, lists, evaluates, and exports bounded records", async () => {
    const durable = state();
    const createdResponse = await handleKairosOperationalContinuityObjectRequest(durable, internal({ operation: "create", input: { continuityId: "kcontinuity_store" } }));
    expect(createdResponse?.status).toBe(201);
    const evaluatedResponse = await handleKairosOperationalContinuityObjectRequest(durable, internal({ operation: "evaluate", continuityId: "kcontinuity_store", input: readyInput }));
    expect((await evaluatedResponse?.json()).continuity.state).toBe("attested");
    const listResponse = await handleKairosOperationalContinuityObjectRequest(durable, internal({ operation: "list" }));
    expect((await listResponse?.json()).count).toBe(1);
    const readResponse = await handleKairosOperationalContinuityObjectRequest(durable, internal({ operation: "read", continuityId: "kcontinuity_store" }));
    expect((await readResponse?.json()).continuity.continuityId).toBe("kcontinuity_store");
    const exportResponse = await handleKairosOperationalContinuityObjectRequest(durable, internal({ operation: "export" }));
    const exported = await exportResponse?.json();
    expect(exported.exportVersion).toBe("kairos-operational-continuity-export-v1");
    expect(exported.deploymentExecutionIncluded).toBe(false);
    expect(exported.automaticRemediationIncluded).toBe(false);
  });

  it("requires authentication at the public API boundary", async () => {
    const response = await handleKairosOperationalContinuityAPI(new Request("https://example.com/api/kairos/operations/continuity"), {});
    expect(response?.status).toBe(401);
  });

  it("is wired into the production entry and exposes no execution route", async () => {
    const entry = await readFile("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");
    const store = await readFile("cloudflare/mmg-ios/src/kairos-operational-continuity-store-v1.js", "utf8");
    expect(entry).toContain("handleKairosOperationalContinuityAPI");
    expect(entry).toContain("handleKairosOperationalContinuityObjectRequest");
    expect(entry).toContain("X-Kairos-Operational-Continuity-Store");
    expect(store).toContain("/api/kairos/operations/continuity");
    expect(store).not.toMatch(/\/deploy|\/rollback|\/retry|\/execute/);
  });
});
