// @ts-nocheck
import { describe, expect, it } from "vitest";
import { handleKairosToolApprovalAPI, handleKairosToolApprovalObjectRequest } from "../cloudflare/mmg-ios/src/kairos-tool-approval-v1.js";

function storage() { const map = new Map(); return { async get(k){ return map.get(k); }, async put(k,v){ map.set(k,v); }, map }; }
function env(state) { const stub = { fetch: (request) => handleKairosToolApprovalObjectRequest(state, request) }; return { KAIROS_API_ACCESS_TOKEN: "service-secret", KAIROS_PROJECTS: { idFromName: () => "registry", get: () => stub } }; }
function request(path, body, token = "service-secret") { return new Request(`https://kairos.test${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); }

describe("Kairos governed tool approval", () => {
  it("rejects unregistered tools", async () => {
    const state = { storage: storage() };
    const response = await handleKairosToolApprovalAPI(request("/api/kairos/tools/propose", { toolId: "unknown.tool", arguments: {} }), env(state));
    expect(response.status).toBe(403);
  });

  it("creates an identity-bound approval and blocks replay", async () => {
    const state = { storage: storage() };
    const runtimeEnv = env(state);
    const proposed = await handleKairosToolApprovalAPI(request("/api/kairos/tools/propose", { toolId: "shopify.product.update", arguments: { productId: "gid://shopify/Product/1", title: "Approved title" } }), runtimeEnv);
    expect(proposed.status).toBe(202);
    const proposal = await proposed.json();
    expect(proposal.approvalId).toMatch(/^kap_/);

    const executed = await handleKairosToolApprovalAPI(request("/api/kairos/tools/continue", { approvalId: proposal.approvalId, confirmation: `APPROVE ${proposal.approvalId}` }), runtimeEnv, async ({ arguments: args }) => ({ updated: true, productId: args.productId }));
    expect(executed.status).toBe(200);
    expect((await executed.json()).verified).toBe(true);

    const replay = await handleKairosToolApprovalAPI(request("/api/kairos/tools/continue", { approvalId: proposal.approvalId, confirmation: `APPROVE ${proposal.approvalId}` }), runtimeEnv, async () => ({}));
    expect(replay.status).toBe(409);
  });

  it("requires exact confirmation and the same authenticated identity", async () => {
    const state = { storage: storage() };
    const runtimeEnv = env(state);
    const proposed = await handleKairosToolApprovalAPI(request("/api/kairos/tools/propose", { toolId: "shopify.product.publish", arguments: { productId: "gid://shopify/Product/1" } }), runtimeEnv);
    const proposal = await proposed.json();
    const wrongConfirmation = await handleKairosToolApprovalAPI(request("/api/kairos/tools/continue", { approvalId: proposal.approvalId, confirmation: "APPROVE" }), runtimeEnv, async () => ({}));
    expect(wrongConfirmation.status).toBe(400);
    const wrongIdentity = await handleKairosToolApprovalAPI(new Request("https://kairos.test/api/kairos/tools/continue", { method: "POST", headers: { "content-type": "application/json", "cf-access-authenticated-user-email": "other@example.com" }, body: JSON.stringify({ approvalId: proposal.approvalId, confirmation: `APPROVE ${proposal.approvalId}` }) }), runtimeEnv, async () => ({}));
    expect(wrongIdentity.status).toBe(403);
  });
});
