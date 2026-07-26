// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { resolveKairosDepartment } from "../cloudflare/mmg-ios/src/kairos-department-registry-v1.js";
import { retrieveKairosKnowledge, handleKairosKnowledgeObjectRequest } from "../cloudflare/mmg-ios/src/kairos-knowledge-vault-v1.js";
import { handleContextualKairosAPI } from "../cloudflare/mmg-ios/src/kairos-context-orchestrator-v1.js";

function createStorage(records = []) {
  const values = new Map();
  values.set("kairos-knowledge:index", records.map((record) => record.id));
  for (const record of records) values.set(`kairos-knowledge:record:${record.id}`, record);
  return {
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, value); },
    values,
  };
}

function createEnv(storage) {
  const stub = { fetch: (request) => handleKairosKnowledgeObjectRequest({ storage }, request) };
  return { KAIROS_PROJECTS: { idFromName: () => "registry", get: () => stub } };
}

describe("Kairos department routing", () => {
  it("routes Shopify objectives to Commerce Operations", () => {
    const department = resolveKairosDepartment("", "Plan a Shopify subscription product and pricing structure.");
    expect(department.id).toBe("commerce");
    expect(department.instruction).toContain("approval");
  });

  it("honors an explicit department alias", () => {
    expect(resolveKairosDepartment("publishing studio", "Review this project").id).toBe("publishing");
  });
});

describe("Kairos Knowledge Vault", () => {
  it("retrieves bounded constitutional fallback evidence", async () => {
    const result = await retrieveKairosKnowledge({}, { query: "What approval is required for a Shopify production mutation?", department: "commerce" });
    expect(result.evidenceCount).toBeGreaterThan(0);
    expect(result.results.some((item) => item.id === "mmg-shopify-governance")).toBe(true);
    expect(result.results[0].excerpt.length).toBeLessThanOrEqual(1800);
  });

  it("prefers matching canonical records from existing Durable Object storage", async () => {
    const storage = createStorage([{
      id: "canonical-subscription-doctrine",
      title: "Canonical subscription doctrine",
      department: "commerce",
      authority: "operational",
      tags: ["subscription", "pricing"],
      content: "Subscriptions use governed weekly, bi-weekly, and monthly product architecture.",
      source: "MMG production registry",
    }]);
    const result = await retrieveKairosKnowledge(createEnv(storage), { query: "subscription pricing", department: "commerce" });
    expect(result.sourceMode).toBe("canonical-storage-plus-foundation");
    expect(result.results[0].id).toBe("canonical-subscription-doctrine");
  });

  it("excludes private-internal records from retrieval", async () => {
    const storage = createStorage([{
      id: "private-record",
      title: "Private instructions",
      department: "executive",
      content: "Do not expose this.",
      visibility: "private-internal",
    }]);
    const response = await handleKairosKnowledgeObjectRequest({ storage }, new Request("https://kairos.internal/registry/kairos-knowledge/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "private instructions" }),
    }));
    expect((await response.json()).results).toEqual([]);
  });
});

describe("Kairos context orchestrator", () => {
  it("injects bounded evidence and department context before provider execution", async () => {
    const storage = createStorage([]);
    const handler = vi.fn(async (request) => {
      const body = await request.json();
      expect(body.department).toBe("website");
      expect(body.context).toContain("ACTIVE KAIROS DEPARTMENT");
      expect(body.context).toContain("RETRIEVED MMG KNOWLEDGE EVIDENCE");
      expect(body.context).toContain("EVIDENCE RULES");
      return new Response(JSON.stringify({ success: true }), { headers: { "content-type": "application/json" } });
    });
    const response = await handleContextualKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: "Review the responsive Shopify homepage architecture." }),
    }), createEnv(storage), handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(response.headers.get("x-kairos-department")).toBe("website");
    expect(Number(response.headers.get("x-kairos-knowledge-evidence"))).toBeGreaterThan(0);
  });
});
