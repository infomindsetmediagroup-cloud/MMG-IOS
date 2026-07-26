// @ts-nocheck
import { describe, expect, it } from "vitest";
import { handleKairosKnowledgeLifecycleObjectRequest } from "../cloudflare/mmg-ios/src/kairos-knowledge-lifecycle-v1.js";
import { handleKairosKnowledgeObjectRequest } from "../cloudflare/mmg-ios/src/kairos-knowledge-vault-v1.js";

function createStorage() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
  };
}

function request(path, body, method = "POST") {
  return new Request(`https://kairos.internal${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
}

describe("Kairos Knowledge Vault lifecycle", () => {
  it("requires explicit confirmation before creating a draft", async () => {
    const state = { storage: createStorage() };
    const response = await handleKairosKnowledgeLifecycleObjectRequest(state, request("/registry/kairos-knowledge/lifecycle/drafts", {
      title: "Test doctrine",
      department: "executive",
      content: "Controlled knowledge content.",
      source: "Owner-approved source",
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("KNOWLEDGE_CONFIRMATION_REQUIRED");
  });

  it("keeps drafts out of retrieval until approval", async () => {
    const storage = createStorage();
    const state = { storage };
    const created = await handleKairosKnowledgeLifecycleObjectRequest(state, request("/registry/kairos-knowledge/lifecycle/drafts", {
      confirmation: "CREATE KNOWLEDGE DRAFT",
      recordId: "controlled-doctrine",
      title: "Controlled doctrine",
      department: "executive",
      authority: "operational",
      visibility: "internal-model",
      tags: ["controlled", "doctrine"],
      content: "This controlled doctrine becomes retrievable only after approval.",
      source: "Owner-approved source",
    }));
    expect(created.status).toBe(201);
    const draft = (await created.json()).draft;

    const before = await handleKairosKnowledgeObjectRequest(state, request("/registry/kairos-knowledge/search", { query: "controlled doctrine", department: "executive" }));
    expect((await before.json()).results).toHaveLength(0);

    const approved = await handleKairosKnowledgeLifecycleObjectRequest(state, request(`/registry/kairos-knowledge/lifecycle/approve/${draft.draftId}`, {
      confirmation: "APPROVE KNOWLEDGE RECORD",
      approvedBy: "owner@example.com",
    }));
    expect(approved.status).toBe(200);
    expect((await approved.json()).record.status).toBe("active");

    const after = await handleKairosKnowledgeObjectRequest(state, request("/registry/kairos-knowledge/search", { query: "controlled doctrine", department: "executive" }));
    const results = (await after.json()).results;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("controlled-doctrine");
    expect(results[0].version).toBe(1);
  });

  it("retires records and preserves lifecycle history", async () => {
    const storage = createStorage();
    const state = { storage };
    const created = await handleKairosKnowledgeLifecycleObjectRequest(state, request("/registry/kairos-knowledge/lifecycle/drafts", {
      confirmation: "CREATE KNOWLEDGE DRAFT",
      recordId: "retirement-test",
      title: "Retirement test",
      department: "publishing",
      content: "Temporary publishing doctrine for lifecycle verification.",
      source: "Lifecycle test source",
    }));
    const draft = (await created.json()).draft;
    await handleKairosKnowledgeLifecycleObjectRequest(state, request(`/registry/kairos-knowledge/lifecycle/approve/${draft.draftId}`, {
      confirmation: "APPROVE KNOWLEDGE RECORD",
      approvedBy: "owner@example.com",
    }));
    const retired = await handleKairosKnowledgeLifecycleObjectRequest(state, request("/registry/kairos-knowledge/lifecycle/retire/retirement-test", {
      confirmation: "RETIRE KNOWLEDGE RECORD",
      retiredBy: "owner@example.com",
      reason: "Superseded by a newer doctrine.",
    }));
    expect((await retired.json()).record.status).toBe("retired");

    const search = await handleKairosKnowledgeObjectRequest(state, request("/registry/kairos-knowledge/search", { query: "temporary publishing doctrine", department: "publishing" }));
    expect((await search.json()).results).toHaveLength(0);

    const history = await handleKairosKnowledgeLifecycleObjectRequest(state, request("/registry/kairos-knowledge/lifecycle/history/retirement-test", null, "GET"));
    const events = (await history.json()).history.map((item) => item.event);
    expect(events).toEqual(["draft_created", "record_approved", "record_retired"]);
  });
});
