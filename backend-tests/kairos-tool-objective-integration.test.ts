// @ts-nocheck
import { describe, expect, it } from "vitest";
import { handleToolAwareKairosObjective } from "../cloudflare/mmg-ios/src/kairos-tool-objective-integration-v1.js";
import fs from "node:fs";

function request(body) {
  return new Request("https://kairos.test/api/kairos", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer service-secret" },
    body: JSON.stringify(body),
  });
}

function approvalEnv() {
  const map = new Map();
  const storage = { async get(key){ return map.get(key); }, async put(key, value){ map.set(key, value); } };
  return {
    KAIROS_API_ACCESS_TOKEN: "service-secret",
    KAIROS_PROJECTS: {
      idFromName: () => "registry",
      get: () => ({ fetch: async (internalRequest) => {
        const { handleKairosToolApprovalObjectRequest } = await import("../cloudflare/mmg-ios/src/kairos-tool-approval-v1.js");
        return handleKairosToolApprovalObjectRequest({ storage }, internalRequest);
      } }),
    },
  };
}

describe("Kairos tool-aware objective integration", () => {
  it("injects and returns verified read-only tool evidence", async () => {
    const response = await handleToolAwareKairosObjective(request({
      objective: "Summarize the MMG governance foundation.",
      toolRequest: { toolId: "knowledge.search", arguments: { query: "governance approval production" } },
    }), {}, async (enrichedRequest) => {
      const body = await enrichedRequest.json();
      expect(body.context).toContain("VERIFIED GOVERNED TOOL EVIDENCE");
      return new Response(JSON.stringify({ success: true, status: "completed", message: "Grounded response", actions: [], requiresApproval: false }), { headers: { "content-type": "application/json" } });
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.toolEvidence[0].verified).toBe(true);
    expect(body.toolEvidence[0].toolId).toBe("knowledge.search");
  });

  it("creates a reviewable mutation proposal without enabling continuation", async () => {
    const response = await handleToolAwareKairosObjective(request({
      objective: "Update the Shopify title.",
      toolRequest: { toolId: "shopify.product.update", arguments: { productId: "gid://shopify/Product/1", changes: { title: "Approved title" } } },
    }), approvalEnv(), async () => { throw new Error("provider must not run for mutation proposals"); });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.requiresApproval).toBe(true);
    expect(body.actions[0].executorAvailable).toBe(false);
    expect(body.actions[0].confirmationRequired).toMatch(/^APPROVE kap_/);
  });

  it("renders verified evidence and disabled approval continuation in the dashboard", () => {
    const source = fs.readFileSync("web/kairos-dashboard/scripts/objective-controller-v2.js", "utf8");
    expect(source).toContain("Verified tool evidence");
    expect(source).toContain("Continuation is disabled because no production executor is connected");
    expect(source).toContain('disabled aria-disabled="true"');
  });
});
